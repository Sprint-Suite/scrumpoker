# Guest Token Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest socket can only log in to the room whose current `shareToken` is the one it upgraded with.

**Architecture:** `decideUpgrade` returns the token; the upgrade handler stores it as `ws.anonToken`; `handleLogin`'s guest branch compares it with the room's current token.

**Tech Stack:** Node 24, `ws`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-24-guest-token-binding-design.md`

## Global Constraints

- Refusal text is exactly `This room has closed or the link is invalid.` (the existing string).
- Authenticated login behaviour is unchanged.
- The guest branch keeps its leave-first ordering.
- Run tests with `npm test` (a shell-expanded glob). `node --test tests/` dies on Node 24.
- Code standards: functions ≤30 lines, cyclomatic ≤10, comments only where a reader needs them now.

## Review Focus

- A guest re-sending `login` while their room and token are unchanged must still be admitted. Pinned in Step 1.
- A guest socket with no `anonToken` must be refused, even if a room of that name exists. Pinned in Step 1.
- A new guest holding the recreated room's new link must be admitted. Pinned in Step 3.
- A room closed by its last member leaving, then recreated, is the same path as `endSession`; the handler test deletes and recreates the room directly, so it covers both.
- Authenticated users are untouched; the existing authed handler tests pin this.

---

### Task 1: Bind guests to their invite token

**Files:**
- Modify: `lib/wsServer.js` (`decideUpgrade` anonymous return; `handleUpgrade` callback)
- Modify: `lib/wsHandlers.js` (`handleLogin` guest branch)
- Test: `tests/ws-handlers.test.js`, `tests/ws-server-upgrade.test.js`, `tests/ws-validation.test.js`

**Interfaces:**
- Produces: `decideUpgrade(...)` anonymous result `{ ok: true, authed: false, anonRoom: string, anonToken: string }`. Socket property `ws.anonToken: string`.

- [ ] **Step 1: Failing handler tests** in `tests/ws-handlers.test.js`
  - `'a guest is refused once their room is recreated under a new token'`: `joinRoom(h.rooms, 'co1-planning', 'host')`; guest ws `{ userId: 'guest', authed: false, anonRoom: 'co1-planning', anonToken: <that room's shareToken> }` logs in (admitted). Then `h.rooms.delete('co1-planning')`, `delete h.participants.guest` (what `endSession` does), `joinRoom(h.rooms, 'co1-planning', 'host2')` (new token). Guest logs in again. Assert `h.participants.guest === undefined`, the room's `users` lacks `'guest'`, last client message matches `/closed|invalid/`.
  - `'a guest socket without a token is refused'`: room `co1-planning` exists with `shareToken: 'tok'`; ws has `anonRoom` but no `anonToken`. Assert not admitted, `/closed|invalid/`.
  - `'a guest re-sending login with a valid token stays in the room'`: host + guest with matching token, guest logs in twice. Assert `h.participants.guest.roomName === 'co1-planning'` and the room still has the guest.
  - Add a matching `anonToken` to the existing guest tests (`'tok'` for the hand-built room; the room's `shareToken` where `joinRoom` built it).
- [ ] **Step 2: Failing upgrade test**: in `tests/ws-server-upgrade.test.js` 'no session but valid room token -> anonymous', assert `d.anonToken === token`.
- [ ] **Step 3: Failing real-server test** in `tests/ws-validation.test.js`, `'a guest cannot rejoin a recreated room without its new link'`: Alice (authed) logs in as Facilitator to `rotate`, reads `shareToken` from the state. Guest connects to `/ws?token=<T>` with no cookie (a new helper or a variant of `connectClient`) and logs in. Alice sends `endSession`; wait for both to get `sessionEnded`. Alice logs in again to `rotate`; read new token T2 ≠ T. Guest re-sends `login`; assert it receives `error` matching `/closed|invalid/` and Alice's next state has no guest. Then a second guest connects with T2, logs in, and appears in Alice's state.
- [ ] **Step 4: Run `npm test`. Expect the new tests to FAIL** for the right reason (the guest is admitted, and `anonToken` is undefined).
- [ ] **Step 5: Implement.** `decideUpgrade` adds `anonToken: token` to the anonymous result; the upgrade callback sets `ws.anonToken = decision.anonToken`. In `handleLogin`'s guest branch, replace `!rooms.has(internalRoom)` with a check that `ws.anonToken` is truthy and equals `rooms.get(internalRoom)?.shareToken`.
- [ ] **Step 6: Run `npm test`.** All pass, 0 skipped, count = 150 + the new tests.
- [ ] **Step 7: Commit** `fix: bind invite-link guests to the token they joined with`.
