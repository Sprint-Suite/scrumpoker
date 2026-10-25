const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ROOM_EXPIRY_MS,
  normalizeFacilitators,
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
  assert.deepEqual(updatedRoom.facilitatorIds, []);
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
  room.facilitatorIds = ['alice'];
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
      facilitatorIds: ['alice'],
      shareToken: rooms.get('alpha').shareToken,
      displayName: 'Alpha'
    }
  });
});

test('normalizeFacilitators chooses the first room member when needed', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);

  const participants = {
    alice: participant('alice', 'alpha', { authed: true }),
    bob: participant('bob', 'alpha', { authed: true })
  };

  assert.deepEqual(normalizeFacilitators(rooms, participants, 'alpha'), ['alice']);
  assert.deepEqual(rooms.get('alpha').facilitatorIds, ['alice']);
  assert.equal(participants.alice.role, 'Facilitator');
  assert.equal(participants.bob.role, 'Voter');
});

test('reassignFacilitatorIfLeaving promotes the next room member', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  room.facilitatorIds = ['alice'];

  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', authed: true }),
    bob: participant('bob', 'alpha', { authed: true })
  };

  leaveRoom(rooms, 'alpha', 'alice', 200);
  reassignFacilitatorIfLeaving(rooms, participants, 'alpha', 'alice');

  assert.deepEqual(rooms.get('alpha').facilitatorIds, ['bob']);
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

test('normalizeFacilitators skips anonymous participants', () => {
  const rooms = new Map();
  joinRoom(rooms, 'co1-r', 'anon1');
  joinRoom(rooms, 'co1-r', 'auth1');
  const participants = {
    anon1: { id: 'anon1', role: 'Voter', roomName: 'co1-r', authed: false },
    auth1: { id: 'auth1', role: 'Voter', roomName: 'co1-r', authed: true },
  };
  assert.deepEqual(normalizeFacilitators(rooms, participants, 'co1-r'), ['auth1']);

  const rooms2 = new Map();
  joinRoom(rooms2, 'co1-x', 'anonA');
  const p2 = { anonA: { id: 'anonA', role: 'Voter', roomName: 'co1-x', authed: false } };
  assert.deepEqual(normalizeFacilitators(rooms2, p2, 'co1-x'), []);
  assert.equal(p2.anonA.role, 'Voter');
});

test('normalizeFacilitators keeps a co-facilitator when one leaves', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  joinRoom(rooms, 'alpha', 'carol', 100);
  room.facilitatorIds = ['alice', 'bob'];
  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', authed: true }),
    bob: participant('bob', 'alpha', { role: 'Facilitator', authed: true }),
    carol: participant('carol', 'alpha', { authed: true })
  };

  leaveRoom(rooms, 'alpha', 'alice', 200);
  reassignFacilitatorIfLeaving(rooms, participants, 'alpha', 'alice');

  assert.deepEqual(room.facilitatorIds, ['bob']);
  assert.equal(participants.carol.role, 'Voter');
});

test('normalizeFacilitators drops missing, cross-room and duplicate ids and caps the list', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  joinRoom(rooms, 'alpha', 'carol', 100);
  joinRoom(rooms, 'alpha', 'guest', 100);
  joinRoom(rooms, 'beta', 'dave', 100);
  const participants = {
    alice: participant('alice', 'alpha', { authed: true }),
    bob: participant('bob', 'alpha', { authed: true }),
    carol: participant('carol', 'alpha', { authed: true }),
    guest: participant('guest', 'alpha', { authed: false }),
    dave: participant('dave', 'beta', { authed: true })
  };
  room.facilitatorIds = ['ghost', 'dave', 'guest', 'alice', 'alice', 'bob', 'carol'];

  assert.deepEqual(normalizeFacilitators(rooms, participants, 'alpha'), ['guest', 'alice']);
  assert.equal(participants.dave.role, 'Voter', 'a cross-room id is never promoted');
  assert.equal(participants.guest.role, 'Facilitator');
  assert.equal(participants.carol.role, 'Voter');
  assert.equal(participants.alice.role, 'Facilitator');
  assert.equal(participants.bob.role, 'Voter');
});

test('normalizeFacilitators keeps a guest facilitator alone in a guest-only room', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'g1', 100);
  joinRoom(rooms, 'alpha', 'g2', 100);
  const participants = {
    g1: participant('g1', 'alpha', { authed: false }),
    g2: participant('g2', 'alpha', { authed: false })
  };
  room.facilitatorIds = ['g1'];

  assert.deepEqual(normalizeFacilitators(rooms, participants, 'alpha'), ['g1']);

  leaveRoom(rooms, 'alpha', 'g1', 200);
  reassignFacilitatorIfLeaving(rooms, participants, 'alpha', 'g1');

  assert.deepEqual(room.facilitatorIds, []);
  assert.equal(participants.g2.role, 'Voter');
});

test('normalizeFacilitators demotes a Facilitator role that is not on the list', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  room.facilitatorIds = ['alice'];
  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', authed: true }),
    bob: participant('bob', 'alpha', { role: 'Facilitator', authed: true })
  };

  normalizeFacilitators(rooms, participants, 'alpha');

  assert.equal(participants.bob.role, 'Voter');
});

test('normalizeFacilitators demotes a stale participant of this room who is no longer a member', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  room.facilitatorIds = ['alice', 'stale'];
  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', authed: true }),
    stale: participant('stale', 'alpha', { role: 'Facilitator', authed: true })
  };

  normalizeFacilitators(rooms, participants, 'alpha');

  assert.deepEqual(room.facilitatorIds, ['alice']);
  assert.equal(participants.stale.role, 'Voter');
});

