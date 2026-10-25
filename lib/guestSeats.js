const { randomBytes } = require('node:crypto');

const GUEST_HOLD_MS = 120000;

function issueGuestKey(room, participantId) {
  const key = randomBytes(16).toString('hex');
  room.guestKeys.set(key, participantId);
  return key;
}

function keyOf(room, participantId) {
  for (const [key, id] of room.guestKeys) {
    if (id === participantId) return key;
  }
  return null;
}

function claimGuestKey(room, key, now) {
  if (!key) return null;
  if (room.guestKeys.has(key)) {
    return { kind: 'live', participantId: room.guestKeys.get(key) };
  }
  const expiresAt = room.holds.get(key);
  if (expiresAt === undefined) return null;
  room.holds.delete(key);
  return now < expiresAt ? { kind: 'hold' } : null;
}

function releaseGuest(room, participantId, { holdSeat, now }) {
  const key = keyOf(room, participantId);
  if (!key) return;
  room.guestKeys.delete(key);
  if (holdSeat) room.holds.set(key, now + GUEST_HOLD_MS);
}

module.exports = { GUEST_HOLD_MS, claimGuestKey, issueGuestKey, keyOf, releaseGuest };
