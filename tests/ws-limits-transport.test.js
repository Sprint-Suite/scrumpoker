// Real sockets against an in-process server: admission, cleanup and flood limits.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const WebSocket = require('ws');

const { createWsServer } = require('../lib/wsServer');

const silent = { info() {}, warn() {}, error() {} };
const SESSION = { entitled: true, userId: 'hub-u1', teams: [], company: { id: 'co1', name: 'Acme' } };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function startServer(t, { limits = {}, verifySession = async () => SESSION, now, logger = silent } = {}) {
  const server = http.createServer();
  const wsServer = createWsServer({ server, rooms: new Map(), auth: { verifySession }, logger, limits, now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    wsServer.stop();
    wsServer.wss.clients.forEach((ws) => ws.terminate());
    await new Promise((resolve) => server.close(resolve));
  });
  return { port: server.address().port, wsServer };
}

// Resolves with the open socket, or with the HTTP status / error of a refused upgrade.
function connect(port, { ip } = {}) {
  return new Promise((resolve) => {
    const headers = ip ? { 'x-forwarded-for': ip } : {};
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    ws.once('open', () => resolve({ ws }));
    ws.once('unexpected-response', (_req, res) => resolve({ status: res.statusCode }));
    ws.once('error', (err) => resolve({ error: err }));
  });
}

function closed(ws) {
  return new Promise((resolve) => ws.once('close', (code) => resolve(code)));
}

async function until(check, ms = 2000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('condition not met in time');
}

test('slots are reserved before auth, so concurrent upgrades cannot overshoot the per-IP cap', async (t) => {
  const gate = deferred();
  const { port } = await startServer(t, { limits: { perIp: 2 }, verifySession: () => gate.promise });

  const pending = [connect(port), connect(port)];
  const third = await connect(port);
  assert.equal(third.status, 429);

  gate.resolve(SESSION);
  const opened = await Promise.all(pending);
  assert.ok(opened.every((r) => r.ws));
  opened.forEach((r) => r.ws.close());
});

test('the global cap refuses with 503 across IPs while auth is pending', async (t) => {
  const gate = deferred();
  const { port } = await startServer(t, { limits: { global: 1 }, verifySession: () => gate.promise });

  const first = connect(port, { ip: '203.0.113.1' });
  assert.equal((await connect(port, { ip: '203.0.113.2' })).status, 503);
  gate.resolve(SESSION);
  (await first).ws.close();
});

test('closing a socket frees its slot', async (t) => {
  const { port, wsServer } = await startServer(t, { limits: { perIp: 1 } });
  const { ws } = await connect(port);
  assert.equal((await connect(port)).status, 429);
  ws.close();
  await until(() => wsServer.limitStats().open === 0);
  const again = await connect(port);
  assert.ok(again.ws);
  again.ws.close();
});

test('a client that disconnects during auth releases its slot', async (t) => {
  const gate = deferred();
  const { port, wsServer } = await startServer(t, { limits: { perIp: 1 }, verifySession: () => gate.promise });

  const raw = net.connect(port, '127.0.0.1');
  await new Promise((r) => raw.once('connect', r));
  raw.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
  await until(() => wsServer.limitStats().open === 1);
  raw.destroy();
  await until(() => wsServer.limitStats().open === 0);
  gate.resolve(SESSION);
});

test('an upgrade past its deadline is dropped, and a late auth result does not upgrade it', async (t) => {
  const gate = deferred();
  const { port, wsServer } = await startServer(t, { limits: { upgradeDeadlineMs: 100 }, verifySession: () => gate.promise });

  const result = await connect(port);
  assert.ok(!result.ws, 'the socket never opens');
  await until(() => wsServer.limitStats().open === 0);

  gate.resolve(SESSION);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(wsServer.wss.clients.size, 0);
  assert.equal(wsServer.limitStats().open, 0);
});

test('a malformed handshake releases its slot', async (t) => {
  const { port, wsServer } = await startServer(t, { limits: { perIp: 1 } });
  const raw = net.connect(port, '127.0.0.1');
  await new Promise((r) => raw.once('connect', r));
  raw.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: bad\r\n\r\n');
  raw.resume(); // read the 400 so the close is observed
  await new Promise((r) => raw.once('close', r));
  await until(() => wsServer.limitStats().open === 0);
});

test('forwarded client IPs are limited separately', async (t) => {
  const { port } = await startServer(t, { limits: { perIp: 1 } });
  const a = await connect(port, { ip: '203.0.113.1' });
  const b = await connect(port, { ip: '203.0.113.2' });
  assert.ok(a.ws && b.ws);
  assert.equal((await connect(port, { ip: '203.0.113.1' })).status, 429);
  a.ws.close();
  b.ws.close();
});

test('a message flood closes the socket with 1008 and nothing after the limit is processed', async (t) => {
  const { port, wsServer } = await startServer(t, { limits: { bucketCapacity: 3, bucketRefillPerSec: 1 } });
  const { ws } = await connect(port);
  const code = closed(ws);
  for (let i = 0; i < 3; i += 1) ws.send('not json');
  ws.send(JSON.stringify({ type: 'login', payload: { name: 'Late', role: 'Voter', room: 'r' } }));
  ws.send(JSON.stringify({ type: 'login', payload: { name: 'Later', role: 'Voter', room: 'r' } }));

  assert.equal(await code, 1008);
  assert.deepEqual(Object.keys(wsServer.participants), []);
});

test('a tripped socket stays ignored even after its bucket refills', async (t) => {
  let clock = 1000;
  // Jump the clock the moment the limit trips, so the next frame finds a full bucket.
  const logger = { ...silent, warn: (_obj, msg) => { if (/message rate/.test(msg)) clock += 60_000; } };
  const { port, wsServer } = await startServer(t, {
    limits: { bucketCapacity: 1, bucketRefillPerSec: 1 },
    now: () => clock,
    logger
  });
  const { ws } = await connect(port);
  const code = closed(ws);
  ws.send('not json');
  ws.send('not json');
  ws.send(JSON.stringify({ type: 'login', payload: { name: 'Late', role: 'Voter', room: 'r' } }));

  assert.equal(await code, 1008);
  assert.deepEqual(Object.keys(wsServer.participants), []);
});
