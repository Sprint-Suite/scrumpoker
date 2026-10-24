const test = require('node:test');
const assert = require('node:assert/strict');
const { decideUpgrade } = require('../lib/wsServer');
const { joinRoom } = require('../lib/roomState');

test('decideUpgrade: valid session -> authed context', async () => {
  const rooms = new Map();
  const verify = async () => ({ userId: 'u1', entitled: true, teams: [], company: { id: 'co1', name: 'Acme' } });
  const d = await decideUpgrade({ verifySession: verify, cookie: 'poker_session=x', url: '/ws', rooms });
  assert.equal(d.ok, true);
  assert.equal(d.authed, true);
  assert.equal(d.hubUserId, 'u1');
  assert.deepEqual(d.teams, []);
  assert.deepEqual(d.company, { id: 'co1', name: 'Acme' });
});

test('decideUpgrade: no session but valid room token -> anonymous', async () => {
  const rooms = new Map();
  joinRoom(rooms, 'co1-planning', 'host');
  const token = rooms.get('co1-planning').shareToken;
  const verify = async () => null;
  const d = await decideUpgrade({ verifySession: verify, cookie: '', url: `/ws?token=${token}`, rooms });
  assert.equal(d.ok, true);
  assert.equal(d.authed, false);
  assert.equal(d.anonRoom, 'co1-planning');
  assert.equal(d.anonToken, token);
});

test('decideUpgrade: no session and bad token -> 401', async () => {
  const rooms = new Map();
  const d = await decideUpgrade({ verifySession: async () => null, cookie: '', url: '/ws?token=nope', rooms });
  assert.deepEqual(d, { ok: false, status: 401 });
});

test('decideUpgrade: propagates (fails closed) when verifySession throws', async () => {
  const rooms = new Map();
  const boom = new Error('hub down');
  await assert.rejects(
    () => decideUpgrade({ verifySession: async () => { throw boom; }, cookie: 'poker_session=x', url: '/ws?token=nope', rooms }),
    boom
  );
});
