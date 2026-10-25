const { MAX_FACILITATORS, ROLES } = require('./roles');
const { randomBytes } = require('node:crypto');

const DEFAULT_ROOM_EXPIRY_MS = 60 * 60 * 1000;

function createRoom(now = Date.now()) {
  return {
    users: new Set(),
    lastActive: now,
    votesRevealed: false,
    facilitatorIds: [],
    guestKeys: new Map(),
    holds: new Map(),
    shareToken: randomBytes(16).toString('hex')
  };
}

function findRoomByToken(rooms, token) {
  if (!token) return null;
  for (const [roomName, room] of rooms.entries()) {
    if (room.shareToken === token) return roomName;
  }
  return null;
}

function joinRoom(rooms, roomName, userId, now = Date.now()) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, createRoom(now));
  }

  const room = rooms.get(roomName);
  room.users.add(userId);
  room.lastActive = now;
  return room;
}

function leaveRoom(rooms, roomName, userId, now = Date.now()) {
  const room = rooms.get(roomName);
  if (!room) return null;

  room.users.delete(userId);
  room.lastActive = now;

  if (room.users.size === 0) {
    rooms.delete(roomName);
    return null;
  }

  return room;
}

function touchRoom(rooms, roomName, now = Date.now()) {
  const room = rooms.get(roomName);
  if (room) {
    room.lastActive = now;
  }

  return room || null;
}

function expireRooms(rooms, now = Date.now(), expiryMs = DEFAULT_ROOM_EXPIRY_MS, participants = null) {
  const expiredRoomNames = [];

  for (const [roomName, room] of rooms.entries()) {
    if (now - room.lastActive > expiryMs) {
      rooms.delete(roomName);
      expiredRoomNames.push(roomName);
    }
  }

  if (participants && expiredRoomNames.length > 0) {
    const expired = new Set(expiredRoomNames);
    for (const [userId, participant] of Object.entries(participants)) {
      if (expired.has(participant.roomName)) {
        delete participants[userId];
      }
    }
  }

  return expiredRoomNames;
}

function getRoomParticipants(participants, roomName) {
  return Object.values(participants)
    .filter((participant) => participant.roomName === roomName)
    .map(({ ws, authed, ...rest }) => rest);
}

function getRoomState(rooms, participants, roomName) {
  const room = rooms.get(roomName) || {};

  return {
    type: 'updateState',
    payload: {
      participants: getRoomParticipants(participants, roomName),
      votesRevealed: room.votesRevealed || false,
      facilitatorIds: room.facilitatorIds || [],
      shareToken: room.shareToken || null,
      displayName: room.displayName || null
    }
  };
}

function isRoomParticipant(room, participants, roomName, id) {
  return room.users.has(id) && participants[id]?.roomName === roomName;
}

// Auto-pick candidate: company members only, never invite-link guests.
function isEligibleFacilitator(room, participants, roomName, id) {
  return isRoomParticipant(room, participants, roomName, id) && Boolean(participants[id].authed);
}

// room.facilitatorIds is the source of truth: it is cut to unique ids of people in the room (guests included),
// topped up from the room if empty, and participant roles are made to match it.
function normalizeFacilitators(rooms, participants, roomName) {
  const room = rooms.get(roomName);
  if (!room) return [];

  const inRoom = (id) => isRoomParticipant(room, participants, roomName, id);
  const kept = [...new Set(room.facilitatorIds || [])].filter(inRoom).slice(0, MAX_FACILITATORS);
  if (kept.length === 0) {
    const next = Array.from(room.users).find((id) => isEligibleFacilitator(room, participants, roomName, id));
    if (next) kept.push(next);
  }
  room.facilitatorIds = kept;

  for (const participant of Object.values(participants)) {
    if (participant.roomName !== roomName) continue;
    if (kept.includes(participant.id)) participant.role = ROLES.FACILITATOR;
    else if (participant.role === ROLES.FACILITATOR) participant.role = ROLES.VOTER;
  }
  return kept;
}

function reassignFacilitatorIfLeaving(rooms, participants, roomName, userId) {
  const room = rooms.get(roomName);
  if (!room) return null;

  room.facilitatorIds = (room.facilitatorIds || []).filter((id) => id !== userId);
  normalizeFacilitators(rooms, participants, roomName);
  return room;
}

module.exports = {
  DEFAULT_ROOM_EXPIRY_MS,
  createRoom,
  expireRooms,
  findRoomByToken,
  getRoomParticipants,
  getRoomState,
  isEligibleFacilitator,
  isRoomParticipant,
  joinRoom,
  leaveRoom,
  normalizeFacilitators,
  reassignFacilitatorIfLeaving,
  touchRoom
};
