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

// Stable test session used to authenticate WS upgrades.
const TEST_SESSION_ID = 'test-session-token';
const TEST_USER_ID = 'test-user-id';
const TEST_TEAM = { id: 't1', name: 'Alpha', role: 'lead' };
const TEST_COMPANY = { id: 'co1', name: 'Acme' };
const SESSION_COOKIE = `poker_session=${TEST_SESSION_ID}`;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, getLogs) {
  const deadline = Date.now() + 5000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not become healthy: ${lastError?.message || 'unknown error'}\n${getLogs()}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function startServer(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-test-'));
  const dbPath = path.join(tempDir, 'poker-sessions.db');

  // Pre-seed the sessions DB so the test session cookie is valid on first request.
  const store = createSessionsStore(dbPath);
  store.create({
    id: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    centralSessionId: 'central-test',
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
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  t.after(async () => {
    await stopProcess(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForHealth(port, () => output);
  return { port };
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
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error('WebSocket closed before expected message'));
    }

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
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  });

  const idMessage = await waitForMessage(
    ws,
    (message) => message.type === 'yourId' && message.payload?.id
  );

  return {
    id: idMessage.payload.id,
    ws
  };
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitForState(ws, predicate, timeoutMs) {
  return waitForMessage(
    ws,
    (message) => message.type === 'updateState' && predicate(message.payload),
    timeoutMs
  ).then((message) => message.payload);
}

function findParticipant(state, name) {
  return state.participants.find((participant) => participant.name === name);
}

async function login(client, payload) {
  const statePromise = waitForState(
    client.ws,
    (state) => Boolean(findParticipant(state, payload.name))
  );

  send(client.ws, 'login', payload);

  return statePromise;
}

test('health endpoint reports a running app', async (t) => {
  const { port } = await startServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.match(body.version, /^\d+\.\d+\.\d+/);
  assert.match(body.commit, /^[0-9a-f]{7,12}$/);
  assert.equal(typeof body.uptime, 'number');
  assert.equal(body.rooms, 0);
});

test('admin routes are removed (404)', async (t) => {
  const { port } = await startServer(t);
  const keysRes = await fetch(`http://127.0.0.1:${port}/api/admin/keys`);
  assert.equal(keysRes.status, 404);

  const sessionRes = await fetch(`http://127.0.0.1:${port}/api/admin/session`);
  assert.equal(sessionRes.status, 404);
});

test('unauthenticated WebSocket upgrade is rejected with 401', async (t) => {
  const { port } = await startServer(t);

  await new Promise((resolve, reject) => {
    // No cookie header — server must reject the upgrade with 401.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let assertionRan = false;

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('no upgrade response within timeout — 401 was never observed'));
    }, 5000);

    ws.once('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      assertionRan = true;
      assert.equal(res.statusCode, 401);
      ws.terminate();
      resolve();
    });

    ws.once('open', () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error('upgrade unexpectedly succeeded — expected 401 rejection'));
    });

    ws.once('error', (err) => {
      // A raw socket error before any HTTP response means we never saw the 401.
      // Only treat it as a pass if the assertion already ran via unexpected-response.
      if (!assertionRan) {
        clearTimeout(timer);
        reject(new Error(`socket error before 401 response was observed: ${err.message}`));
      }
    });
  });
});

test('WebSocket workflow covers login, voting, reveal, reset, and role limits', async (t) => {
  const { port } = await startServer(t);

  const alice = await connectClient(t, port);
  const aliceInitialState = await login(alice, {
    name: 'Alice',
    role: 'Facilitator',
    room: 'baseline'
  });

  assert.equal(findParticipant(aliceInitialState, 'Alice').role, 'Facilitator');
  assert.deepEqual(aliceInitialState.facilitatorIds, [alice.id]);

  const bob = await connectClient(t, port);
  const aliceSeesBob = waitForState(alice.ws, (state) => Boolean(findParticipant(state, 'Bob')));
  const bobInitialState = await login(bob, {
    name: 'Bob',
    role: 'Voter',
    room: 'baseline'
  });
  await aliceSeesBob;

  assert.equal(findParticipant(bobInitialState, 'Bob').role, 'Voter');
  assert.equal(bobInitialState.participants.length, 2);

  const oscar = await connectClient(t, port);
  await login(oscar, {
    name: 'Oscar',
    role: 'Observer',
    room: 'baseline'
  });

  const staleSetItemError = waitForMessage(
    alice.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Unknown type: setRoundItem'
  );
  send(alice.ws, 'setRoundItem', { itemTitle: 'Checkout flow' });
  await staleSetItemError;

  const staleStartNextItemError = waitForMessage(
    alice.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Unknown type: startNextItem'
  );
  send(alice.ws, 'startNextItem', {});
  await staleStartNextItemError;

  const observerVoteError = waitForMessage(
    oscar.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Observers cannot vote.'
  );
  send(oscar.ws, 'vote', { vote: '8' });
  await observerVoteError;

  const voterRevealError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Only Facilitator can reveal votes.'
  );
  send(bob.ws, 'revealVotes', {});
  await voterRevealError;

  const aliceSeesBobVote = waitForState(
    alice.ws,
    (state) => findParticipant(state, 'Bob')?.vote === '5' && state.votesRevealed === false
  );
  send(bob.ws, 'vote', { vote: '5' });
  await aliceSeesBobVote;

  const bobSeesReveal = waitForState(
    bob.ws,
    (state) =>
      state.votesRevealed === true &&
      findParticipant(state, 'Bob')?.vote === '5'
  );
  send(alice.ws, 'revealVotes', {});
  await bobSeesReveal;

  const bobSeesReset = waitForState(
    bob.ws,
    (state) =>
      state.votesRevealed === false &&
      state.participants.every((participant) => participant.vote === null)
  );
  send(alice.ws, 'resetVotes', {});
  await bobSeesReset;

  const aliceSeesSecondVote = waitForState(
    alice.ws,
    (state) => findParticipant(state, 'Bob')?.vote === '8' && state.votesRevealed === false
  );
  send(bob.ws, 'vote', { vote: '8' });
  await aliceSeesSecondVote;

  const bobSeesSecondReveal = waitForState(
    bob.ws,
    (state) =>
      state.votesRevealed === true &&
      findParticipant(state, 'Bob')?.vote === '8'
  );
  send(alice.ws, 'revealVotes', {});
  await bobSeesSecondReveal;

  const bobSeesNextItem = waitForState(
    bob.ws,
    (state) =>
      state.votesRevealed === false &&
      state.participants.every((participant) => participant.vote === null)
  );
  send(alice.ws, 'startNextRound', {});
  await bobSeesNextItem;

  const bobRoleChanged = waitForState(
    bob.ws,
    (state) => findParticipant(state, 'Bob')?.role === 'Observer'
  );
  send(alice.ws, 'changeRole', { targetUserId: bob.id, newRole: 'Observer' });
  await bobRoleChanged;

  const nonFacilitatorRoleError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message.includes('Only Facilitator')
  );
  send(bob.ws, 'changeRole', { targetUserId: alice.id, newRole: 'Voter' });
  await nonFacilitatorRoleError;
});

test('facilitator can end a room session for every participant', async (t) => {
  const { port } = await startServer(t);

  const alice = await connectClient(t, port);
  await login(alice, {
    name: 'Alice',
    role: 'Facilitator',
    room: 'baseline'
  });

  const bob = await connectClient(t, port);
  await login(bob, {
    name: 'Bob',
    role: 'Voter',
    room: 'baseline'
  });

  const voterEndSessionError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Only Facilitator can end the session.'
  );
  send(bob.ws, 'endSession', {});
  await voterEndSessionError;

  const aliceEnded = waitForMessage(
    alice.ws,
    (message) => message.type === 'sessionEnded' && message.payload?.message === 'Session ended by facilitator.'
  );
  const bobEnded = waitForMessage(
    bob.ws,
    (message) => message.type === 'sessionEnded' && message.payload?.message === 'Session ended by facilitator.'
  );

  send(alice.ws, 'endSession', {});
  await Promise.all([aliceEnded, bobEnded]);

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  assert.equal(health.rooms, 0);

  const loggedOutError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Not logged in.'
  );
  send(bob.ws, 'vote', { vote: '8' });
  await loggedOutError;
});

test('login is rejected when required fields are missing', async (t) => {
  const { port } = await startServer(t);
  const client = await connectClient(t, port);

  const errorPromise = waitForMessage(
    client.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Login requires name, role and room.'
  );
  send(client.ws, 'login', {
    name: 'Mallory'
    // missing role and room
  });

  await errorPromise;
});
