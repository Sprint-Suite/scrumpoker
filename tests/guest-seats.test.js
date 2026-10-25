const test = require('node:test');
const assert = require('node:assert/strict');

const { MAX_FACILITATORS } = require('../lib/roles');
const { GUEST_HOLD_MS, claimGuestKey, issueGuestKey, keyOf, releaseGuest } = require('../lib/guestSeats');
const { createRoom } = require('../lib/roomState');

const NOW = 1000000;

test('an issued key is 32 hex characters and is found by keyOf', () => {
  const room = createRoom();
  const key = issueGuestKey(room, 'g1');
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(keyOf(room, 'g1'), key);
  assert.equal(keyOf(room, 'other'), null);
});

test('a live key claims as live', () => {
  const room = createRoom();
  const key = issueGuestKey(room, 'g1');
  assert.deepEqual(claimGuestKey(room, key, NOW), { kind: 'live', participantId: 'g1' });
});

test('a held key claims once inside the window, then is consumed', () => {
  const room = createRoom();
  const key = issueGuestKey(room, 'g1');
  releaseGuest(room, 'g1', { holdSeat: true, now: NOW });
  assert.equal(GUEST_HOLD_MS, 120000);
  assert.equal(keyOf(room, 'g1'), null);
  assert.deepEqual(claimGuestKey(room, key, NOW + 119999), { kind: 'hold' });
  assert.equal(claimGuestKey(room, key, NOW + 119999), null);
});

test('an expired hold is deleted and claims nothing', () => {
  const room = createRoom();
  const key = issueGuestKey(room, 'g1');
  releaseGuest(room, 'g1', { holdSeat: true, now: NOW });
  assert.equal(claimGuestKey(room, key, NOW + 120001), null);
  assert.equal(room.holds.size, 0);
});

test('a release without a hold leaves nothing to claim', () => {
  const room = createRoom();
  const key = issueGuestKey(room, 'g1');
  releaseGuest(room, 'g1', { holdSeat: false, now: NOW });
  assert.equal(claimGuestKey(room, key, NOW), null);
  assert.equal(room.holds.size, 0);
});

test('an unknown or missing key claims nothing', () => {
  const room = createRoom();
  assert.equal(claimGuestKey(room, 'f'.repeat(32), NOW), null);
  assert.equal(claimGuestKey(room, undefined, NOW), null);
});

function holdFor(room, id, now) {
  issueGuestKey(room, id);
  const key = keyOf(room, id);
  releaseGuest(room, id, { holdSeat: true, now });
  return key;
}

test('an expired hold is removed when the next hold is recorded', () => {
  const room = createRoom();
  const stale = holdFor(room, 'g1', NOW);
  holdFor(room, 'g2', NOW + GUEST_HOLD_MS);
  assert.equal(room.holds.has(stale), false);
  assert.equal(room.holds.size, 1);
});

test('a third live hold leaves MAX_FACILITATORS holds and evicts the soonest-expiring', () => {
  const room = createRoom();
  const first = holdFor(room, 'g1', NOW);
  const second = holdFor(room, 'g2', NOW + 10);
  const third = holdFor(room, 'g3', NOW + 20);
  assert.equal(room.holds.size, MAX_FACILITATORS);
  assert.equal(room.holds.has(first), false);
  assert.equal(room.holds.has(second) && room.holds.has(third), true);
});
