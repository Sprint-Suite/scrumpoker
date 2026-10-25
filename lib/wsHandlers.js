const {
  isEligibleFacilitator,
  joinRoom,
  leaveRoom,
  normalizeFacilitators,
  reassignFacilitatorIfLeaving
} = require('./roomState');
const {
  MAX_FACILITATORS,
  ROLES,
  canChangeRole,
  canResetVotes,
  canRevealVotes,
  canVote,
  getAssignedLoginRole,
  isFacilitator,
  isValidRole
} = require('./roles');

const VOTE_VALUES = Object.freeze(['0', '1', '2', '3', '5', '8', '13', '?']);

function sendError(sendToClient, ws, message) {
  sendToClient(ws, { type: 'error', payload: { message } });
}

// A socket that logs in again is moved, not duplicated: it leaves its current
// room first, so no room keeps a member or facilitatorId that has gone elsewhere.
// Called after the login's own checks, so a rejected login leaves the user in place.
function leaveCurrentRoom(userId, participants, rooms, sendRoomState) {
  if (participants[userId]) {
    handleParticipantExit({ userId, participants, rooms, sendRoomState });
  }
}

function handleLogin({
  ws,
  userId,
  payload,
  rooms,
  participants,
  sendToClient,
  sendRoomState
}) {
  if (!payload || !payload.name) {
    return sendError(sendToClient, ws, 'Login requires a name.');
  }
  const name = String(payload.name).slice(0, 80);

  let internalRoom;
  let assignedRole;
  const authed = ws.authed === true;

  if (authed) {
    const companyId = ws.company && ws.company.id;
    if (!companyId) {
      return sendError(sendToClient, ws, 'No company on your session — re-launch poker from the hub.');
    }
    if (!payload.role || !payload.room) {
      return sendError(sendToClient, ws, 'Login requires name, role and room.');
    }
    if (!isValidRole(payload.role)) {
      return sendError(sendToClient, ws, 'Invalid role.');
    }
    internalRoom = `${companyId}-${payload.room}`;
    leaveCurrentRoom(userId, participants, rooms, sendRoomState);
    joinRoom(rooms, internalRoom, userId);
    const room = rooms.get(internalRoom);
    room.displayName = payload.room;
    assignedRole = getAssignedLoginRole(payload.role, room.facilitatorIds[0] || null);
    if (isFacilitator(assignedRole)) room.facilitatorIds.push(userId);
  } else {
    internalRoom = ws.anonRoom;
    // Leave first: a guest who was the last member closes the room by leaving.
    if (internalRoom) leaveCurrentRoom(userId, participants, rooms, sendRoomState);
    if (!internalRoom || !ws.anonToken || rooms.get(internalRoom)?.shareToken !== ws.anonToken) {
      return sendError(sendToClient, ws, 'This room has closed or the link is invalid.');
    }
    joinRoom(rooms, internalRoom, userId);
    assignedRole = ROLES.VOTER;
  }

  ws.name = name;
  ws.role = assignedRole;
  ws.roomName = internalRoom;

  participants[userId] = {
    id: userId,
    ws,
    name,
    role: assignedRole,
    vote: null,
    roomName: internalRoom,
    authed
  };

  normalizeFacilitators(rooms, participants, internalRoom);
  sendRoomState(internalRoom);
}

function handleVote({ ws, currentUser, payload, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canVote(currentUser.role)) {
    return sendError(sendToClient, ws, 'Observers cannot vote.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName) || {};
  if (room.votesRevealed) {
    return sendError(sendToClient, ws, 'Votes already revealed.');
  }

  if (!payload || typeof payload.vote === 'undefined') {
    return sendError(sendToClient, ws, 'Invalid vote payload.');
  }
  if (!VOTE_VALUES.includes(payload.vote)) {
    return sendError(sendToClient, ws, 'Invalid vote value.');
  }

  currentUser.vote = payload.vote;
  sendRoomState(roomName);
}

function handleRevealVotes({ ws, currentUser, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canRevealVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can reveal votes.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (room) {
    room.votesRevealed = true;
  }
  sendRoomState(roomName);
}

function resetParticipantVotes(participants, roomName) {
  Object.values(participants)
    .filter((participant) => participant.roomName === roomName)
    .forEach((participant) => {
      participant.vote = null;
    });
}

function handleStartNextRound({ ws, currentUser, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can start the next round.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }
  if (!room.votesRevealed) {
    return sendError(sendToClient, ws, 'Reveal votes before starting the next round.');
  }

  room.votesRevealed = false;
  resetParticipantVotes(participants, roomName);
  sendRoomState(roomName);
}

function handleResetVotes({ ws, currentUser, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can reset votes.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (room) {
    room.votesRevealed = false;
  }

  resetParticipantVotes(participants, roomName);

  sendRoomState(roomName);
}

function handleEndSession({ ws, currentUser, participants, rooms, sendToClient, sendToRoom }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can end the session.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }

  sendToRoom(roomName, {
    type: 'sessionEnded',
    payload: {
      message: 'Session ended by facilitator.'
    }
  });

  Object.keys(participants).forEach((userId) => {
    if (participants[userId].roomName === roomName) {
      delete participants[userId];
    }
  });
  rooms.delete(roomName);
}

// Checks a changeRole request; returns { error } or the resolved change.
function resolveRoleChange(currentUser, payload, participants, rooms) {
  if (!currentUser) return { error: 'Not logged in.' };

  const { targetUserId, newRole } = payload || {};
  if (!newRole) return { error: 'Missing new role.' };
  if (!isValidRole(newRole)) return { error: 'Invalid role.' };

  const uid = targetUserId || currentUser.id;
  const target = participants[uid];
  if (!target) return { error: 'User not found.' };
  if (!canChangeRole(currentUser.role, currentUser.id, uid)) {
    return { error: 'Only Facilitator can change others’ roles.' };
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) return { error: 'Room not found.' };
  if (target.roomName !== roomName) return { error: 'Target user is not in your room.' };

  const grantError = isFacilitator(newRole) && facilitatorGrantError(currentUser, target);
  if (grantError) return { error: grantError };
  return { uid, target, newRole, room, roomName };
}

function facilitatorGrantError(currentUser, target) {
  if (!isFacilitator(currentUser.role)) return 'Only a Facilitator can grant the Facilitator role.';
  return null;
}

function handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState }) {
  const change = resolveRoleChange(currentUser, payload, participants, rooms);
  if (change.error) {
    return sendError(sendToClient, ws, change.error);
  }
  const { uid, target, newRole, room, roomName } = change;
  const refusal = updateFacilitatorList(room, participants, roomName, uid, isFacilitator(newRole));
  if (refusal) {
    return sendError(sendToClient, ws, refusal);
  }

  target.role = newRole;
  normalizeFacilitators(rooms, participants, roomName);
  sendRoomState(roomName);
}

// Adds or removes uid on the room's facilitator list. Returns a refusal message,
// leaving the list untouched, when the change is not allowed.
function updateFacilitatorList(room, participants, roomName, uid, promoting) {
  const ids = room.facilitatorIds;
  if (promoting) {
    if (ids.includes(uid)) return null;
    if (ids.length >= MAX_FACILITATORS) return 'A room can have at most two facilitators.';
    room.facilitatorIds = [...ids, uid];
    return null;
  }
  if (!ids.includes(uid)) return null;

  const remaining = ids.filter((id) => id !== uid);
  if (remaining.length === 0) {
    // The last facilitator is stepping down: hand over to another company member
    // so the room is never left without anyone able to reveal or reset votes.
    const replacementId = Array.from(room.users).find(
      (id) => id !== uid && isEligibleFacilitator(room, participants, roomName, id)
    );
    if (!replacementId) return 'Assign another facilitator before leaving the facilitator role.';
    remaining.push(replacementId);
  }
  room.facilitatorIds = remaining;
  return null;
}

function handleParticipantExit({ userId, participants, rooms, sendRoomState }) {
  const participant = participants[userId];
  if (!participant) return null;

  const roomName = participant.roomName;
  leaveRoom(rooms, roomName, userId);
  const room = reassignFacilitatorIfLeaving(rooms, participants, roomName, userId);

  delete participants[userId];

  if (room) {
    sendRoomState(roomName);
  }

  return room;
}

module.exports = {
  VOTE_VALUES,
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleStartNextRound,
  handleVote
};
