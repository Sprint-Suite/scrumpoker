# Debate: Design: WebSocket connection and message rate limits for scrumpoker

- Id: 2026-10-25-design-websocket-connection-and-message-rate-limit
- Opened: 2026-10-25T13:14:14.331Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Context: David is the only user for now; teams up to ~15 people; he wants extra contingency. Current state (lib/wsServer.js): upgrade requires a hub session cookie or a valid room shareToken; maxPayload 64 KB; no limit on concurrent sockets, upgrade attempts or message rate. Apache reverse-proxies /ws (docs/techstack-overview.md), so req.socket.remoteAddress is loopback and the client IP is in X-Forwarded-For; Node listens on 0.0.0.0:3000 (server.js), so XFF must only be trusted when the peer is loopback. The member client (public/js/app.js ~L136-151) reconnects every 5s after close; the guest page (join.js) opens its socket on Join.

Proposed design, one new module lib/wsLimits.js (pure, clock-injected, unit-tested) wired into wsServer.js:
1. Client IP: rightmost X-Forwarded-For entry when remoteAddress is loopback (127.0.0.1/::1/::ffff:127.0.0.1), else remoteAddress.
2. Concurrent sockets per IP: 40 (a 15-person office behind one NAT with ~2 tabs each, plus margin). Over: refuse upgrade with HTTP 429 before auth runs.
3. Global concurrent sockets: 400. Over: 503.
4. Upgrade attempts per IP: 60 per 10s sliding/fixed window, checked BEFORE the auth lookup (so floods do not hit the sessions DB). Sized so 40 tabs reconnecting together after a restart are not locked out.
5. Per-socket message rate: token bucket, capacity 20, refill 5/s. Legit use is well under 1 msg/s per socket. On empty bucket: close the socket with 1008 'rate limit' and log once. The member client reconnects after 5s (bounded by 2-4).
6. Counters decrement on socket close; per-IP entries deleted at zero so the map cannot grow unbounded; attempt windows pruned lazily.
Constants in one place; no env knobs (YAGNI). Out of scope: closing refused guest sockets (bounded by 2), persistence.
Tests: unit tests for the limiter (buckets, windows, IP extraction incl. spoofed XFF from a non-loopback peer) and integration tests in the style of tests/ws-server-upgrade.test.js for 429 on the 41st socket, 1008 after a burst, and counter release on close.

Challenge the numbers, the close-vs-drop choice for message floods, and whether anything here fails open.

## Round 1/3 — ChatGPT: OBJECT

The numbers are reasonable initial defaults for a small team: 40 sockets/IP accommodates 30 tabs, 400 globally provides contingency, and a 20-token burst with 5/s refill comfortably exceeds normal interaction. I support a clock-injected module and centralized constants, but the design needs these corrections before agreement.

1. Reserve capacity before awaiting auth. lib/wsServer.js:59 awaits decideUpgrade before handleUpgrade. Checking established sockets before that await and incrementing afterward lets simultaneous requests pass the same capacity check. Count pending upgrades plus established sockets; release reservations exactly once on auth rejection/error, handshake failure, disconnect, and timeout. Test concurrent requests with deferred authentication, including the global limit. A sequential 41st-socket test misses this failure.

2. Close on message floods, but make exclusion permanent. Silent dropping can leave votes or facilitator actions unapplied without feedback. However, ws.close(1008) starts a closing handshake; node_modules/ws/lib/websocket.js:1238 still forwards received messages without checking OPEN. Gate lib/wsServer.js's message handler before JSON parsing, validation, or logging; once limited, never process another message even after bucket refill. Retain capacity until transport close and use a short, bounded termination fallback. Test malformed-message floods and messages sent after closure starts.

3. Specify bounded attempt-state retention. Deleting connection counters at zero must not erase attempt history, or connect/disconnect cycles bypass the attempt limit. Conversely, pruning only when the same IP returns leaves expired entries for one-off IPs indefinitely. Keep attempt history independently, sweep expired entries across keys, and define a hard map-cap policy that rejects new keys rather than silently bypassing enforcement. Test churn and expiry without revisiting old IPs. Choose sliding or fixed windows explicitly; fixed windows permit 120 attempts around a boundary.

4. Correct the reconnect assumption. public/js/app.js:136–151 retries an established connection after 5s, but a failed upgrade triggers a page reload after 1.5s. Forty rejected tabs can therefore generate roughly 27 attempts/s and repeatedly exceed 60/10s. Include bounded backoff with jitter and recovery coverage; show a policy-limit message for 1008. Initial upgrade rejection also currently gets misreported as an expired session.

5. Make proxy trust an explicit deployment condition. Rightmost XFF is appropriate only when the loopback proxy appends or overwrites it with the actual peer address. Verify that behavior for /ws, validate and normalize the selected address, and fall back to the socket peer for malformed headers. Ignore XFF from non-loopback peers as proposed. Also, server.js currently defaults to port 3005, not 3000; the overview is stale.

Finally, tests/ws-server-upgrade.test.js contains decision-unit tests, not network integration tests. Add actual transport coverage for these lifecycle cases. The existing upgrade and heartbeat test files passed during this review; no files were changed.

## Round 2/3 — Claude

Conceded on all five. I checked app.js: a socket that never opened shows 'session expired' and reloads after 1.5s, as you said. Revised design:

1. Reservation: at upgrade entry, synchronously reserve a per-IP and a global slot BEFORE awaiting auth. The reservation returns an idempotent release(), called exactly once from: auth reject, auth error, handshake failure, or the ws 'close' event. Tests use a deferred verifySession so N concurrent upgrades race against both caps.

2. Floods: per-socket token bucket (20 capacity, 5/s). When empty, set ws.limited, ws.close(1008,'rate limit') and arm an unref'd 2s terminate() fallback. The message handler checks ws.limited as its FIRST statement, before JSON.parse, validation or logging, so nothing is processed after the limit trips, even after refill. The slot is held until transport 'close'. Tests: malformed-JSON flood and messages sent after close begins.

3. Attempts: per-IP sliding log (timestamps, at most 60 kept), limit 60 per 10s, independent of connection counts, so churn cannot reset it. An unref'd sweep every 10s deletes keys whose newest timestamp is past the window, across all keys. Hard cap 10,000 tracked IPs: while full, unknown IPs are refused (fail closed). Tests for churn, and for expiry without the IP returning.

4. Client: browsers cannot see a 429 status, so limit refusals (attempts, per-IP, global) complete the handshake WITHOUT running auth and immediately close with 1013 'try again later'. They hold no slot. In app.js and join.js, codes 1013 and 1008 show 'Too many connections, retrying…' and retry with exponential backoff, 5s doubling to 60s with ±20% jitter, reset on a successful open. No reload. The 401 path stays as it is (pre-existing), but is now attempt-limited. Recovery covered by an e2e or a client unit test.

5. Proxy: rightmost XFF entry, trimmed and validated with net.isIP (and ::ffff: normalised), only when the peer is loopback; otherwise, or if malformed, the socket peer. Deployment gate: before merge I verify on prod that Apache's /ws proxy appends XFF. If it does not, every client collapses to 127.0.0.1, and the per-IP cap would act as a 40-socket global cap, so the fix goes into the vhost first. Noted that the server.js default port is 3005; prod sets 3000 by env.

Transport coverage: a new test file starting the real server on an ephemeral port, with real ws clients, for the 41st-socket 1013, the flood 1008, and slot release on close.

## Round 2/3 — ChatGPT: OBJECT

The revised reservation, message-flood handling, attempt history and proxy validation address most concerns. I accept the proposed numerical defaults. Three lifecycle issues remain.

1. Uncounted refusal sockets bypass the resource cap. Completing an unauthenticated handshake for every rejected attempt creates a real WebSocket even when the attempt limiter or global cap has fired. node_modules/ws/lib/websocket-server.js:439 adds it to wss.clients, and close() waits for a closing handshake rather than immediately destroying the transport (websocket.js:302–339). An attacker need not acknowledge closure. Even a 2s fallback would leave an uncapped population because rejected attempts can continually create these sockets. Keep HTTP 429/503 rejection before auth. Give browsers generic connection-failure backoff instead of requiring them to distinguish the HTTP status. If 1013 is retained, its sockets need a separate bounded capacity; exhaustion must reject without upgrading.

2. Resetting backoff on open defeats the proposed 1013 path. Every refusal completes the handshake, so app.js:110 and join.js:100 receive open before close and would reset the delay to 5s every time. Reset only after a meaningful healthy connection, such as receiving yourId on an authenticated/token-authorized socket, or a stable connection interval. Test repeated refusals through the 60s ceiling and recovery afterward. A 1008 message-rate violation should also say 'Too many messages', not 'Too many connections'.

3. Reservations need raw-socket cleanup and a deadline. Before auth completes there is no WebSocket whose close event can release the slot. lib/wsServer.js:59 can await a hub heartbeat through suite/shared/auth-client/lib/verify-session.js:30. Attach cleanup to the raw socket before awaiting auth, add a bounded upgrade deadline, and prevent a late auth result from upgrading a released reservation. Keep successful reservations held through transport closure. Test disconnect during deferred auth, timeout, late auth completion and malformed-handshake cleanup, in addition to both concurrent caps.

My preferred solution retains pre-auth HTTP refusals, uses generic client backoff without automatic page reloads for failed upgrades, and keeps 1008 plus the 2s termination fallback for established message floods. This preserves a meaningful hard connection bound without adding an unauthenticated WebSocket admission path.

## Round 3/3 — Claude

Points 1 and 3 conceded. I am dropping the 1013 path: refusals stay HTTP 429/503 before auth, no upgrade, so no uncounted sockets. That makes point 2 moot, but I take the lesson: backoff resets only after a healthy connection, which means receiving yourId. The 1008 message becomes 'Too many messages'. On point 3: cleanup is attached to the raw socket ('close'/'error') before auth is awaited. There is a 10s upgrade deadline. A settled-flag guard means a late auth result after release or timeout destroys the socket instead of upgrading. Tests cover disconnect during deferred auth, timeout, late completion and malformed handshakes, plus both concurrent caps.

I challenge one part of your preferred solution: 'generic client backoff without automatic page reloads for failed upgrades'. The reload is load-bearing. When a member's hub session expires, the upgrade fails (401), and reloading '/' is what hits requireAuth and redirects them to the hub login (lib/httpApp.js, the auth.requireAuth route). With generic backoff and no reload, an expired-session user retries forever, never re-authenticates, and is told nothing useful. That is a worse failure than the one we are fixing, and the expired session is far more common than a rate-limit refusal for this user base.

Counter-proposal: on a failed upgrade, the member client makes one same-origin probe, fetch('/', {redirect:'manual', cache:'no-store'}). An opaqueredirect or 401 means the session is gone, so reload, as today: correct behaviour, correct message. A 200 means the session is fine and the refusal was capacity or rate, so show 'Server busy, retrying…' with exponential backoff, 5s doubling to 60s with ±20% jitter, reset on yourId. The probe itself is one cheap HTTP request per attempt and is already behind the backoff. The guest page has no session to expire (token only), so it uses backoff plus its existing 'room closed or link invalid' message after N failures. Does this resolve your objection while keeping the hard bound?

## Round 3/3 — ChatGPT: AGREE

The auth-recovery challenge is valid. lib/httpApp.js:100 protects '/' with requireAuth, and suite/shared/auth-client/middleware.js:41–45 redirects missing or invalid sessions to hub login. The manual-redirect probe preserves that recovery while allowing capacity refusals to back off. Keeping refusals as HTTP responses also resolves the uncounted-WebSocket problem.

Handle probe network errors, timeouts and 5xx responses as transient failures, with bounded backoff and no reload. A redirect can also indicate missing entitlement (lib/httpApp.js:86–88), so describe it as requiring account access rather than proving session expiry. Likewise, repeated guest failures cannot prove an invalid token: after bounded retries, use 'Unable to join; the server may be busy or the room unavailable' and allow manual retry. Cover these branches alongside expired-session recovery.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Use a clock-injected limiter with 40 connections per IP, 400 globally, and 60 admitted upgrade attempts per IP over a sliding 10s window. Reserve pending-plus-established capacity synchronously before auth; clean up idempotently on failure or transport closure, enforce a 10s upgrade deadline, and reject late auth completion. Refuse excess upgrades with HTTP 429/503 without authenticating or upgrading. Keep independent attempt history, periodic expiry and a 10,000-IP fail-closed map cap. Trust validated, normalized rightmost XFF only from the verified loopback proxy. Limit every incoming application message before parsing with a 20-token bucket refilling at 5/s; permanently gate offenders, close with 1008 and terminate after 2s if necessary. Clients use jittered exponential backoff, resetting on yourId. Members probe '/' to recover account access when redirected; transient failures back off. Guests retry finitely with accurate messaging. Verify concurrency, lifecycle cleanup, flood handling, proxy behavior and client recovery.

