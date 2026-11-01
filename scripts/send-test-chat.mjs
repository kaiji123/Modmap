import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const messages = [
  '[MODMAP TEST 1/6] Friendly control: hello chat!',
  '[MODMAP TEST 2/6] Filter sample word: tr4sh.',
  '[MODMAP TEST 3/6] Filter sample word: stupid.',
  '[MODMAP TEST 4/6] Filter sample word: idiot.',
  '[MODMAP TEST 5/6] Filter sample word: garbage.',
  '[MODMAP TEST 6/6] Filter sample word: loser.',
];
export function parseArgs(args) {
  let channel, send = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel') channel = args[++i]?.replace(/^@/, '').toLowerCase();
    else if (args[i] === '--send') send = true;
    else if (args[i] !== '--dry-run') throw new Error('Usage: npm run chat:test -- --channel YOUR_USERNAME [--send]');
  }
  if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel)) throw new Error('Provide your own Twitch login with --channel YOUR_USERNAME.');
  return { channel, send };
}

export async function run(options, { request = fetch, wait = sleep, log = console.log, clientId = process.env.TWITCH_CLIENT_ID } = {}) {
  log(`ModMap filter test: six labelled messages to #${options.channel}, one every three seconds.`);
  for (const message of messages) log(message);
  if (!options.send) { log('Dry run only. Add --send to authorize Twitch and post these messages.'); return; }
  if (!clientId) throw new Error('Set TWITCH_CLIENT_ID in .env first.');
  const call = (url, init) => request(url, { ...init, signal: AbortSignal.timeout(10000) });
  const deviceResponse = await call('https://id.twitch.tv/oauth2/device', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, scopes: 'user:write:chat' }),
  });
  if (!deviceResponse.ok) throw new Error('Twitch device authorization failed. Check your Client ID.');
  const device = await deviceResponse.json();
  const verification = new URL(device.verification_uri);
  if (verification.protocol !== 'https:' || verification.hostname !== 'www.twitch.tv') throw new Error('Unexpected Twitch authorization URL.');
  if (!device.device_code || !device.user_code || !Number.isFinite(device.expires_in)) throw new Error('Incomplete device authorization response.');
  log(`Open ${verification.toString()}`);
  log(`Enter code ${device.user_code} and authorize as @${options.channel}. This only permits sending chat.`);
  const deadline = Date.now() + Math.min(device.expires_in, 1800) * 1000;
  let interval = Math.max(5, Number(device.interval) || 5) * 1000, token;
  while (Date.now() < deadline) {
    await wait(interval);
    const response = await call('https://id.twitch.tv/oauth2/token', {
      method: 'POST', body: new URLSearchParams({ client_id: clientId, device_code: device.device_code,
        scopes: 'user:write:chat', grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    });
    const result = await response.json();
    if (response.ok && result.access_token) { token = result.access_token; break; }
    const error = result.error || result.message;
    if (error === 'authorization_pending') continue;
    if (error === 'slow_down') { interval += 5000; continue; }
    throw new Error('Twitch authorization was denied or expired. Run the command again.');
  }
  if (!token) throw new Error('Twitch authorization expired.');
  const validation = await call('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
  if (!validation.ok) throw new Error('Twitch token validation failed.');
  const user = await validation.json();
  if (user.client_id !== clientId || user.login?.toLowerCase() !== options.channel || !user.user_id || !user.scopes?.includes('user:write:chat')) {
    throw new Error('Authorize as the owner of --channel. No messages were sent.');
  }
  const headers = { Authorization: `Bearer ${token}`, 'Client-Id': clientId, 'Content-Type': 'application/json' };
  // A user token broadcasts into every channel in a Shared Chat session, so refuse that case.
  const shared = await call(`https://api.twitch.tv/helix/shared_chat/session?broadcaster_id=${encodeURIComponent(user.user_id)}`, { headers });
  if (!shared.ok) throw new Error('Could not check Shared Chat status. No messages were sent.');
  const sharedSession = await shared.json();
  if (!Array.isArray(sharedSession.data)) throw new Error('Invalid Shared Chat status. No messages were sent.');
  if (sharedSession.data.length) throw new Error('Leave Shared Chat before running this own-channel test. No messages were sent.');
  for (let i = 0; i < messages.length; i++) {
    if (i) await wait(3000);
    const response = await call('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST', headers, body: JSON.stringify({ broadcaster_id: user.user_id, sender_id: user.user_id, message: messages[i] }),
    });
    if (!response.ok) throw new Error(`Twitch stopped the test (HTTP ${response.status}). Sent ${i} of ${messages.length}; no automatic retry.`);
    const result = await response.json();
    if (!result.data?.[0]?.is_sent) throw new Error(`Twitch held or rejected test message ${i + 1}. Stopping without retrying.`);
    log(`Sent ${i + 1}/${messages.length}.`);
  }
  log('Done. Check ModMap Live Twitch view for the masked samples and score change.');
  log('This uses one real account; use the built-in simulator for a multi-account brigade.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await run(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error && error.name === 'Error' ? error.message : 'Network request failed. Test stopped; check Twitch before rerunning.'); process.exitCode = 1; }
}
