# WebSocket Message Crash Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No inbound WebSocket message, however malformed, can stop the server process.

**Architecture:** `validateMessage` only recognises its own schema keys; `wsServer`'s message listener drops any parsed value that is not an object with a string `type` before touching it.

**Tech Stack:** Node 24, CommonJS, `ws`, `zod` 4, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-24-ws-message-crash-design.md`

## Global Constraints

- CommonJS, 2-space indent, single quotes in `lib/` and `tests/`; `schemas/ws.js` uses double quotes. Match the file you are in.
- Unit gate is `npm test` (`node --test tests/*.test.js`). Never `node --test tests/` — it dies on Node 24.
- No catch-all `try/catch` around the dispatch and no `process.on('uncaughtException')` (spec, Decisions).
- Malformed envelopes are dropped with `logger.warn`, no reply. Unknown *string* types keep the existing `error` reply.
- Functions ≤ 30 lines, cyclomatic ≤ 10. The message listener is already long: put the envelope check in a small named helper rather than growing the listener.

## Review Focus

1. `[]` and `["vote"]` as `type`: an array coerces to the string `"vote"` as a property key, so it must be rejected by the string check, not slip through as a vote.
2. Top-level JSON scalars (`5`, `"x"`, `true`) and arrays (`[]`): dropped, socket stays open.
3. `{"type":"constructor"}` and friends: answered with the existing `Unknown type` error, not a crash and not a silent drop.
4. `{"type":{"toString":1}}`: dropped before any string conversion of `type`.
5. After every crashing message, a *different* socket in the same room still gets state updates (the process survived, not just the socket).

---

### Task 1: Own-property schema lookup

**Files:**
- Modify: `schemas/ws.js` (`validateMessage`)
- Test: `tests/ws-schema.test.js`

**Interfaces:**
- Produces: `validateMessage(type, payload)` unchanged signature; for any `type` that is not an own key of `SCHEMAS` it returns `{ ok: false, error }` with `error.message === 'unknown_message_type'`.

- [ ] **Step 1: Write the failing test**

```js
test('validateMessage: inherited Object.prototype names are unknown types, not crashes', () => {
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const result = validateMessage(type, {});
    assert.equal(result.ok, false, type);
    assert.equal(result.error.message, 'unknown_message_type', type);
  }
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/ws-schema.test.js`
Expected: FAIL, `TypeError: schema.safeParse is not a function`.

- [ ] **Step 3: Implement** — look up with `Object.hasOwn(SCHEMAS, type)` before reading `SCHEMAS[type]`.

- [ ] **Step 4: Run it and see it pass**

Run: `node --test tests/ws-schema.test.js` → all pass.

- [ ] **Step 5: Commit** — `fix: treat inherited names as unknown WebSocket message types`

### Task 2: Envelope check and process-survival tests

**Files:**
- Modify: `lib/wsServer.js` (message listener, after `JSON.parse`)
- Test: `tests/ws-validation.test.js`

**Interfaces:**
- Consumes: Task 1's `validateMessage`.
- Produces: module-private `isMessageEnvelope(parsed): boolean` in `lib/wsServer.js` — true only for a non-null, non-array object whose `type` is a string.

- [ ] **Step 1: Write the failing test** — in `tests/ws-validation.test.js`, reusing its `startServer`, `connectClient`, `loginClient`, `waitForState`, `send`, `findParticipant` helpers:

```js
test('malformed envelopes cannot crash the server', async (t) => {
  // Alice (Facilitator) and Bob (Voter) log in to room 'crash-test'.
  // Bob sends each raw frame in turn:
  const frames = ['null', '5', '"x"', '[]', '{"type":["vote"],"payload":{"vote":"8"}}',
    '{"type":{"toString":1}}', '{"type":"constructor"}', '{"type":"__proto__"}', '{"type":"toString"}'];
  // After all frames:
  //   - Bob's ['vote'] frame must NOT have set his vote (assert no updateState with Bob vote '8' before the valid vote).
  //   - Bob sends a valid vote '5'; Alice receives updateState with Bob's vote === '5'.
  //   - fetch(`http://127.0.0.1:${port}/health`) is ok.
  //   - Bob's socket readyState === WebSocket.OPEN.
});
```

`startServer` must return the child process too, or the test must otherwise detect exit; if the process dies, the valid-vote wait rejects with "WebSocket closed", which is the failure signal.

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/ws-validation.test.js`
Expected: the new test FAILS (socket closed / health fetch refused) because `null` kills the process. Then temporarily remove the `null` frame and confirm it still fails on `{"type":{"toString":1}}`, proving each frame class independently crashes today. Restore the frame.

- [ ] **Step 3: Implement** `isMessageEnvelope` and call it right after the `JSON.parse` `try`: if false, `logger.warn({ kind: Array.isArray(parsed) ? 'array' : typeof parsed }, 'ws: malformed message envelope — dropped')` and return. Do not log the raw message.

- [ ] **Step 4: Run it and see it pass**

Run: `node --test tests/ws-validation.test.js` → all pass. Then `npm test` → 0 fail.

- [ ] **Step 5: Commit** — `fix: drop malformed WebSocket envelopes instead of crashing`
