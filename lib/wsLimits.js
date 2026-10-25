const { isIP } = require('node:net');

// Sized for teams of ~15 with generous headroom: an office behind one NAT with
// two tabs each stays well under perIp, and a restart's reconnect wave under the
// attempt window.
const LIMITS = {
  perIp: 40,
  global: 400,
  attemptsPerWindow: 60,
  attemptWindowMs: 10 * 1000,
  maxTrackedIps: 10000,
  upgradeDeadlineMs: 10 * 1000,
  bucketCapacity: 20,
  bucketRefillPerSec: 5,
  floodTerminateMs: 2 * 1000,
  sweepIntervalMs: 10 * 1000
};

const LOOPBACK = new Set(['127.0.0.1', '::1']);

function normalizeIp(value) {
  const ip = String(value || '').trim();
  const unmapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return isIP(unmapped) ? unmapped : null;
}

// The proxy on the box appends the real client to X-Forwarded-For. Anything a
// remote peer sends in that header is ignored.
function clientIp(req) {
  const peer = normalizeIp(req.socket?.remoteAddress) || 'unknown';
  const header = req.headers?.['x-forwarded-for'];
  if (!LOOPBACK.has(peer) || typeof header !== 'string') return { ip: peer, forwarded: false };
  const forwarded = normalizeIp(header.split(',').pop());
  return forwarded ? { ip: forwarded, forwarded: true } : { ip: peer, forwarded: false };
}

function createAdmission({ limits = LIMITS, now = Date.now } = {}) {
  const openByIp = new Map();
  const attemptsByIp = new Map();
  let open = 0;

  function recentAttempts(ip) {
    const cutoff = now() - limits.attemptWindowMs;
    const log = (attemptsByIp.get(ip) || []).filter((t) => t > cutoff);
    if (log.length) attemptsByIp.set(ip, log);
    else attemptsByIp.delete(ip);
    return log;
  }

  function refusal(ip) {
    if (!attemptsByIp.has(ip) && attemptsByIp.size >= limits.maxTrackedIps) return 429;
    if (recentAttempts(ip).length >= limits.attemptsPerWindow) return 429;
    if (open >= limits.global) return 503;
    if ((openByIp.get(ip) || 0) >= limits.perIp) return 429;
    return null;
  }

  function admit(ip) {
    const status = refusal(ip);
    if (status) return { ok: false, status };

    attemptsByIp.set(ip, [...(attemptsByIp.get(ip) || []), now()]);
    openByIp.set(ip, (openByIp.get(ip) || 0) + 1);
    open += 1;

    let released = false;
    function release() {
      if (released) return;
      released = true;
      open -= 1;
      const left = openByIp.get(ip) - 1;
      if (left > 0) openByIp.set(ip, left);
      else openByIp.delete(ip);
    }
    return { ok: true, release };
  }

  function sweep() {
    for (const ip of [...attemptsByIp.keys()]) recentAttempts(ip);
  }

  function stats() {
    return { open, ipsWithOpenSockets: openByIp.size, trackedIps: attemptsByIp.size };
  }

  return { admit, sweep, stats };
}

function createMessageBucket({ capacity, refillPerSec, now = Date.now }) {
  let tokens = capacity;
  let last = now();

  function take() {
    const t = now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  }

  return { take };
}

module.exports = {
  LIMITS,
  clientIp,
  createAdmission,
  createMessageBucket
};
