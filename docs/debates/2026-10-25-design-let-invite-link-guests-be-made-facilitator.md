# Debate: Design: let invite-link guests be made Facilitator, with a rejoin key that restores the role after a refresh or dropped connection

- Id: 2026-10-25-design-let-invite-link-guests-be-made-facilitator
- Opened: 2026-10-25T15:34:05.716Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

The design in docs/superpowers/specs/2026-10-25-guest-co-facilitators-design.md is sound and should be built as written. Summary: (1) Drop the company-member check on Facilitator grants. The #68 rules stay: grant only by a current facilitator, at most two, no self-promotion. (2) Guests are never auto-promoted. The normalizeFacilitators top-up and the step-down handover still pick company members only. A guest-only room can have no facilitator. This is David's explicit rule. (3) Guest facilitators get the full control set on join.html through a shared module, not code copied into join.js. (4) Rejoin: on each guest login the server sends a 128-bit random key to that socket only, never broadcast. Participant ids are broadcast, so the key is independent of the id. A guest facilitator who leaves leaves a 2-minute hold on the room object. A login with a matching key consumes the hold and restores Facilitator if a place is free. A key matching a live guest participant in the same room takes over that participant (needed because the heartbeat takes 30–60 s to notice a dead socket). A wrong, expired or reused key degrades silently to Voter. The client stores {token, name, key} in sessionStorage, auto-rejoins on refresh, reconnects with backoff on a drop, and gives up after 2 minutes. The threat I care most about: someone holding only the invite link, or anything visible in room broadcasts, must not be able to claim or steal a guest's Facilitator role. Please check that, the takeover path (eviction abuse, a duplicated tab), the interaction with the facilitator cap and normalizeFacilitators, and anything in the existing code (lib/wsHandlers.js, lib/roomState.js, lib/wsServer.js, lib/heartbeat.js, public/js/join.js) that makes the design wrong or incomplete.

## Round 1/3 — ChatGPT: OBJECT

The guest-grant rules, member-only automatic handover, shared controls, and non-reserving holds are sound. But I would revise the reconnect protocol before building it as written.

Blocking failure: the spec requires immediate key rotation on every successful login and immediate consumption of the previous key/hold (design lines 42–48). Suppose Ian reconnects with K1, the server restores Facilitator and replaces K1 with K2, then the connection drops before Ian receives and stores K2. Ian can only retry K1, which now yields Voter—even within two minutes, with the room still open. Heartbeat cleanup subsequently holds the inaccessible K2. In a guest-only room this can strand the session without a usable facilitator. Sending K2 first does not guarantee its receipt. Specify a recoverable credential handover, such as an acknowledged rotation protocol with defined retry semantics, and test a dropped connection between server acceptance and client storage.

Repository-specific requirements also deserve explicit treatment:
• lib/roomState.js:getRoomParticipants currently broadcasts every participant property except ws and authed (lines 81–84). A rejoinKey property would leak directly. Keep secrets separately or use an explicit public-field projection; retain the proposed real-socket secrecy test.
• Takeover must atomically replace membership and facilitator ID before normalization or broadcasting. handleParticipantExit calls leaveRoom and reassignFacilitatorIfLeaving (lib/wsHandlers.js:292–300), which can delete an empty room or automatically promote a member. Merely suppressing hold creation is insufficient. Test takeover with two occupied facilitator places, a waiting member, and delayed old-socket close/error events.
• A duplicated tab possesses the actual bearer credential, so its takeover is consistent with the stated security boundary. Give the displaced client a terminal takeover signal; otherwise join.js’s proposed automatic reconnect will silently bring it back as an extra Voter.

An invite token or broadcast participant ID alone should confer no takeover authority under this design. The six focused existing test files passed; they do not cover the proposed protocol. Review only: main at fdc811a, no changes or push, no server running.

## Round 2/3 — Claude

I concede all four points. I checked each one against the code, and the spec now covers them. (1) Rotation race: I've dropped rotation. A key is issued only when a guest login matches nothing. A rejoin that matches a hold or a live participant keeps the same key. So a drop between the server accepting the rejoin and the page storing anything leaves the page holding a key that still works. Reuse adds no exposure, because the key only ever travels between the server and its owner's socket. There's a test for the accept-then-drop case. (2) Leak: confirmed. getRoomParticipants strips only ws and authed. Keys now live on the room in their own structure (live key → participant id, plus holds) and never on the participant object. The real-socket secrecy test stays. (3) Takeover is now a dedicated swap and does not go through handleParticipantExit. It replaces the id in room.users and in place in facilitatorIds, repoints the key, and deletes the old participant entry before any normalisation or broadcast. The old socket's later close/error finds no participant, and handleExit already checks participants[userId], so it does nothing. Tests cover both facilitator places filled with a member waiting, and delayed old-socket close/error. (4) The displaced socket gets a terminal { type: 'replaced' } message and is closed, and the page does not reconnect on it. Please re-read the revised spec and say whether anything still blocks.

## Round 2/3 — ChatGPT: AGREE

I re-read the revised spec against the repository. Stable keys resolve the lost-rotation-response failure. Room-owned key maps avoid getRoomParticipants’ property-spread leak. The dedicated swap avoids handleParticipantExit’s room deletion and automatic handover; deleting the old participant also makes wsServer’s delayed close/error cleanup harmless. Preserving the facilitator ID’s position maintains the cap without promoting a waiting member.

One editorial inconsistency remains: remove 'already-used key' and 'reused key gives Voter' from the rejection rules/tests. A previously used key that still maps to a live guest or unexpired hold must work—that is now essential to recovery.

The duplicated-tab boundary is acceptable: either holder of the secret can take over. The replaced message stops automatic reconnect when delivered; it does not revoke the displaced tab’s copied credential. Invite-link possession and broadcast participant IDs provide neither capability.

This approves the design, not an implementation. Reviewed main at fdc811a; no code changes, commit, push, or server started.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Allow current facilitators to explicitly promote guests, retaining the two-facilitator cap and member-only automatic handover. Share facilitator controls between both pages. Use an independent, stable, server-generated guest secret stored privately on the room and in the client’s sessionStorage. Restore a disconnected guest’s facilitator role from a two-minute, non-reserving hold when capacity permits. For a matching live guest, atomically replace its participant and facilitator membership, preserve its current role, and notify/close the displaced socket. Add secrecy, interrupted-rejoin, capacity, delayed-cleanup, and browser workflow coverage.

