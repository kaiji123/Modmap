import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { authorizationUrl, chatEvent, TwitchConnection } from './twitch';
import { localHost, localOrigin, sessionCookie, validState } from './security';
import type { ChatEvent } from '../shared/types';

const config = { clientId: 'test-client', clientSecret: 'test-secret', redirectUri: 'http://localhost:3000/auth/callback' };
const payload = {
  subscription: { type: 'channel.chat.message' },
  event: { message_id: 'message-1', broadcaster_user_id: 'channel', chatter_user_id: 'viewer', chatter_user_name: 'Viewer',
    message: { text: '@Kai hello', fragments: [{ type: 'mention', mention: { user_id: 'channel', user_name: 'Kai' } }] },
    reply: { parent_user_id: 'channel', parent_user_name: 'Kai' } },
};
const identity = { client_id: config.clientId, user_id: 'channel', login: 'kai', scopes: ['user:read:chat'], expires_in: 3600 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
class FakeSocket extends EventEmitter {
  closed = false;
  terminate() { if (!this.closed) { this.closed = true; queueMicrotask(() => this.emit('close')); } }
  close() { this.terminate(); }
  frame(type: string, data: unknown, id='test-event') { this.emit('message', Buffer.from(JSON.stringify({ metadata: { message_id:id, message_type: type, message_timestamp: '2026-11-01T21:00:00Z' }, payload: data }))); }
  welcome(id = 'session-1') { this.frame('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } }); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('authorization uses code flow and chat/moderation scopes without client secret', () => {
  const url = new URL(authorizationUrl(config, 'random-state'));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'user:read:chat moderator:manage:banned_users channel:read:subscriptions');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.searchParams.get('state'), 'random-state');
  assert.ok(!url.toString().includes(config.clientSecret));
});
test('rejects missing or mismatched OAuth state and untrusted browser origins', () => {
  assert.equal(validState('known', 'known'), true);
  assert.equal(validState('known', 'other'), false);
  assert.equal(validState(undefined, undefined), false);
  assert.equal(validState('known', ['known']), false);
  assert.equal(localOrigin('https://attacker.example'), false);
  assert.equal(localOrigin('http://localhost:3000'), true);
  assert.equal(localHost('localhost.attacker.example:3000'), false);
  assert.equal(sessionCookie('other=x; modmap_session=abc; last=y'), 'abc');
});
test('maps Twitch replies and mention identities into non-simulated events', () => {
  const event = chatEvent(payload, '2026-11-01T21:00:00Z')!;
  assert.equal(event.simulated, false);
  assert.equal(event.userId, 'twitch:viewer');
  assert.equal(event.replyToUserId, 'twitch:channel');
  assert.deepEqual(event.mentions, ['twitch:channel']);
  assert.equal(event.targetNames?.['twitch:channel'], 'Kai');
  assert.equal(event.ts, Date.parse('2026-11-01T21:00:00Z'));
  assert.equal(chatEvent({ subscription: { type: 'channel.raid' }, event: payload.event }, ''), undefined);
  assert.equal(chatEvent({ subscription: payload.subscription, event: {} }, ''), undefined);
});
test('OAuth exchange, subscription, notification and transferred reconnect', async () => {
  const sockets: FakeSocket[] = [], requests: { url: string; init?: RequestInit }[] = [], events: ChatEvent[] = [];
  const connection = new TwitchConnection(config, event => events.push(event), () => {}, {
    fetch: (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith('/token')) return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
      if (String(url).endsWith('/validate')) return json(identity);
      return json({ data: [] }, 202);
    }) as typeof fetch,
    socket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; },
  });
  try {
    await connection.authorize('test-code');
    sockets[0].welcome(); await settle();
    assert.equal(connection.status().phase, 'connected');
    const subscription = JSON.parse(requests.find(r => r.url.includes('/subscriptions'))!.init!.body as string);
    assert.deepEqual(subscription.condition, { broadcaster_user_id: 'channel', user_id: 'channel' });
    assert.equal(subscription.transport.session_id, 'session-1');
    sockets[0].frame('notification', payload);
    assert.equal(events.length, 1);
    sockets[0].frame('notification', { ...payload, event: { ...payload.event, broadcaster_user_id: 'other' } });
    assert.equal(events.length, 1);
    sockets[0].frame('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=example' } });
    assert.equal(sockets.length, 2);
    assert.equal(sockets[0].closed, false);
    sockets[1].welcome('session-2'); await settle();
    assert.equal(sockets[0].closed, true);
    assert.equal(connection.status().phase, 'connected');
    assert.equal(requests.filter(r => r.url.includes('/subscriptions')).length, 1);
    assert.ok(!JSON.stringify(connection.status()).includes('access'));
    sockets[1].frame('revocation', {});
    assert.equal(connection.status().phase, 'error');
    assert.ok(sockets[1].closed);
  } finally { connection.disconnect(); }
});
test('refreshes once after subscription 401 and uses refreshed authorization', async () => {
  let count = 0, socket: FakeSocket | undefined;
  const tokens: string[] = [];
  const connection = new TwitchConnection(config, () => {}, () => {}, {
    fetch: (async (url, init) => {
      if (String(url).endsWith('/token')) { const refreshed = (init!.body as URLSearchParams).get('grant_type') === 'refresh_token'; return json({ access_token: refreshed ? 'new-access' : 'old-access', refresh_token: 'refresh', expires_in: 3600 }); }
      if (String(url).endsWith('/validate')) return json(identity);
      tokens.push((init!.headers as Record<string, string>).Authorization);
      return ++count === 1 ? json({}, 401) : json({}, 202);
    }) as typeof fetch,
    socket: () => { socket = new FakeSocket(); return socket as unknown as WebSocket; },
  });
  try {
    await connection.authorize('test-code'); socket!.welcome();
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(connection.status().phase, 'connected');
    assert.deepEqual(tokens, ['Bearer old-access', 'Bearer new-access']);
  } finally { connection.disconnect(); }
});
test('rejects mismatched token identity and sanitizes OAuth errors', async () => {
  const connection = new TwitchConnection(config, () => {}, () => {}, {
    fetch: (async url => String(url).endsWith('/token') ? json({ access_token: 'do-not-expose', refresh_token: 'secret', expires_in: 3600 }) : json({ ...identity, client_id: 'wrong' })) as typeof fetch,
    socket: () => { throw new Error('Must not connect'); },
  });
  await assert.rejects(connection.authorize('code'), /Twitch sign-in failed/);
  assert.equal(connection.status().phase, 'error');
  assert.ok(!JSON.stringify(connection.status()).includes('do-not-expose'));
  connection.disconnect();
});

test('ban and unban use channel-bound credentials and reject simulation/self targets', async () => {
  const calls: {url:string;init?:RequestInit}[] = [];
  const connection = new TwitchConnection(config, () => {}, () => {}, {
    fetch: (async (url,init) => {
      calls.push({url:String(url),init});
      if (String(url).endsWith('/token')) return json({access_token:'secret-access',refresh_token:'refresh',expires_in:3600});
      if (String(url).endsWith('/validate')) return json({...identity,scopes:['user:read:chat','moderator:manage:banned_users']});
      return init?.method === 'DELETE' ? new Response(null,{status:204}) : json({data:[{}]});
    }) as typeof fetch,
    socket: () => new FakeSocket() as unknown as WebSocket,
  });
  try {
    await connection.authorize('code');
    assert.equal(connection.status().canModerate,true);
    await assert.rejects(connection.moderate('sim:viewer','ban'), /real Twitch chatter/);
    await assert.rejects(connection.moderate('twitch:channel','ban'), /real Twitch chatter/);
    assert.equal(calls.filter(c=>c.url.includes('/moderation/')).length,0);
    await connection.moderate('twitch:viewer','ban');
    await connection.moderate('twitch:viewer','unban');
    const [ban,unban]=calls.filter(c=>c.url.includes('/moderation/'));
    const query=new URL(ban.url).searchParams;
    assert.equal(query.get('broadcaster_id'),'channel');
    assert.equal(query.get('moderator_id'),'channel');
    assert.equal(ban.init?.method,'POST');
    const body=JSON.parse(ban.init?.body as string);
    assert.equal(body.data.user_id,'viewer');
    assert.equal(body.data.duration,undefined);
    assert.equal(unban.init?.method,'DELETE');
    assert.equal(new URL(unban.url).searchParams.get('user_id'),'viewer');
    assert.equal(unban.init?.body,undefined);
  } finally {connection.disconnect();}
});
test('read-only sessions cannot make moderation requests', async () => {
  const connection = new TwitchConnection(config,()=>{},()=>{}, {
    fetch:(async url=>String(url).endsWith('/token')?json({access_token:'access',refresh_token:'refresh',expires_in:3600}):json(identity)) as typeof fetch,
    socket:()=>new FakeSocket() as unknown as WebSocket,
  });
  try {
    await connection.authorize('code');
    assert.equal(connection.status().canModerate,false);
    await assert.rejects(connection.moderate('twitch:viewer','ban'),/grant ban and unban permission/);
  } finally {connection.disconnect();}
});
test('Twitch moderation errors are actionable and are never reported as success', async () => {
  let result=429;
  const connection = new TwitchConnection(config,()=>{},()=>{}, {
    fetch:(async url=>{
      if(String(url).endsWith('/token'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600});
      if(String(url).endsWith('/validate'))return json({...identity,scopes:['user:read:chat','moderator:manage:banned_users']});
      return json({message:'upstream error'},result);
    }) as typeof fetch,
    socket:()=>new FakeSocket() as unknown as WebSocket,
  });
  try {
    await connection.authorize('code');
    await assert.rejects(connection.moderate('twitch:viewer','ban'),/rate limit/);
    result=403;
    await assert.rejects(connection.moderate('twitch:viewer','ban'),/denied moderation/);
    result=400;
    await assert.rejects(connection.moderate('twitch:viewer','unban'),/may not currently be banned/);
  }finally{connection.disconnect();}
});

test('timeouts send a validated duration and unban can end them early',async()=>{
 const requests:{url:string;init?:RequestInit}[]=[];
 const connection=new TwitchConnection(config,()=>{},()=>{}, {
  fetch:(async(url,init)=>{
   if(String(url).endsWith('/token'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600});
   if(String(url).endsWith('/validate'))return json({...identity,scopes:['user:read:chat','moderator:manage:banned_users']});
   requests.push({url:String(url),init});
   return init?.method==='DELETE'?new Response(null,{status:204}):json({data:[{}]});
  }) as typeof fetch,
  socket:()=>new FakeSocket() as unknown as WebSocket,
 });
 try{
  await connection.authorize('code');
  for(const duration of [undefined,0,-1,1.5,1209601,NaN])await assert.rejects(connection.moderate('twitch:viewer','timeout',duration),/whole number/);
  assert.equal(requests.length,0);
  await connection.moderate('twitch:viewer','timeout',600);
  assert.equal(requests[0].init?.method,'POST');
  assert.equal(JSON.parse(requests[0].init?.body as string).data.duration,600);
  await connection.moderate('twitch:viewer','unban');
  assert.equal(requests[1].init?.method,'DELETE');
  assert.equal(new URL(requests[1].url).searchParams.get('user_id'),'viewer');
 }finally{connection.disconnect();}
});

test('support lookup paginates and gift events update only their broadcaster',async()=>{
 let socket:FakeSocket|undefined;
 const pages:string[]=[];
 const connection=new TwitchConnection(config,()=>{},()=>{}, {
  fetch:(async(url,init)=>{
   const address=String(url);
   if(address.endsWith('/token'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600});
   if(address.endsWith('/validate'))return json({...identity,scopes:['user:read:chat','channel:read:subscriptions']});
   if(address.includes('/eventsub/'))return json({},202);
   pages.push(address);
   if(!address.includes('after='))return json({data:[{user_id:'recipient',is_gift:true,tier:'1000',gifter_id:'viewer'}],pagination:{cursor:'page-two'}});
   return json({data:[{user_id:'viewer',is_gift:false,tier:'2000'}],pagination:{}});
  }) as typeof fetch,
  socket:()=>{socket=new FakeSocket();return socket as unknown as WebSocket;},
 });
 try{
  await connection.authorize('code');socket!.welcome();for(let i=0;i<8;i++)await settle();
  assert.equal(connection.status().phase,'connected');assert.equal(pages.length,2);
  assert.ok(pages.every(url=>new URL(url).searchParams.get('broadcaster_id')==='channel'));
  let data=connection.supportSnapshot(['twitch:viewer']);
  assert.equal(data.status.phase,'ready');assert.equal(data.status.giftTracking,true);
  assert.equal(data.users[0].currentSubscriber,true);assert.equal(data.users[0].activeGiftedSubs,1);
  const gift={subscription:{type:'channel.subscription.gift'},event:{broadcaster_user_id:'channel',user_id:'viewer',total:3,cumulative_total:15,is_anonymous:false}};
  socket!.frame('notification',gift,'gift-one');socket!.frame('notification',gift,'gift-one');
  socket!.frame('notification',{...gift,event:{...gift.event,broadcaster_user_id:'other'}},'wrong-channel');
  data=connection.supportSnapshot(['twitch:viewer']);
  assert.equal(data.users[0].giftedThisSession,3);assert.equal(data.users[0].reportedTotalGifted,15);
  socket!.frame('revocation',{subscription:{type:'channel.subscription.gift'}});
  assert.equal(connection.status().phase,'connected');assert.equal(connection.supportSnapshot([]).status.giftTracking,false);
  connection.disconnect();assert.equal(connection.supportSnapshot(['twitch:viewer']).users[0].reportedTotalGifted,undefined);
 }finally{connection.disconnect();}
});
test('unavailable subscription data never prevents chat from connecting',async()=>{
 let socket:FakeSocket|undefined;
 const connection=new TwitchConnection(config,()=>{},()=>{}, {
  fetch:(async(url,init)=>{
   if(String(url).endsWith('/token'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600});
   if(String(url).endsWith('/validate'))return json({...identity,scopes:['user:read:chat','channel:read:subscriptions']});
   if(String(url).includes('/eventsub/'))return json({},JSON.parse(init!.body as string).type==='channel.chat.message'?202:403);
   return json({},403);
  }) as typeof fetch,
  socket:()=>{socket=new FakeSocket();return socket as unknown as WebSocket;},
 });
 try{
  await connection.authorize('code');socket!.welcome();for(let i=0;i<8;i++)await settle();
  assert.equal(connection.status().phase,'connected');
  const data=connection.supportSnapshot(['twitch:viewer']);
  assert.equal(data.status.phase,'unavailable');assert.equal(data.users[0].activeGiftedSubs,undefined);
 }finally{connection.disconnect();}
});
