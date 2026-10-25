# Debate: Code review and security audit: show room name to invite-link guests

- Id: 2026-10-25-code-review-and-security-audit-show-room-name-to-i
- Opened: 2026-10-25T10:48:13.980Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Stage: commit 57e98ca on branch fix/guest-room-name (base 7238875). Files: lib/roomState.js, lib/wsHandlers.js, public/js/join.js, public/join.html, tests/room-state.test.js, tests/ws-handlers.test.js, tests/e2e/anonymous-join.spec.js. Purpose: guests on /join saw an empty room label in the banner because the server never sent the readable room name (rooms are keyed `${companyId}-${room}`). Change: in handleLogin's AUTHED branch only, `room.displayName = payload.room` after joinRoom; getRoomState adds `displayName: room.displayName || null` to the updateState payload; join.js renders it via textContent as `Room: <name>`. Guests cannot set it: the anon branch ignores payload.room (test asserts a guest sending room:'evil-room' leaves displayName unchanged). payload.room is already schema-limited (schemas/ws.js, 1..200 chars). Exposure: the name goes only to sockets in that room via sendRoomState; members already know it and guests hold the room's invite link. The internal key, company id and company name are not newly exposed. Any authed member re-entering the same room sets the same value (the key derives from it), so it cannot drift. Tests: room-state deepEqual includes displayName; handler test asserts it is set on authed login; e2e asserts the guest banner reads 'Room: anon-room'. 154/154 unit, 9/9 e2e locally. Please check correctness, auth and access control, input handling, injection, secrets and error paths.

## Round 1/3 — ChatGPT: AGREE

I independently reviewed commit 57e98ca against 7238875. No blocking correctness or security issue found. lib/wsHandlers.js:66 sets displayName only after authenticated login checks; anonymous login ignores the supplied room and verifies the socket’s bound invite token. lib/wsServer.js broadcasts state only to room members. schemas/ws.js restricts room names to strings of 1–200 characters, and public/js/join.js:209 renders through textContent, preventing HTML injection. The null fallback is safe, and the name survives a host leaving while guests remain. No credentials or additional company metadata are introduced. The handler, state-projection and browser assertions cover the intended behavior. I independently ran 66 focused tests successfully, plus syntax and diff whitespace checks. I did not rerun the full suite or browser tests in this read-only environment.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Accept 57e98ca: retain the readable room name from authenticated login, include it as displayName in room-scoped updateState messages, and display “Room: <name>” safely in the guest banner. Preserve anonymous token binding and prevent guests from changing the name.

