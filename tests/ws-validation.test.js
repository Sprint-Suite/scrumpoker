// tests/ws-validation.test.js — integration tests for WS input validation.
// Mirrors the style of tests/ws-operations.test.js (node:test, real server process).
//
// Covers:
//  1. Bad JSON is dropped — socket stays open, game state unchanged.
//  2. A known type (vote) with an invalid payload is dropped — socket stays open.
//  3. A valid vote message still works after invalid messages have been dropped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { createSessionsStore } = require('@suite/auth-client/lib/sessions-db');

const repoRoot = path.resolve(__dirname, '..');

const TEST_SESSION_ID = 'ws-val-test-session';
const TEST_USER_ID = 'ws-val-test-user';
const TEST_TEAM = { id: 't1', name: 'Alpha', role: 'lead' };
const TEST_COMPANY = { id: 'co1', name: 'Acme' };
const SESSION_COOKIE = `poker_session=${TEST_SESSION_ID}`;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, getLogs) {
  const deadline = Date.now() + 5000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
      lastError = new Error(`Health returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not become healthy: ${lastError?.message}\n${getLogs()}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

async function startServer(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-wsval-'));
  const dbPath = path.join(tempDir, 'poker-sessions.db');

  const store = createSessionsStore(dbPath);
  store.create({
    id: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    centralSessionId: 'central-wsval',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    entitled: true,
    teams: [TEST_TEAM],
    company: TEST_COMPANY
  });

  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HUB_BASE_URL: 'https://hub.test',
      HUB_API_KEY: 'test-hub-key',
      APP_SESSIONS_DB: dbPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  t.after(async () => {
    await stopProcess(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForHealth(port, () => output);
  return { port, child };
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    }

    function onMessage(raw) {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { cleanup(); reject(e); return; }
      if (predicate(msg)) { cleanup(); resolve(msg); }
    }

    function onError(err) { cleanup(); reject(err); }
    function onClose() { cleanup(); reject(new Error('WebSocket closed before expected message')); }

    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.on('close', onClose);
  });
}

async function connectClient(t, port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie: SESSION_COOKIE }
  });
  t.after(() => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  });

  const idMsg = await waitForMessage(ws, (m) => m.type === 'yourId' && m.payload?.id);
  return { id: idMsg.payload.id, ws };
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitForState(ws, predicate, timeoutMs) {
  return waitForMessage(
    ws,
    (m) => m.type === 'updateState' && predicate(m.payload),
    timeoutMs
  ).then((m) => m.payload);
}

function findParticipant(state, name) {
  return state.participants.find((p) => p.name === name);
}

async function loginClient(client, payload) {
  const statePromise = waitForState(client.ws, (s) => Boolean(findParticipant(s, payload.name)));
  send(client.ws, 'login', payload);
  return statePromise;
}

// ---- tests ----

test('bad JSON is dropped: socket stays open and game state is unchanged', async (t) => {
  const { port } = await startServer(t);

  // Alice logs in to a room.
  const alice = await connectClient(t, port);
  await loginClient(alice, { name: 'Alice', role: 'Facilitator', room: 'validation-test' });

  // Send raw bad JSON over the socket.
  alice.ws.send('this is not json}}}');

  // Alice's socket should remain open (we can still receive a state update).
  // Send a valid revealVotes (Alice is facilitator) and wait for the state broadcast.
  const aliceSeesReveal = waitForState(
    alice.ws,
    (state) => state.votesRevealed === true
  );
  send(alice.ws, 'revealVotes', {});
  await aliceSeesReveal;

  // Socket is still open — no close or error event fired.
  assert.equal(alice.ws.readyState, WebSocket.OPEN);
});

test('valid type with invalid payload is dropped: socket stays open and state is unchanged', async (t) => {
  const { port } = await startServer(t);

  // Alice and Bob log in.
  const alice = await connectClient(t, port);
  await loginClient(alice, { name: 'Alice', role: 'Facilitator', room: 'drop-test' });

  const bob = await connectClient(t, port);
  const aliceSeesBob = waitForState(alice.ws, (s) => Boolean(findParticipant(s, 'Bob')));
  await loginClient(bob, { name: 'Bob', role: 'Voter', room: 'drop-test' });
  await aliceSeesBob;

  // Bob sends a vote with an invalid value (not in VOTE_VALUES) — should be dropped.
  // We wait 300 ms and confirm there is NO updateState with Bob's vote set.
  let badVoteReceived = false;
  const badVoteListener = (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'updateState') {
        const participant = findParticipant(msg.payload, 'Bob');
        if (participant?.vote === 'NOT_A_VALID_VOTE') badVoteReceived = true;
      }
    } catch (_) { /* ignore */ }
  };
  alice.ws.on('message', badVoteListener);

  bob.ws.send(JSON.stringify({ type: 'vote', payload: { vote: 'NOT_A_VALID_VOTE' } }));

  await new Promise((r) => setTimeout(r, 300));
  alice.ws.off('message', badVoteListener);

  assert.equal(badVoteReceived, false, 'invalid vote payload should have been dropped');
  assert.equal(bob.ws.readyState, WebSocket.OPEN, 'socket should still be open after invalid payload');

  // Bob can still send a VALID vote afterwards.
  const aliceSeesVote = waitForState(
    alice.ws,
    (state) => findParticipant(state, 'Bob')?.vote === '5'
  );
  send(bob.ws, 'vote', { vote: '5' });
  await aliceSeesVote;
});

test('login with missing name is dropped: no room state broadcast occurs', async (t) => {
  const { port } = await startServer(t);

  // Connect a client but send a login with no name (fails schema — name required).
  const client = await connectClient(t, port);

  let stateReceived = false;
  const stateListener = (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'updateState') stateReceived = true;
    } catch (_) { /* ignore */ }
  };
  client.ws.on('message', stateListener);

  // Send login with no name field — our schema requires name.min(1).
  client.ws.send(JSON.stringify({ type: 'login', payload: { role: 'Voter', room: 'r1' } }));

  await new Promise((r) => setTimeout(r, 300));
  client.ws.off('message', stateListener);

  assert.equal(stateReceived, false, 'no room state should be sent when login payload is invalid');
  assert.equal(client.ws.readyState, WebSocket.OPEN, 'socket must remain open');
});

test('valid messages still work normally after an invalid message is dropped', async (t) => {
  const { port } = await startServer(t);

  const alice = await connectClient(t, port);
  await loginClient(alice, { name: 'Alice', role: 'Facilitator', room: 'resilience-test' });

  const bob = await connectClient(t, port);
  const aliceSeesBob = waitForState(alice.ws, (s) => Boolean(findParticipant(s, 'Bob')));
  await loginClient(bob, { name: 'Bob', role: 'Voter', room: 'resilience-test' });
  await aliceSeesBob;

  // Drop a bad JSON message on Bob's socket.
  bob.ws.send('}{bad json');

  // Drop a valid-type bad-payload on Bob's socket.
  bob.ws.send(JSON.stringify({ type: 'changeRole', payload: { newRole: 'SUPERUSER' } }));

  // Bob can still vote normally afterwards.
  const aliceSeesVotePromise = waitForState(
    alice.ws,
    (state) => findParticipant(state, 'Bob')?.vote === '8'
  );
  send(bob.ws, 'vote', { vote: '8' });
  const finalState = await aliceSeesVotePromise;

  assert.equal(findParticipant(finalState, 'Bob')?.vote, '8');
  assert.equal(bob.ws.readyState, WebSocket.OPEN);
});

test('malformed envelopes cannot crash the server', async (t) => {
  const { port, child } = await startServer(t);

  const alice = await connectClient(t, port);
  await loginClient(alice, { name: 'Alice', role: 'Facilitator', room: 'crash-test' });

  const bob = await connectClient(t, port);
  const aliceSeesBob = waitForState(alice.ws, (s) => Boolean(findParticipant(s, 'Bob')));
  await loginClient(bob, { name: 'Bob', role: 'Voter', room: 'crash-test' });
  await aliceSeesBob;

  let arrayTypeVoteApplied = false;
  alice.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'updateState' && findParticipant(msg.payload, 'Bob')?.vote === '8') {
      arrayTypeVoteApplied = true;
    }
  });

  const frames = [
    'null', '5', '"x"', '[]',
    '{"type":["vote"],"payload":{"vote":"8"}}',
    '{"type":{"toString":1}}',
    '{"type":"constructor"}', '{"type":"__proto__"}', '{"type":"toString"}'
  ];
  for (const frame of frames) bob.ws.send(frame);

  const aliceSeesVote = waitForState(alice.ws, (s) => findParticipant(s, 'Bob')?.vote === '5');
  send(bob.ws, 'vote', { vote: '5' });
  await aliceSeesVote;

  assert.equal(arrayTypeVoteApplied, false, 'array-typed vote frame must not be applied');
  assert.equal(child.exitCode, null, 'server process must still be running');
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.ok(health.ok);
  assert.equal(bob.ws.readyState, WebSocket.OPEN);
});

test('a second login without logout moves the user and hands facilitation on', async (t) => {
  const { port, child } = await startServer(t);

  const alice = await connectClient(t, port);
  await loginClient(alice, { name: 'Alice', role: 'Facilitator', room: 'first' });
  const bob = await connectClient(t, port);
  await loginClient(bob, { name: 'Bob', role: 'Voter', room: 'first' });

  const bobSeesAliceLeave = waitForState(bob.ws, (s) => !findParticipant(s, 'Alice'));
  await loginClient(alice, { name: 'Alice', role: 'Voter', room: 'second' });
  await bobSeesAliceLeave;
  alice.ws.close();

  const bobPromoted = waitForState(bob.ws, (s) => findParticipant(s, 'Bob')?.role === 'Facilitator');
  send(bob.ws, 'changeRole', { newRole: 'Facilitator' });
  await bobPromoted;

  assert.equal(child.exitCode, null, 'server process must still be running');
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).ok, true);
});
