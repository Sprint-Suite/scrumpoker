// In-process poker server with real sockets, for transport-level tests.
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');

const { createWsServer } = require('../../lib/wsServer');

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
    // Record from the start: the server's first message can arrive with the handshake.
    ws.received = [];
    ws.on('message', (data) => ws.received.push(JSON.parse(data)));
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

// Collects a socket's messages so tests can wait for one matching a predicate.
function inbox(ws) {
  const messages = ws.received;
  return {
    messages,
    async next(predicate, ms = 2000) {
      await until(() => messages.some(predicate), ms);
      return messages.find(predicate);
    }
  };
}

module.exports = { SESSION, closed, connect, deferred, inbox, silent, startServer, until };
