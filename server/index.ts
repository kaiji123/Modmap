import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { Engine } from '../shared/engine';
import { validTimeout } from '../shared/moderation';
import { Simulation } from './simulation';
import {AutoBan} from './autoban';
import {simulatedSupport} from './support';
import { seedLines, raidLines, scenarioEvent } from './scenario';
import type { ChatEvent, Snapshot, ModerationEntry, ModerationAction, ModerationResult } from '../shared/types';
import { authorizationUrl, TwitchConnection, type TwitchConfig } from './twitch';
import { localHost, localOrigin, sessionCookie, validState } from './security';

const app = express(), http = createServer(app);
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!localHost(req.headers.host) || !localOrigin(req.headers.origin)) { res.sendStatus(403); return; }
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.path.startsWith('/auth') || req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});
const io = new Server(http, { allowRequest: (req, done) => done(null, localHost(req.headers.host) && localOrigin(req.headers.origin)) });
const config: TwitchConfig = {
  clientId: process.env.TWITCH_CLIENT_ID?.trim() ?? '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET?.trim() ?? '',
  redirectUri: process.env.TWITCH_REDIRECT_URI?.trim() || 'http://localhost:3000/auth/callback',
};
let redirect: URL;
try {
  redirect = new URL(config.redirectUri);
  if (!localHost(redirect.host) || !['http:', 'https:'].includes(redirect.protocol) || redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== '/auth/callback') throw new Error();
} catch { throw new Error('TWITCH_REDIRECT_URI must be a local URL on port 3000 or 3001 with path /auth/callback.'); }
const configured = Boolean(config.clientId && config.clientSecret);
interface Context {
  id: string;
  expires: number;
  simulation: Simulation;
  live: Engine;
  mode: 'simulation' | 'live';
  timer?: ReturnType<typeof setInterval>;
  oauth?: { state: string; expires: number };
  twitch: TwitchConnection;
  moderation: Map<string, ModerationEntry>;
  pending: Set<string>;
  autoBan: {simulation:AutoBan;live:AutoBan};
}
const contexts = new Map<string, Context>();
function snapshot(context: Context): Snapshot {
  const graph=(context.mode==='live'?context.live:context.simulation).snapshot(Date.now(),Boolean(context.timer));
  if(context.mode==='live') for(const node of graph.nodes){
    const action=context.moderation.get(node.id);
    if(!action)continue;
    const active=action.action==='ban'||(action.action==='timeout'&&Date.now()<action.ts+(action.duration??0)*1000);
    if(active&&action.action!=='unban'){node.restriction=action.action; if(action.action==='timeout')node.restrictedUntil=action.ts+(action.duration??0)*1000;}
  }
  const supportIds=[...new Set([...graph.nodes.map(node=>node.id),...(graph.moderation??[]).map(entry=>entry.userId),...context.moderation.keys()])];
  const bans=context.twitch.bannedUsersSnapshot();
  const simulatedBans=(graph.moderation??[]).filter(entry=>entry.action==='ban').map(entry=>({userId:entry.userId,userName:entry.userName,login:entry.userName,createdAt:new Date(entry.ts).toISOString()}));
  return {...graph,autoBan:context.autoBan[context.mode].snapshot(),support:context.mode==='simulation'?simulatedSupport(supportIds):context.twitch.supportSnapshot(supportIds),mode:context.mode,twitch:context.twitch.status(),moderation:context.mode==='simulation'?graph.moderation:[...context.moderation.values()].sort((a,b)=>b.ts-a.ts),bannedUsers:context.mode==='live'?bans.users:simulatedBans,bansUpdatedAt:bans.updatedAt,bansError:context.mode==='live'?bans.error:undefined};
}

function publish(context: Context) { io.to(context.id).emit('snapshot', snapshot(context)); }
function ingest(context: Context, event: ChatEvent) {
  const accepted=(event.simulated ? context.simulation : context.live).ingest(event);
  if(accepted)context.autoBan[event.simulated?'simulation':'live'].observe(event);
  publish(context);
}
function stop(context: Context) { clearInterval(context.timer); context.timer = undefined; }
function seed(context: Context) {
  const now=Date.now();
  seedLines.forEach((line,index)=>context.simulation.ingest(scenarioEvent(line,`seed-${randomUUID()}-${index}`,now)));
}

function dispose(context: Context) { context.autoBan.simulation.pause('Session expired.');context.autoBan.live.pause('Session expired.');stop(context); context.twitch.disconnect(); io.in(context.id).disconnectSockets(); contexts.delete(context.id); }
function getContext(req: Request, res: Response): Context {
  const id = sessionCookie(req.headers.cookie), existing = id ? contexts.get(id) : undefined;
  if (existing && existing.expires > Date.now()) return existing;
  if (existing) dispose(existing);
  if (contexts.size >= 16) throw new Error('Too many local sessions. Restart the server.');
  const context = { id: randomBytes(32).toString('hex'), expires: Date.now() + 8 * 60 * 60_000,
    simulation: new Simulation(), live: new Engine(), mode: 'simulation', moderation: new Map(), pending: new Set() } as Context;
  context.twitch = new TwitchConnection(config, event => ingest(context, event), () => publish(context));
  const makeAuto=(mode:'simulation'|'live')=>new AutoBan({
    mode,broadcaster:()=>context.twitch.status().userId,
    allowed:()=>context.expires>Date.now()&&context.mode===mode&&(mode==='simulation'||Boolean(context.twitch.status().canModerate)),
    support:async(userId)=>{
      if(mode==='simulation')return simulatedSupport([userId]);
      let data=context.twitch.supportSnapshot([userId]);
      if(data.status.phase==='loading'||(data.status.phase==='ready'&&Date.now()-(data.status.updatedAt??0)>30_000)){
        await context.twitch.refreshSupport();data=context.twitch.supportSnapshot([userId]);
      }
      return data;
    },
    ban:(event,word)=>moderateUser(context,mode,event.userId,'ban',undefined,word),
    changed:()=>publish(context),
  });
  context.autoBan={simulation:makeAuto('simulation'),live:makeAuto('live')};
  seed(context); contexts.set(context.id, context);
  res.cookie('modmap_session', context.id, { httpOnly: true, sameSite: 'lax', secure: redirect.protocol === 'https:', maxAge: 8 * 60 * 60_000, path: '/' });
  return context;
}
function switchMode(context:Context,mode:'simulation'|'live'){
  if(context.mode!==mode)context.autoBan[context.mode].pause('Disabled when switching views.');
  context.mode=mode;
}
async function moderateUser(context:Context,mode:'simulation'|'live',userId:string,action:ModerationAction,duration?:number,autoWord?:string):Promise<ModerationResult>{
  if(context.expires<=Date.now()||context.mode!==mode)return {ok:false,error:'The session or view changed. Review the selection again.'};
  if(action==='timeout'&&!validTimeout(duration))return {ok:false,error:'Timeout duration must be 1–1209600 whole seconds.'};
  if(mode==='simulation'){
    try{
      context.simulation.moderate(userId,action,duration,Date.now(),autoWord!==undefined);
      if(action==='unban')context.autoBan.simulation.unban(userId);
      publish(context);return {ok:true,simulated:true};
    }catch(error){return {ok:false,simulated:true,error:error instanceof Error?error.message:'Simulated action failed.'};}
  }
  const status=context.twitch.status();
  if(!status.canModerate)return {ok:false,error:'Reconnect Twitch to grant ban and unban permission.'};
  const node=context.live.snapshot().nodes.find(n=>n.id===userId&&!n.simulated),known=context.moderation.get(userId);
  const listedBan=action==='unban'?context.twitch.bannedUsersSnapshot().users.find(user=>user.userId===userId):undefined;
  if((!node&&!known&&!listedBan)||!userId.startsWith('twitch:')||userId===status.userId)return {ok:false,error:'Select another real Twitch chatter from this session.'};
  if(context.pending.has(userId))return {ok:false,error:'An action for this user is already in progress.'};
  context.pending.add(userId);
  try{
    await context.twitch.moderate(userId,action,duration,autoWord?`ModMap autoban word rule: ${autoWord}`:undefined);
    if(context.twitch.status().userId!==status.userId)throw new Error('Session changed. Check Twitch for the result.');
    context.moderation.set(userId,{userId,userName:node?.name??known?.userName??listedBan?.userName??userId.slice(7),action,...(action==='timeout'?{duration}:{}),ts:Date.now(),automatic:autoWord!==undefined});
    if(action==='unban')context.autoBan.live.unban(userId);
    publish(context);
    void context.twitch.refreshBannedUsers();
    if(action==='timeout')setTimeout(()=>{if(context.expires>Date.now()&&context.mode==='live')publish(context);},duration!*1000);
    return {ok:true};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Could not complete moderation.'};}
  finally{context.pending.delete(userId);}
}
io.use((socket, next) => {
  const id = sessionCookie(socket.request.headers.cookie), context = id ? contexts.get(id) : undefined;
  if (!context || context.expires <= Date.now()) { next(new Error('Session expired. Reload the page.')); return; }
  socket.data.context = context;
  next();
});
io.on('connection', socket => {
  const context = socket.data.context as Context;
  socket.join(context.id);
  socket.emit('snapshot', snapshot(context));
  socket.on('simulate', () => {
    switchMode(context,'simulation');
    if (context.timer) { publish(context); return; }
    let index = 0; const raid = Date.now();
    context.timer = setInterval(() => {
      ingest(context,scenarioEvent(raidLines[index],`raid-${raid}-${index}`,Date.now()));
      index++;
      if (index >= raidLines.length) { stop(context); publish(context); }
    }, 800);
    publish(context);
  });
  socket.on('view', (mode: unknown) => {
    if (mode !== 'simulation' && mode !== 'live') return;
    switchMode(context,mode);
    if (mode === 'live') stop(context);
    publish(context);if(mode==='live')void context.twitch.refreshBannedUsers();
  });
  socket.on('reset', () => {
    context.autoBan[context.mode].reset();
    stop(context);
    if (context.mode === 'simulation') { context.simulation.reset(); seed(context); }
    else context.live.reset();
    publish(context);
  });
  socket.on('reveal', (id: unknown, reply: unknown) => {
    if (typeof id !== 'string' || typeof reply !== 'function') return;
    reply({ text: (context.mode === 'live' ? context.live : context.simulation).reveal(id) });
    publish(context);
  });
  socket.on('moderate', async (payload: unknown, reply: unknown) => {
    if (typeof reply !== 'function') return;
    if (!payload || typeof payload !== 'object') { reply({ok:false,error:'Invalid moderation request.'}); return; }
    const {userId, action, duration, mode} = payload as {userId?:unknown;action?:unknown;duration?:unknown;mode?:unknown};
    if (mode !== context.mode || typeof userId !== 'string' || (action !== 'ban' && action !== 'unban' && action !== 'timeout')) {
      reply({ok:false,error:'The view changed or request is invalid. Review the selection again.'}); return;
    }
    reply(await moderateUser(context,mode as 'simulation'|'live',userId,action,action==='timeout'?duration as number:undefined));
  });
  socket.on('configureAutoBan',(payload:unknown,reply:unknown)=>{
    if(typeof reply!=='function')return;
    if(!payload||typeof payload!=='object'){reply({ok:false,error:'Invalid autoban settings.'});return;}
    const {mode,config}=payload as {mode?:unknown;config?:unknown};
    if(mode!==context.mode){reply({ok:false,error:'View changed. Edit the rule for the current view.'});return;}
    try{context.autoBan[context.mode].configure(config);reply({ok:true});publish(context);}
    catch(error){reply({ok:false,error:error instanceof Error?error.message:'Could not update autoban.'});}
  });
  socket.on('refreshSupport',()=>{if(context.mode==='live')void context.twitch.refreshSupport();});
  socket.on('refreshBans',()=>{if(context.mode==='live')void context.twitch.refreshBannedUsers();});
  socket.on('disconnectTwitch', () => {
    context.autoBan.live.pause('Disabled by Twitch disconnect.');
    context.oauth = undefined; context.twitch.disconnect(); context.live.reset(); context.moderation.clear();
    switchMode(context,'simulation'); publish(context);
  });
});
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'simulation-and-live' }));
app.get('/api/session', (req, res) => {
  const context = getContext(req, res);
  res.json({ configured, loginUrl: `${redirect.origin}/auth/twitch`, twitch: context.twitch.status() });
});
app.get('/auth/twitch', (req, res) => {
  if (!configured) { res.status(503).send('Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env, then restart the server.'); return; }
  if (req.headers.host !== redirect.host) { res.redirect(`${redirect.origin}/auth/twitch`); return; }
  const context = getContext(req, res);
  context.autoBan.live.pause('Disabled while reconnecting Twitch.');
  context.oauth = { state: randomBytes(32).toString('hex'), expires: Date.now() + 10 * 60_000 };
  res.redirect(authorizationUrl(config, context.oauth.state));
});
app.get('/auth/callback', async (req, res) => {
  const id = sessionCookie(req.headers.cookie), context = id ? contexts.get(id) : undefined;
  if (!context || context.expires <= Date.now() || !context.oauth || context.oauth.expires <= Date.now() || !validState(context.oauth.state, req.query.state)) {
    res.status(400).send('Twitch login expired or could not be verified. Return to ModMap and connect again.'); return;
  }
  context.oauth = undefined;
  if (req.query.error || typeof req.query.code !== 'string') { res.redirect('/?twitch=denied'); return; }
  try {
    context.live.reset(); context.moderation.clear();
    await context.twitch.authorize(req.query.code);
    switchMode(context,'live'); stop(context); publish(context);
    res.redirect('/');
  } catch { res.redirect('/?twitch=error'); }
});
app.use(express.static('dist'));
app.use((_error: unknown, _req: Request, res: Response, _next: express.NextFunction) => res.status(500).send('ModMap could not complete this request.'));
setInterval(() => {
  for (const context of contexts.values()) {
    if (context.expires <= Date.now()) dispose(context);
    else publish(context);
  }
}, 1000).unref();
http.listen(3001, '127.0.0.1', () => console.log(`ModMap server: http://127.0.0.1:3001 · Twitch ${configured ? 'configured' : 'not configured'}`));
