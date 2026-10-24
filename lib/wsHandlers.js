const {
  assignFacilitator,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving
} = require('./roomState');
const {
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
    assignedRole = getAssignedLoginRole(payload.role, room.facilitatorId);
    if (isFacilitator(assignedRole)) room.facilitatorId = userId;
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

  assignFacilitator(rooms, participants, internalRoom);
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

function handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }

  const { targetUserId, newRole } = payload || {};
  if (!newRole) {
    return sendError(sendToClient, ws, 'Missing new role.');
  }
  if (!isValidRole(newRole)) {
    return sendError(sendToClient, ws, 'Invalid role.');
  }

  const uid = targetUserId || currentUser.id;
  const target = participants[uid];
  if (!target) {
    return sendError(sendToClient, ws, 'User not found.');
  }
  if (!canChangeRole(currentUser.role, currentUser.id, uid)) {
    return sendError(sendToClient, ws, 'Only Facilitator can change others’ roles.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }
  if (target.roomName !== roomName) {
    return sendError(sendToClient, ws, 'Target user is not in your room.');
  }

  if (isFacilitator(newRole) && !target.authed) {
    return sendError(sendToClient, ws, 'Only company members can be made Facilitator.');
  }

  if (isFacilitator(newRole)) {
    if (room.facilitatorId && room.facilitatorId !== uid) {
      participants[room.facilitatorId].role = ROLES.VOTER;
    }
    room.facilitatorId = uid;
  } else if (uid === room.facilitatorId) {
    // The facilitator is stepping down: hand the role to another AUTHENTICATED
    // room member so the room is never left without anyone able to reveal or
    // reset votes — and so an anonymous Player can never inherit facilitation.
    const replacementId = Array.from(room.users).find(
      (id) => id !== uid && participants[id] && participants[id].authed
    );
    if (!replacementId) {
      return sendError(sendToClient, ws, 'Assign another facilitator before leaving the facilitator role.');
    }
    participants[replacementId].role = ROLES.FACILITATOR;
    room.facilitatorId = replacementId;
  }

  target.role = newRole;
  sendRoomState(roomName);
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
