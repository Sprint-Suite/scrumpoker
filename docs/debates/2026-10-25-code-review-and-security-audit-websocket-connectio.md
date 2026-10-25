# Debate: Code review and security audit: WebSocket connection, attempt and message rate limits

- Id: 2026-10-25-code-review-and-security-audit-websocket-connectio
- Opened: 2026-10-25T13:33:18.196Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Stage: commit on branch feat/ws-rate-limits (base 131eaac), implementing the agreed design in docs/debates/2026-10-25-design-websocket-connection-and-message-rate-limit.md. Files: lib/wsLimits.js (new: LIMITS, clientIp, createAdmission, createMessageBucket), lib/wsServer.js (admitUpgrade reserves before auth; release on raw socket 'close'; 10s deadline plus 'end' destroys during the auth phase; a socket.destroyed check after auth so late results never upgrade; refusals 429/503/401 with Connection: close; per-socket bucket gate as the first statement of the message handler; closeFlooder sets ws.limited, close(1008), 2s terminate; a sweep timer; limits and now injectable; stop() and limitStats() returned; pino arg order fixed on the auth-error log), public/js/reconnect.js (new: createBackoff 5s doubling to 60s ±20%; probeAccess(fetch '/' redirect:manual no-store, 5s abort): opaqueredirect or 401 means reauth, anything else busy), public/js/app.js (a refused connection probes: reauth reloads as before with corrected wording, busy backs off; 1008 says 'Too many messages'; backoff resets on yourId), public/js/join.js (no auto-retry; a refused connection says the room may have closed or the server is busy; 1008 message; manual rejoin), index.html/join.html script tags, docs/techstack-overview.md.

Deliberate choices to challenge: (a) attempts are recorded only when admitted, so refused floods do not extend legitimate lockouts; (b) the guest gets zero automatic retries rather than N, with an accurate combined message and the button re-enabled; (c) the loopback-without-XFF case falls back to the peer as agreed, but warns once per process so prod can verify Apache sends XFF on /ws; (d) the socket.destroyed guard is also enforced inside ws.handleUpgrade, so the deadline test pins the behaviour, not my line.

Tests: tests/ws-limits.test.js (11 units: XFF trust and spoofing, caps, idempotent release, sliding window, churn, sweep without return, map cap fail-closed, bucket), tests/ws-limits-transport.test.js (9 real-socket: concurrent per-IP and global caps with deferred auth, release on close, disconnect during auth, deadline plus late auth, malformed handshake, forwarded IPs, flood 1008, tripped socket ignored after refill via an injected clock; mutation-checked so it fails without the ws.limited gate), tests/reconnect.test.js (6), tests/e2e/reconnect.spec.js (routeWebSocket 1008 close, then message and reconnect). 182/182 unit, 13/13 e2e. Known: public/js/join.js is now 409 lines, over the 400 limit after today's guest fixes; flagged, not split here. Please check correctness, auth and access control, input handling, injection, secrets, error paths, and anything that fails open.

## Round 1/3 — ChatGPT: OBJECT

The socket accounting and permanent message-flood gate look sound. I accept counting only admitted attempts, HTTP refusals, zero automatic guest retries, and the redundant destroyed-socket guard. Two corrections remain:

1. Pending authentication can outlive its admission slot. lib/wsServer.js:88 releases capacity on transport close, while authorizeUpgrade() at lines 98–104 continues awaiting verifySession(). The deadline also only destroys the socket. I reproduced five unresolved auth calls with perIp=1 and global=1 by repeatedly disconnecting; limitStats().open returned zero. With a valid stale session and a slow hub, these become outstanding heartbeat requests: node_modules/@suite/auth-client/lib/hub-api.js supplies neither a cancellation signal nor an explicit timeout. Keep raw-socket cleanup, but separately bound outstanding authorization work and cancel the underlying request on disconnect/deadline where supported. A Promise.race alone would leave that work running. Add deferred-auth tests covering repeated disconnects and deadlines, asserting authorization concurrency remains bounded.

2. Guest refusal messaging is inaccurate after a prior connection. public/js/join.js:89–132 never resets everOpened for a new attempt. I reproduced connect → disconnect → manual rejoin → refused upgrade: it displays 'Disconnected. Please try rejoining.' rather than the combined room-unavailable/server-busy message. Reset the flag per attempt and cover this sequence.

The member browser test in tests/e2e/reconnect.spec.js covers an established socket’s 1008 closure, not refused-upgrade backoff or reauthentication. Add client integration coverage for repeated refusals, delay growth, successful recovery, and redirect-triggered reload; helper tests alone do not verify that wiring.

Reviewed feat/ws-rate-limits at b543e06 without modifying files. The 17 new helper tests and touched-JS syntax checks passed. Transport tests were blocked by sandbox listen EPERM, so I could not independently verify the reported transport/browser results. No server was left running.

## Round 2/3 — Claude

All three conceded and fixed in a follow-up commit on the branch.

1. Pending auth outliving its slot: confirmed. suite/shared/auth-client's verifySession awaits hubApi.heartbeat with no timeout or signal. Cancelling it needs a change to the shared auth-client, which restarts all four suite apps; I am logging that as a separate follow-up rather than doing it here. Within poker, admitUpgrade now holds the slot on two holds, raw-socket 'close' AND auth settled, with release only when both are done. Outstanding hub calls are therefore bounded by the same caps, 40 per IP and 400 globally. The deadline still destroys the socket but no longer frees the slot early. New transport tests: a disconnect during auth keeps open===1 until the gate resolves; repeated disconnects with a never-resolving verifySession and perIp=2 give exactly 2 calls, then the third upgrade is 429 with open===2; the deadline test now asserts the slot is held past the deadline and released only once auth resolves.

2. Guest everOpened: reset before each new WebSocket in openWebSocket. A new e2e covers your exact sequence: join, drop the routed socket, the facilitator ends the session, manual rejoin, then the combined 'may have closed, or the server is busy' message. Mutation-checked: it fails with the reset removed.

3. Client integration coverage (tests/e2e/reconnect.spec.js, routing page sockets through to the real server): busy, where the test fills the per-IP slots until the server refuses, drops the page's socket, sees 'The server is busy' with no navigation, frees the slots and the page recovers; the gap between the 2nd and 3rd attempts exceeds 7s, showing growth from 5s to ~10s; reauth, where cookies are cleared, the socket dropped, 'session has ended' shown and the page navigates to the hub; plus the existing 1008 test. 183/183 unit, 16/16 e2e.

## Round 2/3 — ChatGPT: AGREE

I inspected commit 790577b. lib/wsServer.js:89–101 now releases admission only after both transport closure and auth settlement. I independently verified that disconnects and deadlines cannot bypass either cap, settlement releases capacity, and late results do not upgrade destroyed sockets. Deferring shared-client cancellation is acceptable with this bound; hung authentication can still occupy capacity until it settles, which remains an availability follow-up.

public/js/join.js:98 resets everOpened per attempt. My previous reproduction now produces the combined refusal message and re-enables Join. tests/e2e/reconnect.spec.js adds meaningful coverage for busy-server backoff and recovery, reauthentication navigation, and refused guest rejoining.

Focused unit tests, syntax checks, and follow-up diff checks passed. Sandbox restrictions still prevent independent transport/browser execution, so I cannot independently confirm the reported 183/16 totals. No files changed or server left running.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Use pre-auth admission limits of 40 per IP, 400 globally, and 60 admitted attempts per sliding 10 seconds. Hold capacity until authentication settles and the transport closes; destroy overdue transports and reject late upgrades. Retain bounded attempt history and trusted-proxy IP handling. Gate application messages before parsing, permanently exclude flooders, close with 1008, and terminate after two seconds. Members use jittered exponential backoff with access probing; guests retry manually with accurate messaging. Track shared-client request cancellation and timeouts separately.

