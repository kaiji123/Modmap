import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages, parseArgs, run } from './send-test-chat.mjs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function mock({ wrongUser = false, shared = false, dropped = false } = {}) {
  const sent = [], logs = [];
  const request = async (url, init) => {
    if (url.endsWith('/device')) return json({ device_code: 'private-device', user_code: 'VISIBLE', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5 });
    if (url.endsWith('/token')) return json({ access_token: 'private-token' });
    if (url.endsWith('/validate')) return json({ client_id: 'client', user_id: 'owner-id', login: wrongUser ? 'other' : 'owner', scopes: ['user:write:chat'] });
    if (url.includes('/shared_chat/session')) return json({ data: shared ? [{ session_id: 'shared' }] : [] });
    sent.push(JSON.parse(init.body));
    return json({ data: [{ is_sent: !dropped }] });
  };
  return { sent, logs, deps: { request, wait: async () => {}, log: line => logs.push(line), clientId: 'client' } };
}
test('defaults to a no-network dry run', async () => {
  let called = false;
  await run(parseArgs(['--channel', 'Owner']), { request: async () => { called = true; }, log() {} });
  assert.equal(called, false);
  assert.throws(() => parseArgs(['--channel', 'bad/channel']));
});
test('sends six labelled messages as the owner and never logs tokens', async () => {
  const { deps, sent, logs } = mock();
  await run({ channel: 'owner', send: true }, deps);
  assert.equal(sent.length, 6);
  assert.ok(sent.every(m => m.broadcaster_id === 'owner-id' && m.sender_id === 'owner-id'));
  assert.deepEqual(sent.map(m => m.message), messages);
  assert.ok(!logs.join('').includes('private-token'));
  assert.ok(!logs.join('').includes('private-device'));
});
test('rejects wrong-channel authorization and Shared Chat before sending', async () => {
  for (const setting of [{ wrongUser: true }, { shared: true }]) {
    const { deps, sent } = mock(setting);
    await assert.rejects(run({ channel: 'owner', send: true }, deps));
    assert.equal(sent.length, 0);
  }
});
test('stops on held or rejected messages without repeating them', async () => {
  const { deps, sent } = mock({ dropped: true });
  await assert.rejects(run({ channel: 'owner', send: true }, deps), /held or rejected/);
  assert.equal(sent.length, 1);
});
