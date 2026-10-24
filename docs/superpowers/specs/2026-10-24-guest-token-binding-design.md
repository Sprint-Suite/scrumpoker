# Guests are bound to their invite token, not a room name

**Date:** 2026-10-24 · **Size:** small change · **Approved:** fix chosen by David 2026-10-24 ("tie guests to the invite token"); details self-approved under autopilot.

## Problem

A guest socket is admitted at upgrade by the room's `shareToken`, but `decideUpgrade` keeps only the room *name* (`ws.anonRoom`). `handleLogin`'s guest branch then checks only that a room of that name exists. A room name outlives its token:

1. Guest joins with token T.
2. The facilitator sends `endSession` (room deleted, guest's participant entry deleted, socket left open), then logs in to the same room name. The new room has token T2.
3. The guest re-sends `login` on the still-open socket and is admitted to the new session without the new link.

The same happens whenever a room closes (last member leaves, or it expires) and a company member recreates the name.

## Design

- `decideUpgrade` returns the presented token with the anonymous decision (`anonToken`), and the upgrade handler stores it on the socket as `ws.anonToken` beside `ws.anonRoom`.
- `handleLogin`'s guest branch admits only when `ws.anonToken` is set and equals `rooms.get(ws.anonRoom).shareToken`. Otherwise it sends the existing `This room has closed or the link is invalid.` error. The guest's leave-first ordering is unchanged.

## Decisions (my calls)

- **Keep `ws.anonRoom` and add the token comparison**, as agreed, instead of re-resolving the room by token at each login. The behaviour is the same; this is the shape David approved.
- **Fail closed on a missing `ws.anonToken`.** Every real room has a token, so `undefined === undefined` can only happen with a hand-built room, but the guard costs nothing.
- **Same error text** as a closed room. From the guest's side the link they hold is dead, which is what that message says, and it reveals nothing about the new session.
- **No client change.** `join.html` already shows this error.

## Tests

- Unit (`tests/ws-handlers.test.js`): a guest whose room was deleted and recreated under the same name with a new token is refused and not added to the room. The existing guest tests gain a matching `anonToken`.
- Unit (`tests/ws-server-upgrade.test.js`): the anonymous decision carries the token.
- Real server (`tests/ws-validation.test.js`): the repro above over real sockets. It covers the seam where `wsServer.js` stores the token. Seen failing on current `main` before the fix.

## Non-goals

Closing guest sockets on `endSession`; rate limiting; any change for authenticated users.
