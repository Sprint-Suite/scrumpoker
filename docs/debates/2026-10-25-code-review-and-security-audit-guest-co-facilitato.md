# Debate: Code review and security audit: guest co-facilitators (fdc811a..0b509df)

- Id: 2026-10-25-code-review-and-security-audit-guest-co-facilitato
- Opened: 2026-10-25T16:42:01.565Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

The stage under review is branch feat/guest-co-facilitators, range fdc811a..0b509df (12 commits). It implements the agreed design in docs/superpowers/specs/2026-10-25-guest-co-facilitators-design.md, following the plan docs/superpowers/plans/2026-10-25-guest-co-facilitators.md.

Purpose: a facilitator can make an invite-link guest Facilitator. A guest Facilitator gets the full controls on the guest page and keeps the role across a refresh or a dropped connection.

Files touched:
- server: lib/roomState.js, lib/wsHandlers.js, lib/guestSeats.js (new), lib/wsServer.js, schemas/ws.js
- client: public/js/facilitatorControls.js (new), public/js/voteResults.js (new), public/js/guestSession.js (new), public/js/app.js, public/js/join.js, public/index.html, public/join.html
- tests: tests/guest-seats.test.js, tests/guest-rejoin-transport.test.js, tests/guest-session.test.js, tests/ws-handlers.test.js, tests/room-state.test.js, tests/ws-schema.test.js, tests/e2e/guest-co-facilitator.spec.js, tests/e2e/anonymous-join.spec.js, tests/e2e/co-facilitators.spec.js, tests/e2e/reconnect.spec.js

My position: the stage is correct and safe to merge. The security boundary is the guest rejoin key, a bearer credential that restores Facilitator. It holds for these reasons:
- It is 128-bit random and stored only in room.guestKeys/room.holds, never on the participant object, which getRoomParticipants spreads into broadcasts.
- It is sent only to its owner's socket and validated by schema as 32 hex characters.
- Keys are scoped per room and die with the room on endSession, expiry or the last member leaving. A recreated room gets a new token, and guestLinkValid refuses the old link.
- Takeover is a synchronous swap of users, facilitatorIds, participants and guestKeys that never runs the exit path. ws.replaced guards every inbound message, and the old socket's late close/error is a no-op.
- The two-facilitator cap holds on both the hold-restore and grant paths, and normalizeFacilitators slices.
- Automatic promotion stays member-only.

Tests: npm test 230/230, e2e 23/23.

A known pre-existing flake I found and am NOT fixing in this stage: lib/wsLimits.js createMessageBucket uses Date.now(). A backward wall-clock jump (this WSL box jumps about 63 s) drives the token count negative, and the next message is refused with 1008. I plan to fix it in a separate PR.

Please check correctness, auth and access control (especially: can an invite-link holder, or any broadcast field, claim or steal a guest's role?), input handling, injection (the guest page renders names and participant data; check for innerHTML use with untrusted data), secrets (the key in sessionStorage, logs or broadcasts), and error paths (reconnect loops, refused upgrades, the 2-minute give-up, replaced handling).

## Round 1/3 — ChatGPT: OBJECT

The server-side credential boundary looks sound: I found no invite-token or broadcast-field route to stealing Facilitator, and names use textContent; the inspected innerHTML assignments only clear containers. However, I reproduced three client lifecycle defects that should be fixed before merging:

1. P2 — The two-minute limit does not bound a pending connection. public/js/guestSession.js:50–54 checks expiry only when schedule() runs, then schedules an unconditional reopen. If that connection stalls without closing, no deadline timer remains. Executing the actual client scripts with mocked time left the room visible and Join unavailable at 180 seconds. Add an independent deadline that cancels retries, closes/detaches the pending socket, clears the session and prevents late callbacks from restoring the room.

2. P2 — A 1008 close can retry automatically. public/js/join.js:159 prevents begin() for 1008, but line 160 still schedules when a previous retry is active. I reproduced drop → retry → 1008 → another retry timer, without the rate-limit explanation. Handle 1008 before the active-retry branch and terminate that retry cycle.

3. P2 — Replacement clears storage but retains the bearer credential in memory. backToJoin() at public/js/join.js:110–115 never resets rejoinKey. After receiving replaced, clicking the enabled Join button sends the original key again at line 140; the server consequently takes the live guest's place back instead of creating a fresh guest. I verified that outgoing payload after storage was cleared. Clear the in-memory key when abandoning the session and test replacement followed by manual Join. This is unintended credential reuse, not an invite-only authentication bypass.

Add regression tests for these transitions: tests/guest-session.test.js currently tests storage and the clock predicate, not reconnect orchestration. I independently ran 105 focused unit tests successfully. Real-socket tests were blocked by this environment's listen EPERM restriction, so I cannot confirm the reported transport/e2e results. The separate wsLimits clock fix can remain outside this change.

## Round 2/3 — Claude

I checked each point against public/js/join.js and public/js/guestSession.js.

1. Conceded. schedule() is the only place expiry is checked, so a reopen whose socket never opens or closes has no deadline. Fix: the reconnector arms one independent deadline timer when begin() starts the window. When it fires, it detaches the pending socket (its onopen, onmessage and onclose are nulled, then the socket is closed) and calls the give-up path, so a late callback can't bring the room back. stop() clears that timer. I'll add a unit test with an injected setTimeout/now: a reopen that never settles still hits give-up once the 2-minute window is up.

2. Conceded. Line 159 skips begin() on 1008, but line 160 still reschedules when a retry was already running. Fix: handle 1008 before the active-retry branch, so it always calls reconnector.stop() and shows the rate-limit message.

3. Partly conceded. You're right for replaced: after a takeover the displaced tab must become a fresh guest, and keeping the key there is unintended reuse. I'm keeping the key on one path, and here is the reason. When a stored-session refresh hits a refused upgrade, the page can't tell a busy server from a closed room, so it shows CLOSED_OR_BUSY at once. If the server was only busy, the guest's facilitator hold is still valid for up to 2 minutes, and the in-memory key is the only way a manual Join can claim it. Fix: backToJoin takes a forgetKey flag, and rejoinKey is set to null on replaced, on sessionEnded and on a fatal closed/invalid/expired login error. On those paths the key is either dead or must not be reused. The key stays for CLOSED_OR_BUSY, the 1008 message and a plain disconnect, where the hold may still be live. Tests: an e2e replaced-then-manual-Join joins as a new guest and does not displace the newer tab. A unit or e2e test shows the key is still sent after a CLOSED_OR_BUSY.

The real-socket and e2e results come from my environment: npm test 230/230 and e2e 23/23. Does this settle all three?

## Round 2/3 — ChatGPT: AGREE

Yes, the proposed corrections settle the three findings. Retaining the key after CLOSED_OR_BUSY is justified: lib/guestSeats.js claimGuestKey still enforces server-side hold expiry, and lib/wsHandlers.js guestLinkValid and restoreHold enforce room validity and the facilitator cap. An ambiguous transport failure does not require discarding a legitimate recovery credential. Replacement does.

The deadline must remain anchored to the first begin(), cancel both timers, detach the pending socket and invoke give-up only once. Regression coverage should also exercise an active retry receiving 1008, successful recovery cancelling the deadline, and late socket callbacks after give-up.

I rechecked the checkout; it remains at 0b509df without these corrections. This agreement covers the proposed solution, with implementation and passing regression checks required before merge.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Add one independent two-minute reconnect deadline that repeated attempts cannot extend, with socket cleanup and protection against late callbacks. Handle 1008 before retry scheduling and show the rate-limit explanation. Clear the in-memory rejoin key on replacement, session end and fatal login refusal; retain it for ambiguous transport failures so manual Join can recover a still-valid hold. Add regression tests for deadline cleanup, 1008 during retry, replaced-then-manual-Join and recovery after CLOSED_OR_BUSY. Keep the pre-existing wsLimits clock fix separate.

