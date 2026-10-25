// tests/ws-schema.test.js — unit tests for schemas/ws.js validateMessage().
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMessage } = require('../schemas/ws');

// --- login ---

test('validateMessage: login with name+role+room is valid', () => {
  const result = validateMessage('login', { name: 'Alice', role: 'Facilitator', room: 'sprint-1' });
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'Alice');
  assert.equal(result.data.role, 'Facilitator');
  assert.equal(result.data.room, 'sprint-1');
});

test('validateMessage: login with name only (anon) is valid', () => {
  const result = validateMessage('login', { name: 'Bob' });
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'Bob');
  assert.equal(result.data.role, undefined);
});

test('validateMessage: login with empty name is invalid', () => {
  const result = validateMessage('login', { name: '', role: 'Voter', room: 'r1' });
  assert.equal(result.ok, false);
});

test('validateMessage: login with missing name is invalid', () => {
  const result = validateMessage('login', { role: 'Voter', room: 'r1' });
  assert.equal(result.ok, false);
});

test('validateMessage: login with name exceeding 80 chars is invalid', () => {
  const result = validateMessage('login', { name: 'x'.repeat(81), role: 'Voter', room: 'r1' });
  assert.equal(result.ok, false);
});

test('validateMessage: login with invalid role is invalid', () => {
  const result = validateMessage('login', { name: 'Alice', role: 'Superuser', room: 'r1' });
  assert.equal(result.ok, false);
});

test('validateMessage: login with a 150-char room name is valid (old handler had no length cap)', () => {
  const result = validateMessage('login', { name: 'Alice', role: 'Facilitator', room: 'r'.repeat(150) });
  assert.equal(result.ok, true);
});

// --- vote ---

test('validateMessage: vote with valid value is valid', () => {
  for (const v of ['0', '1', '2', '3', '5', '8', '13', '?']) {
    const result = validateMessage('vote', { vote: v });
    assert.equal(result.ok, true, `expected ok for vote="${v}"`);
    assert.equal(result.data.vote, v);
  }
});

test('validateMessage: vote with invalid value is invalid', () => {
  const result = validateMessage('vote', { vote: '99' });
  assert.equal(result.ok, false);
});

test('validateMessage: vote with missing vote field is invalid', () => {
  const result = validateMessage('vote', {});
  assert.equal(result.ok, false);
});

// --- no-payload types ---

test('validateMessage: revealVotes with empty payload is valid', () => {
  const result = validateMessage('revealVotes', {});
  assert.equal(result.ok, true);
});

test('validateMessage: resetVotes with empty payload is valid', () => {
  const result = validateMessage('resetVotes', {});
  assert.equal(result.ok, true);
});

test('validateMessage: startNextRound with empty payload is valid', () => {
  const result = validateMessage('startNextRound', {});
  assert.equal(result.ok, true);
});

test('validateMessage: endSession with empty payload is valid', () => {
  const result = validateMessage('endSession', {});
  assert.equal(result.ok, true);
});

test('validateMessage: logout with empty payload is valid', () => {
  const result = validateMessage('logout', {});
  assert.equal(result.ok, true);
});

test('validateMessage: logout with null payload (treated as {}) is valid', () => {
  const result = validateMessage('logout', null);
  assert.equal(result.ok, true);
});

// --- changeRole ---

test('validateMessage: changeRole with targetUserId and valid newRole is valid', () => {
  const result = validateMessage('changeRole', { targetUserId: 'abc-123', newRole: 'Observer' });
  assert.equal(result.ok, true);
  assert.equal(result.data.newRole, 'Observer');
});

test('validateMessage: changeRole without targetUserId (self) is valid', () => {
  const result = validateMessage('changeRole', { newRole: 'Voter' });
  assert.equal(result.ok, true);
});

test('validateMessage: changeRole with missing newRole is invalid', () => {
  const result = validateMessage('changeRole', { targetUserId: 'abc' });
  assert.equal(result.ok, false);
});

test('validateMessage: changeRole with invalid newRole is invalid', () => {
  const result = validateMessage('changeRole', { newRole: 'Admin' });
  assert.equal(result.ok, false);
});

// --- unknown type ---

test('validateMessage: unknown type returns ok:false with unknown_message_type', () => {
  const result = validateMessage('setRoundItem', { itemTitle: 'Checkout' });
  assert.equal(result.ok, false);
  assert.equal(result.error?.message, 'unknown_message_type');
});

test('validateMessage: inherited Object.prototype names are unknown types, not crashes', () => {
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const result = validateMessage(type, {});
    assert.equal(result.ok, false, type);
    assert.equal(result.error.message, 'unknown_message_type', type);
  }
});

test('validateMessage: login accepts a 32-hex rejoinKey and rejects other lengths', () => {
  assert.equal(validateMessage('login', { name: 'G', rejoinKey: 'a'.repeat(32) }).ok, true);
  assert.equal(validateMessage('login', { name: 'G', rejoinKey: 'abc' }).ok, false);
  assert.equal(validateMessage('login', { name: 'G', rejoinKey: 'a'.repeat(33) }).ok, false);
});
