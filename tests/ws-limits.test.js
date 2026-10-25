const test = require('node:test');
const assert = require('node:assert/strict');

const { LIMITS, clientIp, createAdmission, createMessageBucket } = require('../lib/wsLimits');

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function limits(overrides = {}) {
  return { ...LIMITS, ...overrides };
}

function req(remoteAddress, xff) {
  return { socket: { remoteAddress }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } };
}

test('clientIp trusts the rightmost X-Forwarded-For entry only from a loopback peer', () => {
  assert.deepEqual(clientIp(req('127.0.0.1', '198.51.100.1, 203.0.113.7')), { ip: '203.0.113.7', forwarded: true });
  assert.deepEqual(clientIp(req('::ffff:127.0.0.1', ' 203.0.113.7 ')), { ip: '203.0.113.7', forwarded: true });
  assert.deepEqual(clientIp(req('::1', '::ffff:203.0.113.7')), { ip: '203.0.113.7', forwarded: true });
});

test('clientIp ignores X-Forwarded-For from a non-loopback peer', () => {
  assert.deepEqual(clientIp(req('198.51.100.9', '203.0.113.7')), { ip: '198.51.100.9', forwarded: false });
  assert.deepEqual(clientIp(req('::ffff:198.51.100.9')), { ip: '198.51.100.9', forwarded: false });
});

test('clientIp falls back to the peer for a missing or malformed header', () => {
  assert.deepEqual(clientIp(req('127.0.0.1')), { ip: '127.0.0.1', forwarded: false });
  assert.deepEqual(clientIp(req('127.0.0.1', 'not-an-ip')), { ip: '127.0.0.1', forwarded: false });
  assert.deepEqual(clientIp(req('127.0.0.1', '203.0.113.7, ')), { ip: '127.0.0.1', forwarded: false });
});

test('admission caps concurrent reservations per IP and releases them exactly once', () => {
  const c = clock();
  const admission = createAdmission({ limits: limits({ perIp: 2 }), now: c.now });
  const a = admission.admit('ip1');
  const b = admission.admit('ip1');
  assert.ok(a.ok && b.ok);
  assert.deepEqual(admission.admit('ip1'), { ok: false, status: 429 });
  assert.ok(admission.admit('ip2').ok, 'other IPs are unaffected');

  a.release();
  a.release();
  assert.ok(admission.admit('ip1').ok, 'one release frees one slot');
  assert.deepEqual(admission.admit('ip1'), { ok: false, status: 429 }, 'a double release frees nothing extra');
});

test('admission caps concurrent reservations globally with 503', () => {
  const admission = createAdmission({ limits: limits({ global: 2 }), now: clock().now });
  assert.ok(admission.admit('ip1').ok);
  assert.ok(admission.admit('ip2').ok);
  assert.deepEqual(admission.admit('ip3'), { ok: false, status: 503 });
});

test('admitted attempts are limited per IP over a sliding window, independent of releases', () => {
  const c = clock();
  const admission = createAdmission({ limits: limits({ attemptsPerWindow: 3, attemptWindowMs: 10_000 }), now: c.now });
  for (let i = 0; i < 3; i += 1) {
    admission.admit('ip1').release();
    c.advance(1000);
  }
  assert.deepEqual(admission.admit('ip1'), { ok: false, status: 429 }, 'connect/disconnect churn does not reset the window');

  c.advance(7001); // the first attempt is now older than the window
  assert.ok(admission.admit('ip1').ok);
  assert.deepEqual(admission.admit('ip1'), { ok: false, status: 429 }, 'the window slides rather than resetting');
});

test('refused attempts do not extend the window', () => {
  const c = clock();
  const admission = createAdmission({ limits: limits({ attemptsPerWindow: 1, attemptWindowMs: 1000 }), now: c.now });
  admission.admit('ip1').release();
  c.advance(500);
  assert.equal(admission.admit('ip1').ok, false);
  c.advance(501);
  assert.ok(admission.admit('ip1').ok);
});

test('sweep expires attempt history for IPs that never return', () => {
  const c = clock();
  const admission = createAdmission({ limits: limits({ attemptWindowMs: 1000 }), now: c.now });
  admission.admit('ip1').release();
  admission.admit('ip2').release();
  assert.equal(admission.stats().trackedIps, 2);
  c.advance(1001);
  admission.sweep();
  assert.equal(admission.stats().trackedIps, 0);
});

test('a full attempt map refuses unknown IPs and keeps serving known ones', () => {
  const admission = createAdmission({ limits: limits({ maxTrackedIps: 2 }), now: clock().now });
  admission.admit('ip1').release();
  admission.admit('ip2').release();
  assert.deepEqual(admission.admit('ip3'), { ok: false, status: 429 });
  assert.ok(admission.admit('ip1').ok);
});

test('stats reflect open reservations and drop per-IP counters at zero', () => {
  const admission = createAdmission({ limits: limits(), now: clock().now });
  const a = admission.admit('ip1');
  assert.deepEqual(admission.stats(), { open: 1, ipsWithOpenSockets: 1, trackedIps: 1 });
  a.release();
  assert.deepEqual(admission.stats(), { open: 0, ipsWithOpenSockets: 0, trackedIps: 1 });
});

test('message bucket allows a burst, then refills at the configured rate', () => {
  const c = clock();
  const bucket = createMessageBucket({ capacity: 3, refillPerSec: 2, now: c.now });
  assert.ok(bucket.take() && bucket.take() && bucket.take());
  assert.equal(bucket.take(), false);
  c.advance(500); // one token
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
  c.advance(10_000);
  assert.ok(bucket.take() && bucket.take() && bucket.take(), 'refill is capped at capacity');
  assert.equal(bucket.take(), false);
});
