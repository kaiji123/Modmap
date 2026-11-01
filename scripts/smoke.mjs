import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
const base = 'http://127.0.0.1:3000';
assert.equal((await fetch(base)).status, 200);
assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
const socket = io(base, { transports: ['websocket'] });
let stage = 'seed';
const started = Date.now();
const deadline = setTimeout(() => { console.error('Simulation smoke test timed out'); socket.disconnect(); process.exit(1); }, 15000);
socket.on('snapshot', async snapshot => {
  try {
    if (stage === 'seed') {
      stage = 'raid';
      socket.emit('reset');
      socket.emit('simulate');
    } else if (stage === 'raid' && snapshot.alerts.length) {
      stage = 'reveal';
      assert.ok(Date.now() - started < 10000);
      assert.equal(snapshot.alerts[0].target, 'sim:Kai');
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
      console.log('PASS: HTTP, Socket.IO, raid alert under 10s, directed edges, masking, reveal and reset.');
    }
  } catch (error) {
    clearTimeout(deadline);
    socket.disconnect();
    console.error(error);
    process.exitCode = 1;
  }
});
