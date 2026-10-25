# Invite-link guests can be made Facilitator

**Date:** 2026-10-25 · **Size:** project · **Status:** design-final debate agreed (docs/debates/2026-10-25-design-let-invite-link-guests-be-made-facilitator.md); approved by David 2026-10-25.

## Why

David runs estimation sessions for a team that joins through the invite link, so his team are guests, not company members. He can be called into a meeting at short notice. When that happens he wants to hand the session to a guest (Ian) who carries on: reveals votes, clears past results, starts the next round.

#68 allowed a second facilitator, but only for company members. Today the server refuses a guest grant (`Only company members can be made Facilitator.`), the guest page has no facilitator controls, and a guest who refreshes comes back as a new Voter through the join form.

**Success:** David makes Ian Facilitator, closes his tab, and Ian runs the remaining rounds from the guest page, including after a refresh or a dropped connection.

## Goals

1. A facilitator can make any participant in the room Facilitator, guest or member.
2. A guest Facilitator has the same controls as a member Facilitator: reveal, reset, next round, end session, the role menu (including demoting a member facilitator) and the invite link.
3. A guest who refreshes or loses their connection rejoins automatically under the same name. A guest who was Facilitator when they dropped gets the role back if they return within the hold window and the room has a free facilitator place.
4. Fix the two role-menu bugs found while reproducing (see "Role-menu bugs").

## Non-goals

- Keeping a member facilitator's role across a refresh. Members already have their own session restore. Whether it should restore the role is a separate story.
- Keeping a guest's vote across a refresh. They rejoin with no vote.
- Keeping a room open when its last participant refreshes. The room closes when it empties, as it does today.
- Any change to who can join, or to invite tokens.

## Anti-goals (a failure even if it works)

- **A guest is promoted without a facilitator choosing them.** David: "Only by hand, whoever I picked."
- **A copied invite link, or anything visible to the room, lets someone else claim a guest's Facilitator role.**
- `join.js` grows by copying more of `app.js` into it.

## Rules

- **Granting.** Only a current Facilitator can grant Facilitator, to a participant in the same room. At most two facilitators. No self-promotion. These are the #68 rules, unchanged, minus the company-member check.
- **No automatic promotion of guests.** The room is topped up automatically only from company members, as today (`normalizeFacilitators` top-up and the last-facilitator step-down handover). A guest Facilitator is kept on the list; a guest is never picked to fill it.
- **Guest-only room with no facilitator** stays without one. Anyone can still vote. Nothing can be revealed until someone returns with a held place.
- **A guest Facilitator stepping down** follows the existing rule: if they are the last facilitator and no member is present, they are refused with `Assign another facilitator before leaving the facilitator role.` They can grant another guest first.

## Guest rejoin

**Rejoin key.** When a guest logs in without a key that matches anything (below), the server generates a random key (at least 128 bits, `crypto.randomBytes`) and sends it **only to that socket** in a new server message (e.g. `{ type: 'rejoinKey', payload: { key } }`). It never appears in `updateState` or any broadcast. Participant ids are broadcast to the room, so the key must not be derived from or equal to an id.

**The key is stable, not rotated.** A login whose key matches a hold or a live participant keeps that same key. Rotating on each rejoin would strand the guest if the connection dropped after the server accepted the rejoin but before the page stored the new key. Reuse adds no exposure, because the key only ever travels between the server and its owner.

**Where keys live.** Keys are kept on the room in their own structure (live key → participant id, and the holds), **never on the participant object**. `getRoomParticipants` broadcasts every participant property except `ws` and `authed`, so a key stored there would leak to the whole room.

**Holding a place.** When a guest who is on `room.facilitatorIds` leaves the room for any reason (socket close, error, heartbeat termination), the room records a hold: `{ key, expiresAt }` with a **2-minute** window. Holds live on the room object, so they die with the room. A hold does not reserve a facilitator place: if the room has two facilitators when the guest returns, they come back as Voter.

**Rejoining.** The guest's `login` payload may carry `rejoinKey`. If it matches an unexpired hold in that room, the hold is removed, the key becomes the new participant's live key, and the guest is added to `facilitatorIds` if a place is free.

**Taking over a stale connection.** After a network drop the server does not notice the old socket for 30–60 s (`lib/heartbeat.js`), while the page reconnects within seconds. So the server also keeps each guest's current key against their live participant. A guest login whose `rejoinKey` matches a **live** guest in the same room takes that participant's place.

The takeover is a dedicated swap, **not** the normal exit path. `handleParticipantExit` → `leaveRoom` / `reassignFacilitatorIfLeaving` can delete an emptied room or auto-promote a waiting member, so it must not run. In one step, before any normalisation or broadcast, the swap does four things: replaces the old id with the new id in `room.users` and in place in `room.facilitatorIds`, points the key at the new id, deletes the old participant entry, and adds the new one with the old role. The old socket's later `close`/`error` then finds no participant and does nothing.

The old socket is sent a terminal `{ type: 'replaced' }` message and closed. A page that receives it stops, does not reconnect, and says the session continued in another tab or window. Without that message, the displaced tab's own auto-reconnect would bring it back as an extra Voter. One key matches at most one participant or one hold, never both. A key matching a member, or a participant in another room, matches nothing. A missing, wrong or expired key is not an error: the guest joins as Voter as normal. A key is useful only on the guest login path and only in the room it was issued for. Authenticated logins ignore it.

**Client.** The guest page keeps `{ token, name, rejoinKey }` in `sessionStorage` (per tab). On load, if the stored token matches the URL token, it skips the join form and logs straight in with the stored name and key. On an unexpected socket close after a successful join, it reconnects with backoff (reuse `reconnect.js`'s `createBackoff`) and logs in the same way, instead of dropping to the join form. `sessionEnded` and a refused login (closed room or invalid link) clear the stored entry and show the join form with the existing message.

**When to stop retrying.** A closed room usually shows up as a refused upgrade, not a refused login, and the page cannot tell that apart from a busy server. Rooms are lost on every deploy, too. So the page keeps retrying for the length of the hold window (2 minutes) after the drop, then stops, clears the stored entry and shows the join form with the existing "This room may have closed, or the server is busy" message. Nothing is added to the server for this.

## Guest page facilitator controls

The guest page shows the facilitator controls exactly when the guest is on `facilitatorIds`, and hides them again when demoted. The controls and their behaviour match `index.html`: show votes, next round, reset votes, end session (with its confirm modal), the invite-link menu and the per-participant role select.

**Constraint:** share the code between `app.js` and `join.js`, e.g. a new `public/js/facilitatorControls.js` loaded by both pages. Do not copy more of `app.js` into `join.js`, which is already 410 lines against a 400-line limit. This story should bring it under the limit. The markup duplication between `index.html` and `join.html` is known; add only the markup the guest page needs.

## Role-menu bugs (fix in this story)

1. When the server refuses a role change, the participant's select keeps showing the requested role. It should re-render to the role the server holds.
2. The refusal text appears only in `#vote-error` under the cards. It should appear next to the participant list where the change was made.

Both pages share the fix through the shared controls.

## Server changes, in outline

- `facilitatorGrantError` (`lib/wsHandlers.js`): drop the `!target.authed` refusal.
- `lib/roomState.js`: separate "may stay on the facilitator list" (any participant in the room) from "may be auto-picked" (company members only). `normalizeFacilitators` keeps guests already on the list and tops up from members only. The step-down handover in `updateFacilitatorList` picks members only.
- `handleLogin` guest branch: issue the rejoin key, accept `rejoinKey` and apply a matching hold.
- `handleParticipantExit`: record a hold for a leaving guest facilitator.
- `schemas/ws.js`: `login` accepts an optional `rejoinKey` (fixed-length hex string).
- Hold expiry uses the injected `now` already passed through `roomState`, so tests do not depend on the wall clock.

## Tests

- Unit (`tests/ws-handlers.test.js`, `tests/room-state.test.js`): a facilitator grants a guest; a guest Facilitator can reveal, reset, start the next round, end the session and change roles; a guest is never auto-promoted (last member facilitator leaves a guest-only room → no facilitator); a member is still auto-promoted when present; a hold is created only for a guest facilitator; rejoin with a valid key restores the role; an expired, wrong or other-room key gives Voter; a previously used key that still maps to a live guest or an unexpired hold still works; a full room gives Voter; a key matching a live guest replaces that participant, keeps its Facilitator place and creates no hold; a key never takes over a member; takeover with both facilitator places filled and a member waiting changes neither the facilitator list nor promotes the member; the old socket's delayed `close`/`error` after a takeover changes nothing; a rejoin accepted but dropped before the page stores anything still works with the same key.
- Real socket (`tests/co-facilitators-transport.test.js` or a new file): the rejoin key is sent only to its owner and never appears in any message another socket receives; a guest facilitator who drops and reconnects with the key is Facilitator again; a takeover sends `replaced` to the old socket and closes it.
- E2E: change `anonymous-join.spec.js` deliberately, so an **ungranted** guest still sees no facilitator controls. Add the use case: the facilitator grants a guest, the facilitator leaves, the guest reveals and starts the next round, the guest refreshes and is still Facilitator. Add the refused-role-change rerender and error placement.

## Calls made without David (check these)

- The rejoin key, the 2-minute hold, and that a hold does not reserve a place.
- A rejoin key takes over a guest's still-live old connection. A second tab holding the same key (e.g. a duplicated tab, which copies `sessionStorage`) closes the first.
- The guest page stops retrying after 2 minutes rather than adding a server endpoint to tell a closed room from a busy server.
- Member facilitators keep today's refresh behaviour.

## Left to the builder

The shared module's shape and name; the exact server message name for the key; where the role-menu error renders; the reconnect backoff numbers; the order of work.
