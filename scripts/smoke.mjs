import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { request } from 'node:http';
function rawGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, res => { res.resume(); resolve(res); });
    req.on('error', reject); req.end();
  });
}
const base = 'http://127.0.0.1:3000';
assert.equal((await fetch(base)).status, 200);
assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
const session = await fetch(`${base}/api/session`);
const cookie = session.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
assert.equal((await fetch(`${base}/auth/callback?code=ignored&state=bad`, { headers: { Cookie: cookie } })).status, 400);
assert.equal((await fetch(`${base}/api/session`, { headers: { Origin: 'https://attacker.example' } })).status, 403);
assert.equal((await rawGet(`${base}/api/session`, { Host: 'attacker.example:3000' })).statusCode, 403);
const setup = await session.json();
if (setup.configured) {
  const login = await rawGet(`${base}/auth/twitch`, { Cookie: cookie, Host: 'localhost:3000' });
  assert.equal(login.statusCode, 302);
  const url = new URL(login.headers.location);
  assert.equal(url.hostname, 'id.twitch.tv');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'user:read:chat moderator:manage:banned_users channel:read:subscriptions');
  assert.ok(url.searchParams.get('state'));
  assert.ok(!url.searchParams.has('client_secret'));
  const denied = `${base}/auth/callback?error=access_denied&state=${url.searchParams.get('state')}`;
  assert.equal((await rawGet(denied, { Cookie: cookie })).statusCode, 302);
  assert.equal((await rawGet(denied, { Cookie: cookie })).statusCode, 400);
}
const otherSession = await fetch(`${base}/api/session`);
const otherCookie = otherSession.headers.get('set-cookie')?.split(';')[0];
const otherSocket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: otherCookie } });
let otherSnapshot;
otherSocket.on('snapshot', snapshot => { otherSnapshot = snapshot; });
const socket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: cookie } });
let stage = 'seed';
const started = Date.now();
const deadline = setTimeout(() => { console.error('Simulation smoke test timed out'); socket.disconnect(); otherSocket.disconnect(); process.exit(1); }, 15000);
socket.on('snapshot', async snapshot => {
  try {
    if (stage === 'seed') {
      stage = 'raid';
      socket.emit('reset');
      socket.emit('simulate');
    } else if (stage === 'raid' && snapshot.alerts.length) {
      stage = 'reveal';
      socket.emit('moderate', {userId:'sim:Kai',action:'ban',mode:'simulation'}, result=>assert.equal(result.ok,false));
      assert.ok(Date.now() - started < 10000);
      assert.equal(snapshot.alerts[0].target, 'sim:Kai');
      assert.ok(otherSnapshot);
      assert.equal(otherSnapshot.alerts.length, 0);
      assert.ok(otherSnapshot.messages.every(m => !m.flagged));
      assert.ok(snapshot.alerts[0].simulated);
      assert.ok(snapshot.edges.some(e => e.target === 'sim:Kai' && e.score > .6));
      const message = snapshot.messages.find(m => m.flagged);
      assert.ok(message);
      assert.ok(!message.text.includes('tr4sh'));
      socket.emit('reveal', message.id, response => {
        assert.ok(response.text.includes('tr4sh'));
        stage = 'reset';
        socket.emit('reset');
      });
    } else if (stage === 'reset' && !snapshot.running && snapshot.messages.length === 5) {
      assert.equal(snapshot.alerts.length, 0);
      assert.equal(snapshot.reveals, 0);
      clearTimeout(deadline);
      socket.disconnect();
      otherSocket.disconnect();
      console.log('PASS: HTTP, OAuth redirect, CSRF/Origin/Host rejection, session isolation, raid alert under 10s, masking, reveal and reset.');
    }
  } catch (error) {
    clearTimeout(deadline);
    socket.disconnect();
    otherSocket.disconnect();
    console.error(error);
    process.exitCode = 1;
  }
});
