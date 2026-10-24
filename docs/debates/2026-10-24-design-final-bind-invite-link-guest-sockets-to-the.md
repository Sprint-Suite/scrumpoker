# Debate: Design-final: bind invite-link guest sockets to the shareToken they upgraded with

- Id: 2026-10-24-design-final-bind-invite-link-guest-sockets-to-the
- Opened: 2026-10-24T18:05:26.445Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Spec at docs/superpowers/specs/2026-10-24-guest-token-binding-design.md. Hole: a guest socket keeps only the room NAME (ws.anonRoom); after endSession (or the room closing/expiring) and a company member recreating the same name (new shareToken), the guest's still-open socket can login again without the new link. Fix (David chose 'tie guests to the invite token'): decideUpgrade returns anonToken; wsServer stores ws.anonToken; handleLogin's guest branch admits only if ws.anonToken is set and equals rooms.get(ws.anonRoom).shareToken, else the existing 'closed or invalid link' error. Leave-first ordering kept. Tests: handler unit test for the recreated-room refusal, decideUpgrade carries the token, and a real-server repro in tests/ws-validation.test.js seen failing first. Non-goals: closing guest sockets on endSession, rate limiting. I believe this is complete because login is the only path by which a socket enters a room, and all other handlers act on participants[userId], which endSession/expiry/leave already delete. Please check that claim and any other path a stale guest socket could act on a new room.

## Round 1/3 — ChatGPT: AGREE

The proposed guard closes the identified gap. lib/wsServer.js:139 resolves currentUser from participants[userId] for every message; it never authorizes through leftover ws.roomName or ws.role. handleEndSession deletes participant entries, server.js passes participants to expireRooms, and handleParticipantExit deletes the leaving participant. All room-action handlers reject an absent currentUser; logout/close becomes a no-op. Broadcasts use room.users and participants, and heartbeat touches rooms only through participants. I found no alternate admission path.

I independently reproduced stale-guest admission after endSession, expiry, and last-member departure using the current handlers. Applying the proposed guard in memory rejected all three, while the other action handlers rejected the stale guest before login. The four focused handler, upgrade, room-state, and heartbeat test files passed.

This approves the design, not an implementation: the token binding and claimed real-server regression are not present in this checkout, so I cannot verify the claimed failing-first server test.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Carry the validated invite token from decideUpgrade into ws.anonToken. After the existing guest leave-first step, require an existing room, a nonempty socket token, and equality with that room's current shareToken before joining; otherwise return the existing closed/invalid-link error. Preserve authenticated behavior. Add upgrade-token propagation, stale/missing-token handler coverage, and a real-socket endSession/recreate regression that also proves a fresh-token guest can join.

