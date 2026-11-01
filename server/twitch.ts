import WebSocket from 'ws';
import { SupportStore } from './support';
import { validTimeout } from '../shared/moderation';
import type { ChatEvent, TwitchStatus, ModerationAction, SupportData } from '../shared/types';

export interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
interface Tokens { access_token: string; refresh_token: string; expires_in: number }
interface Identity { client_id: string; user_id: string; login: string; scopes: string[]; expires_in: number }
interface Dependencies {
  fetch: typeof fetch;
  socket: (url: string) => WebSocket;
}
const defaultDependencies: Dependencies = { fetch, socket: url => new WebSocket(url) };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

/** Only accepts the chat subscription shape; source IDs are namespaced away from simulations. */
export function chatEvent(payload: unknown, timestamp: unknown): ChatEvent | undefined {
  const data = record(payload), event = record(data.event), subscription = record(data.subscription);
  if (subscription.type !== 'channel.chat.message') return;
  const message = record(event.message), reply = record(event.reply);
  const id = text(event.message_id), userId = text(event.chatter_user_id);
  if (!id || !userId || typeof message.text !== 'string') return;
  const mentions: string[] = [], targetNames: Record<string, string> = {};
  for (const item of Array.isArray(message.fragments) ? message.fragments : []) {
    const fragment = record(item), mention = record(fragment.mention);
    if (fragment.type === 'mention' && text(mention.user_id)) {
      const target = `twitch:${mention.user_id}`;
      mentions.push(target);
      targetNames[target] = text(mention.user_name) || text(mention.user_login) || text(mention.user_id);
    }
  }
  const parent = text(reply.parent_user_id);
  if (parent) targetNames[`twitch:${parent}`] = text(reply.parent_user_name) || text(reply.parent_user_login) || parent;
  const ts = Date.parse(text(timestamp));
  return {
    id: `twitch:${id}`, userId: `twitch:${userId}`,
    userName: text(event.chatter_user_name) || text(event.chatter_user_login) || userId,
    text: message.text, mentions: [...new Set(mentions)],
    replyToUserId: parent ? `twitch:${parent}` : undefined,
    targetNames, ts: Number.isFinite(ts) ? ts : Date.now(), simulated: false,
  };
}

export function authorizationUrl(config: TwitchConfig, state: string): string {
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: 'user:read:chat moderator:manage:banned_users channel:read:subscriptions', state,
  }).toString();
  return url.toString();
}

export class TwitchConnection {
  private tokens?: Tokens;
  private identity?: Identity;
  private state: TwitchStatus = { phase: 'disconnected' };
  private sockets = new Set<WebSocket>();
  private current?: WebSocket;
  private watchdog?: ReturnType<typeof setTimeout>;
  private retry?: ReturnType<typeof setTimeout>;
  private validation?: ReturnType<typeof setInterval>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private refreshing?: Promise<void>;
  private generation = 0;
  private attempts = 0;
  private support = new SupportStore();
  private supportLoading?:Promise<void>;

  constructor(
    private config: TwitchConfig,
    private ingest: (event: ChatEvent) => void,
    private changed: () => void,
    private dependencies = defaultDependencies,
  ) {}

  status(): TwitchStatus { return { ...this.state, canModerate: Boolean(this.tokens && this.identity?.scopes.includes('moderator:manage:banned_users')), canReadSubscriptions:Boolean(this.tokens&&this.identity?.scopes.includes('channel:read:subscriptions')) }; }
  private update(phase: TwitchStatus['phase'], error?: string) {
    this.state = { phase, login: this.identity?.login, userId: this.identity ? `twitch:${this.identity.user_id}` : undefined, error };
    this.changed();
  }
  private async request(url: string, init?: RequestInit): Promise<Response> {
    return this.dependencies.fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  }
  async authorize(code: string) {
    this.disconnect();
    const generation = this.generation;
    this.update('connecting');
    try {
      const response = await this.request('https://id.twitch.tv/oauth2/token', {
        method: 'POST', body: new URLSearchParams({
          client_id: this.config.clientId, client_secret: this.config.clientSecret,
          code, grant_type: 'authorization_code', redirect_uri: this.config.redirectUri,
        }),
      });
      if (!response.ok) throw new Error('OAuth exchange failed');
      const tokens = await response.json() as Tokens;
      if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new Error('Invalid token response');
      if (generation !== this.generation) return;
      this.tokens = tokens;
      await this.validate(generation);
      if (generation !== this.generation) return;
      this.planRefresh();
      this.validation = setInterval(() => void this.validate(generation).catch(() => { if (generation === this.generation) this.fail('Twitch authorization ended. Connect again.'); }), 55 * 60_000);
      this.open('wss://eventsub.wss.twitch.tv/ws', false, generation);
    } catch {
      if (generation === this.generation) this.fail('Could not connect to Twitch. Check your app credentials and redirect URL, then try again.');
      throw new Error('Twitch sign-in failed');
    }
  }
  private async validate(generation: number) {
    if (!this.tokens) throw new Error('Not authorized');
    const response = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.access_token}` } });
    if (!response.ok) throw new Error('Token validation failed');
    const identity = await response.json() as Identity;
    if (identity.client_id !== this.config.clientId || !identity.user_id || !identity.login || !identity.scopes?.includes('user:read:chat')) throw new Error('Missing authorization');
    if (generation === this.generation) this.identity = identity;
  }
  private planRefresh() {
    clearTimeout(this.refreshTimer);
    if (!this.tokens) return;
    const generation = this.generation;
    this.refreshTimer = setTimeout(() => void this.refresh().catch(() => { if (generation === this.generation) this.fail('Twitch session expired. Connect again.'); }), Math.max(10_000, (this.tokens.expires_in - 120) * 1000));
  }
  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation, token = this.tokens?.refresh_token;
    const work = async () => {
      if (!token) throw new Error('No refresh token');
      const response = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({
        client_id: this.config.clientId, client_secret: this.config.clientSecret,
        grant_type: 'refresh_token', refresh_token: token,
      }) });
      if (!response.ok) throw new Error('Refresh failed');
      const tokens = await response.json() as Tokens;
      if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new Error('Invalid refresh response');
      if (generation !== this.generation) return;
      this.tokens = tokens;
      await this.validate(generation);
      this.planRefresh();
    };
    this.refreshing = work().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  async moderate(userId: string, action: ModerationAction, duration?: number, reason='Reviewed by the broadcaster in ModMap'): Promise<void> {
    if (action === 'timeout' && !validTimeout(duration)) throw new Error('Timeout must be a whole number of seconds from 1 to 1209600.');
    if (!this.tokens || !this.identity) throw new Error('Connect Twitch before moderating.');
    if (!this.identity.scopes.includes('moderator:manage:banned_users')) throw new Error('Reconnect Twitch to grant ban and unban permission.');
    if (!userId.startsWith('twitch:') || userId.length <= 7 || userId.slice(7) === this.identity.user_id) throw new Error('Select another real Twitch chatter.');
    const generation = this.generation;
    const target = userId.slice(7);
    const query = new URLSearchParams({ broadcaster_id: this.identity.user_id, moderator_id: this.identity.user_id });
    if (action === 'unban') query.set('user_id', target);
    const call = () => this.request(`https://api.twitch.tv/helix/moderation/bans?${query}`, {
      method: action === 'unban' ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${this.tokens!.access_token}`, 'Client-Id': this.config.clientId, 'Content-Type': 'application/json' },
      ...(action !== 'unban' ? { body: JSON.stringify({ data: { user_id: target, reason:reason.slice(0,500), ...(action === 'timeout' ? {duration} : {}) } }) } : {}),
    });
    let response: Response;
    try {
      response = await call();
      if (response.status === 401) {
        await this.refresh();
        if (generation !== this.generation) throw new Error();
        response = await call();
      }
    } catch { throw new Error('Could not confirm the action. Check Twitch before retrying.'); }
    if (generation !== this.generation) throw new Error('Twitch session changed. Check Twitch to confirm the result.');
    if (response.status === (action === 'unban' ? 204 : 200)) return;
    const errors: Record<number, string> = {
      400: action === 'timeout' ? 'Twitch rejected the timeout. This user may already be banned or cannot be timed out.' : action === 'ban' ? 'Twitch rejected the ban. This user may already be banned or cannot be banned.' : 'Twitch rejected the unban. This user may not currently be banned.',
      401: 'Twitch authorization expired. Reconnect Twitch.',
      403: 'Twitch denied moderation permission for this channel.',
      409: 'Another moderation action is in progress for this user. Try again shortly.',
      429: 'Twitch rate limit reached. Wait before trying again.',
    };
    throw new Error(errors[response.status] ?? 'Twitch could not confirm this action. Check Twitch before retrying.');
  }
  supportSnapshot(ids:string[]):SupportData {return this.support.snapshot(ids);}
  private async supportRequest(url:string,init:RequestInit,generation:number):Promise<Response>{
    const call=()=>this.request(url,{...init,headers:{...init.headers,Authorization:`Bearer ${this.tokens!.access_token}`,'Client-Id':this.config.clientId}});
    let response=await call();
    if(response.status===401){await this.refresh();if(generation!==this.generation)throw new Error('Session changed');response=await call();}
    if(generation!==this.generation)throw new Error('Session changed');
    return response;
  }
  async refreshSupport():Promise<void>{
    if(this.supportLoading)return this.supportLoading;
    if(!this.status().canReadSubscriptions)return;
    const generation=this.generation,store=this.support;
    const work=async()=>{
      store.loading();this.changed();
      try{
        const rows:{user_id:string;is_gift:boolean;tier:string;gifter_id?:string}[]=[];
        let cursor:string|undefined;const cursors=new Set<string>();
        for(let page=0;page<100;page++){
          const query=new URLSearchParams({broadcaster_id:this.identity!.user_id,first:'100'});if(cursor)query.set('after',cursor);
          const response=await this.supportRequest(`https://api.twitch.tv/helix/subscriptions?${query}`,{},generation);
          if(!response.ok)throw new Error();
          const data=await response.json() as {data:typeof rows;pagination?:{cursor?:string}};
          if(!Array.isArray(data.data))throw new Error();rows.push(...data.data);
          cursor=data.pagination?.cursor;
          if(!cursor){if(generation===this.generation){store.replace(rows);this.changed();}return;}
          if(cursors.has(cursor))throw new Error();cursors.add(cursor);
        }
        throw new Error();
      }catch{if(generation===this.generation){store.unavailable('Active subscription lookup unavailable or incomplete. Unknown counts are not zero; chat and moderation still work.');this.changed();}}
    };
    const pending=work().finally(()=>{if(this.supportLoading===pending)this.supportLoading=undefined;});
    this.supportLoading=pending;return pending;
  }
  private async startSupport(sessionId:string,generation:number){
    if(!this.status().canReadSubscriptions)return;
    const store=this.support;
    try{
      const response=await this.supportRequest('https://api.twitch.tv/helix/eventsub/subscriptions',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'channel.subscription.gift',version:'1',condition:{broadcaster_user_id:this.identity!.user_id},transport:{method:'websocket',session_id:sessionId}}),
      },generation);
      if(generation!==this.generation)return;
      store.tracking(response.status===202);
    }catch{if(generation===this.generation)store.tracking(false);}
    if(generation===this.generation){this.changed();void this.refreshSupport();}
  }
  private async subscribe(sessionId: string, generation: number) {
    const call = () => this.request('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${this.tokens!.access_token}`, 'Client-Id': this.config.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: {
        broadcaster_user_id: this.identity!.user_id, user_id: this.identity!.user_id,
      }, transport: { method: 'websocket', session_id: sessionId } }),
    });
    let response = await call();
    if (response.status === 401) { await this.refresh(); if (generation !== this.generation) return; response = await call(); }
    if (generation !== this.generation) return;
    if (response.status === 401 || response.status === 403) { this.fail('Chat permission was denied. Connect Twitch again.'); return; }
    if (response.status !== 202) throw new Error('Subscription failed');
    this.attempts = 0;
    this.update('connected');
    void this.startSupport(sessionId,generation);
  }
  private open(url: string, transferred: boolean, generation: number) {
    if (generation !== this.generation || !this.tokens) return;
    const previous = this.current, socket = this.dependencies.socket(url);
    this.sockets.add(socket);
    let welcomed = false;
    const welcomeTimeout = setTimeout(() => socket.terminate(), 15_000);
    let keepalive = 15_000;
    const watch = () => {
      if (this.current !== socket) return;
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => socket.terminate(), keepalive + 2000);
    };
    if (!transferred) this.current = socket;
    socket.on('message', raw => {
      if (generation !== this.generation) return;
      let frame: Record<string, unknown>;
      try { frame = record(JSON.parse(raw.toString())); } catch { return; }
      const metadata = record(frame.metadata), payload = record(frame.payload), session = record(payload.session);
      const type = metadata.message_type;
      if (type === 'session_welcome') {
        clearTimeout(welcomeTimeout);
        if (!text(session.id)) { socket.terminate(); return; }
        welcomed = true;
        if (typeof session.keepalive_timeout_seconds === 'number') keepalive = session.keepalive_timeout_seconds * 1000;
        this.current = socket;
        watch();
        if (transferred) { previous?.close(); this.attempts = 0; this.update('connected'); }
        else void this.subscribe(text(session.id), generation).catch(() => { if (generation === this.generation) socket.terminate(); });
      } else if (type === 'session_keepalive') watch();
      else if (type === 'notification') {
        watch();
        const subscription=record(payload.subscription),source=record(payload.event);
        if(subscription.type==='channel.subscription.gift'&&source.broadcaster_user_id===this.identity?.user_id){
          const timestamp=Date.parse(text(metadata.message_timestamp));
          this.support.gift(text(metadata.message_id),source,Number.isFinite(timestamp)?timestamp:Date.now());this.changed();
        }
        const event = chatEvent(payload, metadata.message_timestamp);
        if (event && record(payload.event).broadcaster_user_id === this.identity?.user_id) this.ingest(event);
      } else if (type === 'session_reconnect') {
        watch();
        try {
          const next = new URL(text(session.reconnect_url));
          if (next.protocol !== 'wss:' || next.hostname !== 'eventsub.wss.twitch.tv' || next.port || next.username || next.password) throw new Error('Invalid reconnect');
          this.update('reconnecting');
          this.open(next.toString(), true, generation);
        } catch { socket.terminate(); }
      } else if (type === 'revocation') {
        if(record(payload.subscription).type==='channel.subscription.gift'){this.support.tracking(false);this.changed();}
        else this.fail('Twitch revoked the chat subscription. Connect again.');
      }
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(welcomeTimeout);
      this.sockets.delete(socket);
      if (generation !== this.generation) return;
      if (this.current === socket || (transferred && !welcomed)) {
        clearTimeout(this.watchdog);
        for (const open of this.sockets) open.terminate();
        this.sockets.clear();
        this.current = undefined;
        if (!this.retry) {
          this.update('reconnecting', 'Chat connection interrupted; retrying. Messages during the gap may be missed.');
          this.retry = setTimeout(() => { this.retry = undefined; this.open('wss://eventsub.wss.twitch.tv/ws', false, generation); }, Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)));
        }
      }
    });
  }
  private fail(message: string) { this.disconnect(); this.update('error', message); }
  disconnect() {
    this.generation++;
    clearTimeout(this.watchdog); clearTimeout(this.retry); clearTimeout(this.refreshTimer); clearInterval(this.validation);
    this.retry = undefined; this.refreshing = undefined; this.supportLoading=undefined;this.support=new SupportStore();
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear(); this.current = undefined; this.tokens = undefined; this.identity = undefined; this.attempts = 0;
    this.update('disconnected');
  }
}
