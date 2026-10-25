# WebSocket messages must not crash the server

**Date:** 2026-10-24 · **Size:** small change · **Approved:** self-approved under autopilot (no schema, auth, secrets, CI or scope change)

## Problem

Any client with an open socket, including an invite-link guest before login, can stop the Node process with one message. Rooms live only in process memory, so every room on the server is lost.

| Message | Where it throws |
|---|---|
| `null` | `lib/wsServer.js` destructures `{ type, payload }` from `null` |
| `{"type":"constructor"}`, `"__proto__"`, `"toString"`, … | `schemas/ws.js` `SCHEMAS[type]` returns an inherited `Object.prototype` member; `.safeParse` is not a function |
| `{"type":{"toString":1}}` | converting `type` to a property key (and the `Unknown type: ${type}` reply) throws `Cannot convert object to primitive value` |

All three throw inside the `ws` `message` listener, outside the `JSON.parse` `try`, and nothing catches them.

## Design

1. **Envelope check in `lib/wsServer.js`**, after `JSON.parse`: drop the message with a `logger.warn` unless `parsed` is a non-null, non-array object and `parsed.type` is a string. Dropping matches how invalid JSON and invalid payloads are already handled (silently, socket stays open).
2. **Own-property lookup in `schemas/ws.js`**: `validateMessage` treats `type` as known only if `Object.hasOwn(SCHEMAS, type)`. Inherited names fall through to `unknown_message_type`, which the server already answers with an `error` message.

## Decisions (my calls)

- **No catch-all `try/catch` around the dispatch, and no `uncaughtException` handler.** The global rule is one control per property. The envelope check and own-property lookup fix the cause; a catch-all on top would leave the survival test green with either removed, so neither could be proven. A catch-all also hides future handler bugs as log lines while state may be half-mutated. If a handler-level crash is ever recorded, that is the moment to add one.
- **Drop, don't reply, for a malformed envelope.** Consistent with existing invalid-JSON behaviour. An unknown *string* type keeps its existing `error` reply.
- **The validation result's `data` is still not passed to handlers.** Out of scope; payloads are already validated before dispatch.

## Tests

- `tests/ws-schema.test.js` (unit): `validateMessage` returns `unknown_message_type` for `constructor`, `__proto__`, `toString`, `hasOwnProperty`.
- `tests/ws-validation.test.js` (real server process): send each crashing message, then prove the process survived: a valid message from another socket still round-trips and the server's `/health` still answers.
- Each new test must be seen failing against the current code before the fix lands.

## Non-goals

Room persistence across restarts; rate limiting; changes to handler logic or schemas for known types.

## Re-login on an open socket

A second `login` on the same socket used to leave the user in their first room, so a room could keep a `facilitatorId` for someone who had moved on and then disconnected; a later `changeRole` wrote to that missing participant and crashed the process, and facilitator changes in the first room could rewrite the role of a user now in another room. A second `login` now moves the user: once the new login passes its checks, `handleLogin` runs the normal exit for the current room (facilitation hands on as on disconnect), then joins the new one. A rejected login leaves the user where they were. A guest who was the last member of their room closes it by leaving and is told so, matching logout-then-login. Decided by David, 2026-10-24.
