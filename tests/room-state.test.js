const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ROOM_EXPIRY_MS,
  assignFacilitator,
  expireRooms,
  getRoomParticipants,
  getRoomState,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving,
  touchRoom
} = require('../lib/roomState');

function participant(id, roomName, overrides = {}) {
  return {
    id,
    ws: { socket: id },
    name: id,
    role: 'Voter',
    vote: null,
    roomName,
    ...overrides
  };
}

test('joinRoom creates and updates room membership', () => {
  const rooms = new Map();

  const createdRoom = joinRoom(rooms, 'alpha', 'alice', 100);
  const updatedRoom = joinRoom(rooms, 'alpha', 'bob', 150);

  assert.equal(createdRoom, updatedRoom);
  assert.deepEqual([...updatedRoom.users], ['alice', 'bob']);
  assert.equal(updatedRoom.lastActive, 150);
  assert.equal(updatedRoom.votesRevealed, false);
  assert.equal(updatedRoom.facilitatorId, null);
});

test('leaveRoom updates activity and removes empty rooms', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);

  const roomAfterAliceLeaves = leaveRoom(rooms, 'alpha', 'alice', 200);
  assert.deepEqual([...roomAfterAliceLeaves.users], ['bob']);
  assert.equal(roomAfterAliceLeaves.lastActive, 200);
  assert.equal(rooms.has('alpha'), true);

  const roomAfterBobLeaves = leaveRoom(rooms, 'alpha', 'bob', 300);
  assert.equal(roomAfterBobLeaves, null);
  assert.equal(rooms.has('alpha'), false);
});

test('expireRooms deletes rooms idle beyond the expiry window', () => {
  const rooms = new Map();
  joinRoom(rooms, 'stale', 'alice', 100);
  joinRoom(rooms, 'active', 'bob', 200);

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS + 1);

  assert.deepEqual(expired, ['stale']);
  assert.equal(rooms.has('stale'), false);
  assert.equal(rooms.has('active'), true);
});

test('touchRoom refreshes activity and keeps a busy room alive', () => {
  const rooms = new Map();
  joinRoom(rooms, 'active', 'alice', 100);

  const touched = touchRoom(rooms, 'active', 100 + DEFAULT_ROOM_EXPIRY_MS);
  assert.equal(touched.lastActive, 100 + DEFAULT_ROOM_EXPIRY_MS);

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS + 1);
  assert.deepEqual(expired, []);
  assert.equal(rooms.has('active'), true);

  assert.equal(touchRoom(rooms, 'missing'), null);
});

test('expireRooms drops participants of expired rooms', () => {
  const rooms = new Map();
  joinRoom(rooms, 'stale', 'alice', 100);
  joinRoom(rooms, 'active', 'bob', 100 + DEFAULT_ROOM_EXPIRY_MS);

  const participants = {
    alice: participant('alice', 'stale'),
    bob: participant('bob', 'active')
  };

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS + 1, DEFAULT_ROOM_EXPIRY_MS, participants);

  assert.deepEqual(expired, ['stale']);
  assert.equal(participants.alice, undefined);
  assert.deepEqual(Object.keys(participants), ['bob']);
});

test('expireRooms leaves rooms inside the expiry window', () => {
  const rooms = new Map();
  joinRoom(rooms, 'active', 'alice', 100);

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS);

  assert.deepEqual(expired, []);
  assert.equal(rooms.has('active'), true);
});

test('getRoomParticipants filters by room and strips sockets', () => {
  const participants = {
    alice: participant('alice', 'alpha', { vote: '5' }),
    bob: participant('bob', 'alpha'),
    oscar: participant('oscar', 'beta')
  };

  assert.deepEqual(getRoomParticipants(participants, 'alpha'), [
    {
      id: 'alice',
      name: 'alice',
      role: 'Voter',
      vote: '5',
      roomName: 'alpha'
    },
    {
      id: 'bob',
      name: 'bob',
      role: 'Voter',
      vote: null,
      roomName: 'alpha'
    }
  ]);
});

test('getRoomState projects room reveal and facilitator state', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  room.votesRevealed = true;
  room.facilitatorId = 'alice';
  room.displayName = 'Alpha';

  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', vote: '8' })
  };

  const state = getRoomState(rooms, participants, 'alpha');
  assert.deepEqual(state, {
    type: 'updateState',
    payload: {
      participants: [
        {
          id: 'alice',
          name: 'alice',
          role: 'Facilitator',
          vote: '8',
          roomName: 'alpha'
        }
      ],
      votesRevealed: true,
      facilitatorId: 'alice',
      shareToken: rooms.get('alpha').shareToken,
      displayName: 'Alpha'
    }
  });
});

test('assignFacilitator chooses the first room member when needed', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);

  const participants = {
    alice: participant('alice', 'alpha', { authed: true }),
    bob: participant('bob', 'alpha', { authed: true })
  };

  const facilitatorId = assignFacilitator(rooms, participants, 'alpha');

  assert.equal(facilitatorId, 'alice');
  assert.equal(rooms.get('alpha').facilitatorId, 'alice');
  assert.equal(participants.alice.role, 'Facilitator');
  assert.equal(participants.bob.role, 'Voter');
});

test('reassignFacilitatorIfLeaving promotes the next room member', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  room.facilitatorId = 'alice';

  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', authed: true }),
    bob: participant('bob', 'alpha', { authed: true })
  };

  leaveRoom(rooms, 'alpha', 'alice', 200);
  reassignFacilitatorIfLeaving(rooms, participants, 'alpha', 'alice');

  assert.equal(rooms.get('alpha').facilitatorId, 'bob');
  assert.equal(participants.bob.role, 'Facilitator');
});

test("a created room has a non-empty hex shareToken and is findable by it", () => {
  const { joinRoom, findRoomByToken } = require("../lib/roomState");
  const rooms = new Map();
  joinRoom(rooms, "co1-planning", "u1");
  const room = rooms.get("co1-planning");
  assert.match(room.shareToken, /^[0-9a-f]{32}$/);
  assert.equal(findRoomByToken(rooms, room.shareToken), "co1-planning");
  assert.equal(findRoomByToken(rooms, "nope"), null);
  assert.equal(findRoomByToken(rooms, ""), null);
});

test('getRoomState includes the room shareToken', () => {
  const { joinRoom, getRoomState } = require('../lib/roomState');
  const rooms = new Map();
  joinRoom(rooms, 'co1-r', 'u1');
  const state = getRoomState(rooms, {}, 'co1-r');
  assert.match(state.payload.shareToken, /^[0-9a-f]{32}$/);
});

test('getRoomParticipants does not leak the internal authed flag', () => {
  const { getRoomParticipants } = require('../lib/roomState');
  const participants = { u1: { id: 'u1', ws: {}, name: 'U', role: 'Voter', vote: null, roomName: 'co1-r', authed: true } };
  const out = getRoomParticipants(participants, 'co1-r');
  assert.equal(out.length, 1);
  assert.equal(out[0].authed, undefined);
  assert.equal(out[0].name, 'U');
});

test('assignFacilitator skips anonymous participants', () => {
  const { joinRoom, assignFacilitator } = require('../lib/roomState');
  const rooms = new Map();
  joinRoom(rooms, 'co1-r', 'anon1');
  joinRoom(rooms, 'co1-r', 'auth1');
  const participants = {
    anon1: { id: 'anon1', role: 'Voter', roomName: 'co1-r', authed: false },
    auth1: { id: 'auth1', role: 'Voter', roomName: 'co1-r', authed: true },
  };
  const fid = assignFacilitator(rooms, participants, 'co1-r');
  assert.equal(fid, 'auth1');

  const rooms2 = new Map();
  joinRoom(rooms2, 'co1-x', 'anonA');
  const p2 = { anonA: { id: 'anonA', role: 'Voter', roomName: 'co1-x', authed: false } };
  assert.equal(assignFacilitator(rooms2, p2, 'co1-x'), null);
});
