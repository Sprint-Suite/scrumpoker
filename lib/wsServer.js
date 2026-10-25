const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { getRoomState, touchRoom, findRoomByToken } = require('./roomState');
const { authenticateUpgrade } = require('./upgradeAuth');
const { startHeartbeat, trackSocket } = require('./heartbeat');
const { LIMITS, clientIp, createAdmission, createMessageBucket } = require('./wsLimits');
const {
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleStartNextRound,
  handleVote
} = require('./wsHandlers');
const { validateMessage } = require('../schemas/ws');

function isMessageEnvelope(parsed) {
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && typeof parsed.type === 'string';
}

async function decideUpgrade({ verifySession, cookie, url, rooms }) {
  const sess = await authenticateUpgrade(verifySession, cookie);
  if (sess.ok) {
    const c = sess.context;
    return { ok: true, authed: true, hubUserId: c.userId, teams: c.teams || [], company: c.company || null };
  }
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const token = new URLSearchParams(q).get('token');
  const anonRoom = findRoomByToken(rooms, token);
  if (anonRoom) return { ok: true, authed: false, anonRoom, anonToken: token };
  return { ok: false, status: 401 };
}

const REFUSAL_TEXT = { 401: 'Unauthorized', 429: 'Too Many Requests', 503: 'Service Unavailable' };

function refuseUpgrade(socket, status) {
  socket.write(`HTTP/1.1 ${status} ${REFUSAL_TEXT[status]}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function labelSocket(ws, decision) {
  ws.authed = decision.authed;
  if (decision.authed) {
    ws.hubUserId = decision.hubUserId;
    ws.company = decision.company;
  } else {
    ws.anonRoom = decision.anonRoom;
    ws.anonToken = decision.anonToken;
  }
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function createWsServer({ server, rooms, auth, logger = console, limits = {}, now = Date.now }) {
  const config = { ...LIMITS, ...limits };
  const admission = createAdmission({ limits: config, now });
  const sweepTimer = setInterval(() => admission.sweep(), config.sweepIntervalMs);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  let warnedUnforwarded = false;
  const participants = {};
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });

  // Reserves a slot before auth runs. The slot is held until the raw socket has
  // closed AND its auth check has settled: the hub call cannot be cancelled, so
  // a client that drops mid-auth must not free capacity for another hub call.
  function admitUpgrade(req, socket) {
    const { ip, forwarded } = clientIp(req);
    if (!forwarded && ip === '127.0.0.1' && !warnedUnforwarded) {
      warnedUnforwarded = true;
      logger.warn('ws: loopback upgrade without X-Forwarded-For; per-IP limits see the proxy, not the client');
    }
    const admitted = admission.admit(ip);
    if (!admitted.ok) {
      logger.warn({ ip, status: admitted.status }, 'ws: upgrade refused by connection limits');
      refuseUpgrade(socket, admitted.status);
      return null;
    }
    let holds = 2;
    const releaseHold = () => {
      holds -= 1;
      if (holds === 0) admitted.release();
    };
    socket.once('close', releaseHold);
    const destroy = () => socket.destroy();
    const deadline = setTimeout(destroy, config.upgradeDeadlineMs);
    socket.once('end', destroy);
    return function authSettled() {
      clearTimeout(deadline);
      socket.removeListener('end', destroy);
      releaseHold();
    };
  }

  async function authorizeUpgrade(req, url) {
    try {
      return await decideUpgrade({ verifySession: auth.verifySession, cookie: req.headers.cookie, url, rooms });
    } catch (err) {
      logger.error({ err }, 'WS upgrade auth error');
      return { ok: false, status: 401 };
    }
  }

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const url = String(req.url || '');
    if (url !== '/ws' && !url.startsWith('/ws?')) {
      socket.destroy();
      return;
    }
    const authSettled = admitUpgrade(req, socket);
    if (!authSettled) return;
    const decision = await authorizeUpgrade(req, url);
    authSettled();
    // Disconnected or past the deadline while auth ran: never upgrade it.
    if (socket.destroyed) return;
    if (!decision.ok) {
      refuseUpgrade(socket, decision.status);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      labelSocket(ws, decision);
      wss.emit('connection', ws, req);
    });
  });

  function sendToRoom(roomName, message) {
    const room = rooms.get(roomName);
    if (!room) return;

    room.users.forEach((id) => {
      const clientSocket = participants[id]?.ws;
      if (clientSocket?.readyState === WebSocket.OPEN) {
        sendToClient(clientSocket, message);
      }
    });
  }

  function sendRoomState(roomName) {
    // Count any broadcast as activity so live sessions are not swept by expireRooms.
    touchRoom(rooms, roomName);
    sendToRoom(roomName, getRoomState(rooms, participants, roomName));
  }

  function handleExit(userId) {
    const participant = participants[userId];
    if (participant) {
      handleParticipantExit({ userId, participants, rooms, sendRoomState });
    }
  }

  // Once tripped, the socket is never read again, even after its bucket refills.
  function closeFlooder(ws) {
    ws.limited = true;
    logger.warn({ userId: ws.userId }, 'ws: message rate exceeded, closing');
    ws.close(1008, 'Too many messages');
    const timer = setTimeout(() => ws.terminate(), config.floodTerminateMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  wss.on('connection', (ws, req) => {
    const userId = uuidv4();
    ws.userId = userId;
    trackSocket(ws);
    const bucket = createMessageBucket({ capacity: config.bucketCapacity, refillPerSec: config.bucketRefillPerSec, now });

    sendToClient(ws, { type: 'yourId', payload: { id: userId } });

    ws.on('message', (message) => {
      if (ws.limited) return;
      if (!bucket.take()) {
        closeFlooder(ws);
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch (err) {
        logger.warn({ err }, 'ws: invalid JSON — message dropped');
        return;
      }

      if (!isMessageEnvelope(parsed)) {
        logger.warn({ kind: Array.isArray(parsed) ? 'array' : typeof parsed }, 'ws: malformed message envelope — dropped');
        return;
      }

      const { type, payload } = parsed;

      // Schema-validate the payload for known message types.
      // Unknown types are allowed to fall through to the default: case (which replies with an error).
      const validation = validateMessage(type, payload);
      if (!validation.ok && validation.error?.message !== 'unknown_message_type') {
        logger.warn({ err: validation.error, type }, 'invalid ws payload');
        return;
      }

      const currentUser = participants[userId];

      switch (type) {
        case 'login': {
          handleLogin({
            ws,
            userId,
            payload,
            rooms,
            participants,
            sendToClient,
            sendRoomState
          });
          break;
        }

        case 'vote':
          handleVote({ ws, currentUser, payload, rooms, sendToClient, sendRoomState });
          break;

        case 'revealVotes':
          handleRevealVotes({ ws, currentUser, rooms, sendToClient, sendRoomState });
          break;

        case 'resetVotes':
          handleResetVotes({ ws, currentUser, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'endSession':
          handleEndSession({ ws, currentUser, participants, rooms, sendToClient, sendToRoom });
          break;

        case 'startNextRound':
          handleStartNextRound({ ws, currentUser, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'changeRole':
          handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'logout':
          handleExit(userId);
          break;

        default:
          sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
      }
    });

    ws.on('close', () => {
      handleExit(userId);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for user ${userId}:`, error);
      handleExit(userId);
    });
  });

  const stopHeartbeat = startHeartbeat({ wss, participants, rooms });

  return {
    participants,
    sendRoomState,
    sendToClient,
    sendToRoom,
    stopHeartbeat,
    stop: () => {
      stopHeartbeat();
      clearInterval(sweepTimer);
    },
    limitStats: admission.stats,
    wss
  };
}

module.exports = {
  createWsServer,
  sendToClient,
  decideUpgrade
};
