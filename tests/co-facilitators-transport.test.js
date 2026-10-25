// Real sockets: facilitator powers follow the live role, so a demotion bites at once.
const test = require('node:test');
const assert = require('node:assert/strict');

const { connect, inbox, startServer } = require('./helpers/ws-harness');

async function member(port, name, role) {
  const { ws } = await connect(port);
  const box = inbox(ws);
  const { payload: { id } } = await box.next((m) => m.type === 'yourId');
  ws.send(JSON.stringify({ type: 'login', payload: { name, role, room: 'planning' } }));
  await box.next((m) => m.type === 'updateState' && m.payload.participants.some((p) => p.id === id));
  const send = (type, payload = {}) => ws.send(JSON.stringify({ type, payload }));
  return { ws, box, id, send };
}

const stateWhere = (check) => (m) => m.type === 'updateState' && check(m.payload);
const errorSaying = (text) => (m) => m.type === 'error' && m.payload.message === text;

test('a co-facilitator can run the room, and loses those powers the moment they are demoted', async (t) => {
  const { port } = await startServer(t);
  const alice = await member(port, 'Alice', 'Facilitator');
  const bob = await member(port, 'Bob', 'Voter');
  t.after(() => { alice.ws.close(); bob.ws.close(); });

  alice.send('changeRole', { targetUserId: bob.id, newRole: 'Facilitator' });
  await bob.box.next(stateWhere((s) => s.facilitatorIds.length === 2));

  bob.send('revealVotes');
  await alice.box.next(stateWhere((s) => s.votesRevealed));

  alice.send('changeRole', { targetUserId: bob.id, newRole: 'Voter' });
  await bob.box.next(stateWhere((s) => s.facilitatorIds.length === 1 && s.facilitatorIds[0] === alice.id));

  bob.send('resetVotes');
  await bob.box.next(errorSaying('Only Facilitator can reset votes.'));
  bob.send('endSession');
  await bob.box.next(errorSaying('Only Facilitator can end the session.'));
  assert.ok(!alice.box.messages.some((m) => m.type === 'sessionEnded'));
});
