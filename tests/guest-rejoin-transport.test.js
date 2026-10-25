// Real sockets: a guest's rejoin key reaches only its owner and takes over a stale connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { closed, inbox, startServer } = require('./helpers/ws-harness');

const SESSION = { entitled: true, userId: 'hub-u1', teams: [], company: { id: 'co1', name: 'Acme' } };
// Guests have no cookie, so the hub refuses them and they are admitted by token.
const guestsOnly = async (cookie) => (cookie ? SESSION : null);

const stateWhere = (check) => (m) => m.type === 'updateState' && check(m.payload);
const sendOn = (ws) => (type, payload = {}) => ws.send(JSON.stringify({ type, payload }));

async function memberInRoom(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: 'session=member' } });
  ws.received = [];
  ws.on('message', (data) => ws.received.push(JSON.parse(data)));
  await new Promise((resolve) => ws.once('open', resolve));
  const box = inbox(ws);
  const { payload: { id } } = await box.next((m) => m.type === 'yourId');
  const send = sendOn(ws);
  send('login', { name: 'Alice', role: 'Facilitator', room: 'planning' });
  const state = await box.next(stateWhere((s) => s.participants.some((p) => p.id === id)));
  return { ws, box, id, send, token: state.payload.shareToken };
}

async function guestConnect(port, token, name, rejoinKey) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  ws.received = [];
  ws.on('message', (data) => ws.received.push(JSON.parse(data)));
  await new Promise((resolve) => ws.once('open', resolve));
  const box = inbox(ws);
  const { payload: { id } } = await box.next((m) => m.type === 'yourId');
  const send = sendOn(ws);
  send('login', { name, ...(rejoinKey ? { rejoinKey } : {}) });
  const joined = await box.next(stateWhere((st) => st.participants.some((p) => p.id === id)));
  const key = (await box.next((m) => m.type === 'rejoinKey')).payload.key;
  return { ws, box, id, send, key, joined: joined.payload };
}

async function grantedGuest(t, port, alice) {
  const guest = await guestConnect(port, alice.token, 'Guest');
  t.after(() => guest.ws.terminate());
  alice.send('changeRole', { targetUserId: guest.id, newRole: 'Facilitator' });
  await guest.box.next(stateWhere((s) => s.facilitatorIds.includes(guest.id)));
  return guest;
}

test('the rejoin key reaches only its owner', async (t) => {
  const { port } = await startServer(t, { verifySession: guestsOnly });
  const alice = await memberInRoom(port);
  t.after(() => alice.ws.terminate());
  const guest = await guestConnect(port, alice.token, 'Guest');
  const other = await guestConnect(port, alice.token, 'Other');
  t.after(() => { guest.ws.terminate(); other.ws.terminate(); });
  await alice.box.next(stateWhere((s) => s.participants.length === 3));
  assert.notEqual(guest.key, other.key);
  for (const seen of [alice.ws.received, other.ws.received.filter((m) => m.type !== 'rejoinKey')]) {
    assert.equal(JSON.stringify(seen).includes(guest.key), false);
  }
});

test('a guest facilitator whose socket drops rejoins as Facilitator', async (t) => {
  const { port } = await startServer(t, { verifySession: guestsOnly });
  const alice = await memberInRoom(port);
  t.after(() => alice.ws.terminate());
  const guest = await grantedGuest(t, port, alice);
  guest.ws.terminate();
  await alice.box.next(stateWhere((s) => s.facilitatorIds.length === 1 && s.participants.length === 1));

  const back = await guestConnect(port, alice.token, 'Guest', guest.key);
  t.after(() => back.ws.terminate());
  assert.ok(back.joined.facilitatorIds.includes(back.id));
  assert.equal(back.joined.facilitatorIds.length, 2);
});

test('a second connection with the key replaces the first, and the old socket cannot take the place back', async (t) => {
  const { port, wsServer } = await startServer(t, { verifySession: guestsOnly });
  const alice = await memberInRoom(port);
  t.after(() => alice.ws.terminate());
  const guest = await grantedGuest(t, port, alice);
  const closing = closed(guest.ws);
  const serverSide = [...wsServer.wss.clients].find((c) => c.userId === guest.id);

  const second = await guestConnect(port, alice.token, 'Guest', guest.key);
  t.after(() => second.ws.terminate());
  await guest.box.next((m) => m.type === 'replaced');
  assert.equal(await closing, 4000);

  assert.ok(second.joined.facilitatorIds.includes(second.id));
  assert.equal(second.joined.participants.some((p) => p.id === guest.id), false);

  // A login the old socket had in flight is delivered after the swap; the server must ignore it.
  serverSide.emit('message', JSON.stringify({ type: 'login', payload: { name: 'Guest', rejoinKey: guest.key } }));
  alice.send('changeRole', { targetUserId: second.id, newRole: 'Voter' });
  const settled = await second.box.next((m) => m.type === 'replaced' || stateWhere((st) => !st.facilitatorIds.includes(second.id))(m));
  assert.notEqual(settled.type, 'replaced', 'the old socket\'s resent login took the place from the new connection');
  assert.equal(settled.payload.participants.length, 2);
  assert.ok(settled.payload.participants.some((p) => p.id === second.id));
});
