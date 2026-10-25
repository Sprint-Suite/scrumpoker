const { randomBytes } = require('node:crypto');

const { MAX_FACILITATORS } = require('./roles');

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

function recordHold(room, key, now) {
  for (const [held, expiresAt] of room.holds) {
    if (expiresAt <= now) room.holds.delete(held);
  }
  while (room.holds.size >= MAX_FACILITATORS) {
    const [soonest] = [...room.holds].sort((a, b) => a[1] - b[1])[0];
    room.holds.delete(soonest);
  }
  room.holds.set(key, now + GUEST_HOLD_MS);
}

function releaseGuest(room, participantId, { holdSeat, now }) {
  const key = keyOf(room, participantId);
  if (!key) return;
  room.guestKeys.delete(key);
  if (holdSeat) recordHold(room, key, now);
}

// Moves a live guest's place to a new connection without running the exit path,
// which could delete the room or promote a waiting member.
function takeOverGuest({ room, participants, oldId, newId, sendToClient }) {
  const old = participants[oldId];
  room.users.delete(oldId);
  room.users.add(newId);
  const index = room.facilitatorIds.indexOf(oldId);
  if (index !== -1) room.facilitatorIds[index] = newId;
  room.guestKeys.set(keyOf(room, oldId), newId);
  delete participants[oldId];
  old.ws.replaced = true;
  sendToClient(old.ws, { type: 'replaced', payload: {} });
  old.ws.close(4000, 'Replaced');
  return old.role;
}

module.exports = { GUEST_HOLD_MS, claimGuestKey, issueGuestKey, keyOf, releaseGuest, takeOverGuest };
