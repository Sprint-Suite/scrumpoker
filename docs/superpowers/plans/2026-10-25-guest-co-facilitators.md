# Guest Co-Facilitators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A facilitator can make an invite-link guest Facilitator; the guest gets the full controls on the guest page and keeps the role across a refresh or a dropped connection.

**Architecture:** The server drops the member-only grant check but keeps automatic promotion member-only. A new `lib/guestSeats.js` owns guest rejoin keys, 2-minute holds and the stale-connection takeover. Keys are stored on the room, never on a participant. On the client, a shared `facilitatorControls.js` and `voteResults.js` serve both pages, and `guestSession.js` handles the guest page's storage and its 2-minute retry window.

**Tech Stack:** Node 24, `ws`, zod, `node:test`, Playwright, vanilla browser JS (IIFE modules attached to `window`).

**Spec:** `docs/superpowers/specs/2026-10-25-guest-co-facilitators-design.md`

## Global Constraints

- At most two facilitators (`MAX_FACILITATORS = 2`); grants only by a current Facilitator; no self-promotion.
- Guests are never auto-promoted. The top-up and the step-down handover pick company members (`authed`) only.
- Rejoin key: `crypto.randomBytes(16).toString('hex')` (32 lowercase hex), sent only to its owner, stable across rejoins, stored on the room, never on a participant object.
- Hold window `GUEST_HOLD_MS = 2 * 60 * 1000`, non-reserving.
- The guest page retries for 2 minutes after a drop, then shows `This room may have closed, or the server is busy. Try again in a moment.`
- `public/js/join.js` ends at 400 lines or fewer. No function over 30 lines, cyclomatic complexity 10 or less, 4 parameters at most (object arguments are fine). The standard is not wired here, so check by hand.
- Unit tests: `npm test`. E2E: `npm run test:e2e`. Never `node --test tests/` (dies on Node 24).
- Test deadlines use `performance.now()` or an injected `now`, never wall-clock `Date.now()` deadlines.

## Review Focus

1. **Same-socket re-login by a guest Facilitator** (the existing "re-sending login" path): `leaveCurrentRoom` creates a hold, so a re-login carrying the key must come back Facilitator. Test in Task 2.
2. **A member is waiting when the guest Facilitator drops.** The member is auto-promoted during the hold, and the returning guest takes the second place. Test in Task 2.
3. **A message the old socket already sent when a takeover happens** must have no effect (`ws.replaced` guard). Test in Task 3.
4. **A hold claimed 1 ms after expiry** gives Voter and is deleted. Test in Task 2.
5. **A guest Facilitator ends the session.** Everyone gets `sessionEnded`, and the room and its keys are gone. Test in Task 1.

---

### Task 1: Guests can be granted and keep Facilitator; never auto-promoted

**Files:**
- Modify: `lib/roomState.js` (`isEligibleFacilitator`, `normalizeFacilitators`)
- Modify: `lib/wsHandlers.js` (`facilitatorGrantError`)
- Test: `tests/room-state.test.js`, `tests/ws-handlers.test.js`

**Interfaces:**
- Produces: `isRoomParticipant(room, participants, roomName, id) -> boolean` (in the room, any `authed`), exported from `lib/roomState.js`. `isEligibleFacilitator` keeps its signature and meaning: auto-pick candidate, members only.

- [ ] **Step 1: Write the failing tests**
  - `room-state.test.js`: change `normalizeFacilitators drops missing, cross-room, guest and duplicate ids…` deliberately. With the same input it now returns `['guest', 'alice']` and `participants.guest.role === 'Facilitator'`. Rename the test to `…drops missing, cross-room and duplicate ids…`. Keep `normalizeFacilitators skips anonymous participants` as is, because the top-up still skips guests.
  - `room-state.test.js`, new test `normalizeFacilitators keeps a guest facilitator alone in a guest-only room`: guests g1 and g2, `facilitatorIds = ['g1']` → returns `['g1']`. Then remove g1 with `reassignFacilitatorIfLeaving` → returns `[]`, and g2 stays Voter.
  - `ws-handlers.test.js`, new test `a facilitator can grant a guest Facilitator`: `coFacilitatorRoom` plus a guest participant (`authed: false`). Alice sends `changeRole { targetUserId: 'guest', newRole: 'Facilitator' }` → `facilitatorIds` is `['alice', 'guest']` and there is no error.
  - `ws-handlers.test.js`, new test `a guest facilitator can reveal, reset, start the next round, change roles and end the session`: assert each handler's effect with a guest as `currentUser`. `handleEndSession` emits `sessionEnded` via `sendToRoom`, and the room is deleted.
  - `ws-handlers.test.js`, new test `the last member facilitator leaving a guest-only room promotes no one`.

- [ ] **Step 2: Run `npm test` and check that the new and changed tests fail**

- [ ] **Step 3: Implement**
  - In `normalizeFacilitators`, the `kept` filter uses `isRoomParticipant`; the top-up still uses `isEligibleFacilitator`.
  - `facilitatorGrantError` drops the `!target.authed` line.
  - `updateFacilitatorList`'s step-down replacement already uses `isEligibleFacilitator`, so it stays member-only.

- [ ] **Step 4: Run `npm test`; all tests pass**

- [ ] **Step 5: Commit** `feat: let a facilitator grant a guest the Facilitator role`

---

### Task 2: Rejoin keys and holds

**Files:**
- Create: `lib/guestSeats.js`
- Modify: `lib/roomState.js` (`createRoom` gains `guestKeys: new Map()`, `holds: new Map()`)
- Modify: `lib/wsHandlers.js` (`handleLogin` guest branch extracted into `admitGuest`; `handleParticipantExit` and `leaveCurrentRoom` take `now`)
- Modify: `lib/wsServer.js` (pass `now: now()` into `handleLogin` and `handleParticipantExit`)
- Modify: `schemas/ws.js` (`login.rejoinKey: z.string().regex(/^[0-9a-f]{32}$/).optional()`)
- Test: create `tests/guest-seats.test.js`; modify `tests/ws-handlers.test.js`, `tests/ws-schema.test.js`

**Interfaces (`lib/guestSeats.js`):**
- `GUEST_HOLD_MS = 120000`
- `issueGuestKey(room, participantId) -> string`: a new key, mapped in `room.guestKeys`.
- `keyOf(room, participantId) -> string | null`
- `claimGuestKey(room, key, now) -> { kind: 'live', participantId } | { kind: 'hold' } | null`. An expired hold is deleted and returns `null`. A `'hold'` claim deletes the hold.
- `releaseGuest(room, participantId, { holdSeat, now })`: removes the live mapping, and if `holdSeat` is set, records `room.holds.set(key, now + GUEST_HOLD_MS)`.
- Server → client message: `{ type: 'rejoinKey', payload: { key } }`, sent to the guest's socket on **every** successful guest login (the reused or the new key).

- [ ] **Step 1: Write the failing tests**
  - `guest-seats.test.js`: issue → `keyOf` returns it and matches `/^[0-9a-f]{32}$/`; `claimGuestKey` on a live key → `{ kind: 'live', participantId }`; release with a hold → `'hold'` at `now + 119999`, then `null` on a second claim (consumed); a hold claimed at `now + 120001` → `null` and `room.holds.size === 0`; a release without a hold → `null`; an unknown key → `null`.
  - `ws-handlers.test.js`, new tests (guest sockets built like the existing `guestWs`, with `now` passed):
    - `a guest login is sent a rejoin key and the key is not on the participant`: the last client message is `rejoinKey`, and `Object.values(h.participants.guest)` does not contain the key.
    - `a guest facilitator who leaves and rejoins with the key within two minutes is Facilitator again`. The rejoin is a new `userId` on a new socket, and the client receives the **same** key.
    - `a rejoin after the hold expired, or with a wrong key, or a key from another room, joins as Voter`.
    - `a held guest returning to a room with two facilitators joins as Voter`.
    - `a member waiting when the guest facilitator drops is promoted, and the returning guest becomes the second facilitator` (Review Focus 2).
    - `a guest facilitator re-sending login on the same socket with its key stays Facilitator` (Review Focus 1).
    - `a rejoin accepted but never acknowledged still works with the same key`: claim with a hold, then exit again before anything else, and rejoin with the same key → Facilitator.
    - `a non-facilitator guest who leaves leaves no hold`.
  - `ws-schema.test.js`: `login` accepts a 32-hex `rejoinKey` and rejects `'abc'` and a 33-character key.

- [ ] **Step 2: Run `npm test`; the new tests fail**

- [ ] **Step 3: Implement `lib/guestSeats.js` and wire it in.** Order in `admitGuest`: same-socket `leaveCurrentRoom` → token check (unchanged) → `claimGuestKey`. A `'live'` claim calls Task 3's `takeOverGuest` (for this task, treat `'live'` as `null`). Then `joinRoom`, set the key (the reused one for a `'hold'` claim, otherwise `issueGuestKey`), and on a `'hold'` claim push onto `facilitatorIds` if `length < MAX_FACILITATORS`. In `handleParticipantExit`, before `leaveRoom`: for a guest, call `releaseGuest(room, userId, { holdSeat: room.facilitatorIds.includes(userId), now })`.

- [ ] **Step 4: Run `npm test`; all tests pass**

- [ ] **Step 5: Commit** `feat: guest rejoin keys and a two-minute facilitator hold`

---

### Task 3: Stale-connection takeover

**Files:**
- Modify: `lib/guestSeats.js` (add `takeOverGuest`)
- Modify: `lib/wsHandlers.js` (`admitGuest` handles a `'live'` claim)
- Modify: `lib/wsServer.js` (`ws.on('message')`: `if (ws.limited || ws.replaced) return;`)
- Test: `tests/ws-handlers.test.js`; create `tests/guest-rejoin-transport.test.js`

**Interfaces:**
- `takeOverGuest({ room, participants, oldId, newId, sendToClient }) -> previousRole`. In one step: `room.users` swaps the ids; the old id is replaced **in place** in `room.facilitatorIds`; `room.guestKeys` repoints to `newId`; `participants[oldId]` is deleted; then it sets `oldWs.replaced = true`, `sendToClient(oldWs, { type: 'replaced', payload: {} })` and `oldWs.close(4000, 'Replaced')`. It must not call `handleParticipantExit`, `leaveRoom` or `reassignFacilitatorIfLeaving`. The caller creates the new participant with `previousRole` and `vote: null`.
- Close code `4000` means replaced.

- [ ] **Step 1: Write the failing tests**
  - `ws-handlers.test.js`:
    - `a key matching a live guest facilitator moves the place to the new connection`: alice and guest are facilitators and member bob is waiting. Rejoin as `guest2` → `facilitatorIds` is `['alice', 'guest2']`, bob is still Voter, `participants.guest` is undefined, the old ws has `replaced === true` and was sent `replaced` and closed with 4000, and `room.holds.size === 0`.
    - `the old socket's later exit after a takeover changes nothing`: call `handleParticipantExit({ userId: 'guest' })` → returns `null`, and the room and `facilitatorIds` are unchanged.
    - `a key never takes over a member`: a key that isn't in `guestKeys` (a member has none) → Voter, and the member is untouched.
  - `guest-rejoin-transport.test.js`, over real sockets: `startServer` with a `verifySession` that throws for guests. The member connects via `connect(port)`; guests connect with `new WebSocket('ws://127.0.0.1:${port}/ws?token=…')` as in `ws-validation.test.js`.
    - `the rejoin key reaches only its owner`: across every message the member socket and a second guest socket received, `JSON.stringify` does not contain the key.
    - `a guest facilitator whose socket drops rejoins as Facilitator`: terminate the guest socket client-side, reconnect with the key → `updateState` where `facilitatorIds` includes the new id.
    - `a second connection with the key replaces the first`: the old socket receives `replaced` and closes with 4000. An `revealVotes` the old socket sent after `replaced` arrived has no effect (Review Focus 3): with `ws.replaced` set, the server drops it.

- [ ] **Step 2: Run `npm test`; the new tests fail**

- [ ] **Step 3: Implement `takeOverGuest`, the `'live'` branch and the `ws.replaced` guard**

- [ ] **Step 4: Run `npm test`; all tests pass**

- [ ] **Step 5: Commit** `feat: a guest's rejoin key takes over its stale connection`

---

### Task 4: Shared facilitator controls and results on the member page; role-menu bug fixes

**Files:**
- Create: `public/js/facilitatorControls.js`, `public/js/voteResults.js`
- Modify: `public/js/app.js` (use both modules; delete the code they replace)
- Modify: `public/index.html` (load both scripts before `app.js`; add `<p id="role-error" class="form-error hidden"></p>` after `#participants-list`; bump `app.js?v=`)
- Test: `tests/e2e/co-facilitators.spec.js`

**Interfaces:**
- `window.ScrumPokerFacilitator.createFacilitatorControls({ document, send, copyText, onReset })`. The module looks up elements by the ids already in `index.html`: `#facilitator-controls`, `#show-votes-button`, `#start-next-round-button`, `#reset-votes-button`, `#invite-menu-button`, `#invite-menu`, `#copy-invite-link-button`, `#end-session-button`, `#end-session-modal` and its children, and `#role-error`. It returns:
  - `render({ currentUser, votesRevealed, facilitatorIds, shareToken })`: show or hide and enable the controls, as `app.js` `updateUI` does today.
  - `roleSelectFor(participant, state) -> HTMLSelectElement | null`: today's `.participant-role-select`, built the same way. Selecting a role records a pending role change and sends `changeRole`.
  - `handleError(message) -> boolean`: if the end-session modal is open, show the message there (today's behaviour); if a role change is pending, show it in `#role-error` (auto-hide after 3 s) and clear the pending flag; return `true` if it handled the message.
  - `closeAll()`: close the invite menu and the end-session modal.
  - `onReset(sendReset)`: a page hook called by the reset button. `app.js` passes its card-animation wrapper; the default calls `sendReset()` directly.
- `window.ScrumPokerVoteResults.renderResults({ document, participants, votesRevealed })`: today's average, grouped results and show/hide, using `#vote-summary`, `#average-vote`, `#ordered-votes` and `#ordered-votes-list`.
- Bug fix: in each page's `error` case, while the room is visible, re-render the participant list (so every select shows the server's role), then call `controls.handleError(message)`, and fall back to `showVoteError` if it returns `false`.

- [ ] **Step 1: Write the failing e2e test** in `co-facilitators.spec.js`: `a refused role change shows the error by the list and resets the select`. Alice and Bob are facilitators and Carol is a Voter. This simulates a stale page, which is the real race: Carol's select on Alice's page offers no Facilitator option, so `page.evaluate` appends `<option value="Facilitator">` to it, and then the test selects it. The server refuses with `A room can have at most two facilitators.` Assert: `#role-error` shows that text, `#vote-error` is hidden, and Carol's select has the value `Voter`.
- [ ] **Step 2: Run `npm run test:e2e -- co-facilitators`; the new test fails**
- [ ] **Step 3: Implement both modules and switch `app.js` to them**
- [ ] **Step 4: Run `npm run test:e2e`; the whole suite passes (the member page behaves the same apart from the fix)**
- [ ] **Step 5: Commit** `refactor: share facilitator controls and results; fix refused role-change display`

---

### Task 5: Facilitator controls on the guest page

**Files:**
- Modify: `public/join.html` (add the `room-actions` invite menu and End button, `#facilitator-controls`, `#end-session-modal` and `#role-error`, copied from `index.html` with the same ids; load `clipboard.js`, `facilitatorControls.js` and `voteResults.js` before `join.js`; bump `join.js?v=`)
- Modify: `public/js/join.js` (read `facilitatorIds` and `shareToken` from `updateState`; call `controls.render`, `controls.roleSelectFor` and `renderResults`; delete its own `renderResults` and `calculateAndDisplayAverage`; handle `error` through `controls.handleError`)
- Test: `tests/e2e/anonymous-join.spec.js`; create `tests/e2e/guest-co-facilitator.spec.js`

- [ ] **Step 1: Write the failing tests**
  - `anonymous-join.spec.js`: the four `toHaveCount(0)` assertions become `toBeHidden()`. An **ungranted** guest still sees no facilitator controls; the elements now exist on the page.
  - `guest-co-facilitator.spec.js`, `a guest granted Facilitator runs the room after the facilitator leaves`: the member creates a room and the guest joins by token. The guest votes `5`; the member selects `Facilitator` on the guest's row. The guest's `#show-votes-button` is visible. The member's context closes. The guest clicks `#show-votes-button` → `#average-vote` is `5.0`; clicks `#start-next-round-button` → `#round-status` is `Open`; opens Invite → the copy button is visible.
  - Same file, `a guest facilitator is demoted and loses the controls`.
- [ ] **Step 2: Run `npm run test:e2e`; the new tests fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `npm run test:e2e`; all tests pass. Run `wc -l public/js/join.js`; the count is 400 or less (if not, Task 6 must finish under it)**
- [ ] **Step 5: Commit** `feat: facilitator controls on the guest page`

---

### Task 6: Guest auto-rejoin, reconnect and replacement

**Files:**
- Create: `public/js/guestSession.js`
- Modify: `public/js/join.js`, `public/join.html` (load `reconnect.js` and `guestSession.js`)
- Test: create `tests/guest-session.test.js` (load with the stub-`window` pattern from `tests/reconnect.test.js`); add to `tests/e2e/guest-co-facilitator.spec.js`

**Interfaces (`window.ScrumPokerGuestSession`):**
- `load(storage, token) -> { name, rejoinKey } | null`: reads `sessionStorage['scrumPokerGuest']`; returns `null` if the token differs or the JSON is bad.
- `save(storage, { token, name, rejoinKey })`, `clear(storage)`
- `createRetryWindow({ windowMs = 120000, now = () => performance.now() }) -> { start(), expired() -> boolean, stop() }`. `start()` is a no-op while the window is already running.

**Behaviour in `join.js`:**
- On load with a stored entry, connect immediately with the stored name and skip the join form.
- Login sends `{ name, rejoinKey }` when a key is known. A `rejoinKey` message saves `{ token, name, key }`.
- On an unexpected close after the room was shown: `retry.start()`, set the status to `Reconnecting...`, keep the room visible, and reconnect after `createBackoff({ baseMs: 1000, maxMs: 15000 }).next()`. Once `retry.expired()`, clear storage, show the join form and the Global Constraints message. The first `updateState` that contains me calls `retry.stop()` and resets the backoff.
- `replaced`: set `ended = true`, clear storage, show the join form with `This session continued in another tab or window.`, and keep the join button enabled.
- `sessionEnded` and a fatal login error (`/closed|invalid|expired/`) clear storage.

- [ ] **Step 1: Write the failing tests**
  - `guest-session.test.js`: save → load round-trips; `load` with another token → `null`; bad JSON → `null`; `clear` removes the entry; the retry window with an injected `now` is not expired at 119999 ms and is expired at 120000 ms; a second `start()` does not restart the window.
  - e2e, `a guest facilitator who refreshes is still Facilitator`: grant, `guest.reload()` → `#poker-room-section` is visible without filling the form and `#show-votes-button` is visible. The member page lists the guest once.
  - e2e, `a second tab with the same session replaces the first`: duplicate the session by copying `sessionStorage['scrumPokerGuest']` into a new page in the same context via `addInitScript`, open `/join?token=…` → the first page shows `This session continued in another tab or window.`
- [ ] **Step 2: Run `npm test` and `npm run test:e2e`; the new tests fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `npm test` and `npm run test:e2e`; all tests pass. `wc -l public/js/join.js` is 400 or less**
- [ ] **Step 5: Commit** `feat: guests rejoin automatically after a refresh or a dropped connection`

---

### Task 7: Final verification

- [ ] Run `npm test`; all tests pass. Run `npm run test:e2e`; all tests pass. Run `node --check server.js`.
- [ ] Check by hand that no function added or changed exceeds 30 lines or 4 parameters, and that `join.js` is 400 lines or fewer. Note `app.js`'s new size in the PR.
- [ ] Commit any fixes. Then the stage-review TagTeam debate and `ship-story`.
