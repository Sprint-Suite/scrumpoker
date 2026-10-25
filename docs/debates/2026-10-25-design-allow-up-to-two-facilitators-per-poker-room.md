# Debate: Design: allow up to two facilitators per poker room

- Id: 2026-10-25-design-allow-up-to-two-facilitators-per-poker-room
- Opened: 2026-10-25T14:55:29.508Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Request (David): a facilitator can give the facilitator role to another person so the room continues if he is called away; at most two facilitators per session.

Current model: room.facilitatorId is a single id (lib/roomState.js createRoom/assignFacilitator/reassignFacilitatorIfLeaving; getRoomState sends facilitatorId). Every permission check is on participant.role via lib/roles.js (canRevealVotes, canResetVotes, canChangeRole; handlers like endSession/startNextRound use isFacilitator(currentUser.role)), so facilitatorId is bookkeeping, not the permission source. handleChangeRole (lib/wsHandlers.js ~L220-272) already lets a facilitator set another member to Facilitator, but that TRANSFERS: the old facilitator is demoted to Voter. Guests (authed=false) cannot be made Facilitator, and assignFacilitator only picks authed members; this stays. getAssignedLoginRole downgrades a Facilitator login request to Voter when a facilitator already exists.

Proposed design:
1. Replace room.facilitatorId with room.facilitatorIds, an ordered array; MAX_FACILITATORS = 2 in lib/roles.js. Invariant: an id is in facilitatorIds iff that participant is in the room with role Facilitator, and the list is never empty while an authed member is present.
2. Login: unchanged rule. A Facilitator request is granted only when the room has no facilitator; otherwise Voter. Second facilitators come only from an explicit grant.
3. changeRole to Facilitator on another member: an existing facilitator only (canChangeRole); the target must be authed and in the same room; if the list is full (2) and the target is not already in it, error 'A room can have at most two facilitators.'; otherwise ADD (no more auto-demotion of the granter). A transfer is grant then step down.
4. changeRole away from Facilitator (self step-down, or a facilitator demoting the other): allowed when another facilitator remains; if the target is the last facilitator, keep today's behaviour (hand to another authed member, or error if none).
5. Leave/disconnect: remove from facilitatorIds; if empty, assignFacilitator picks the first authed member, as now.
6. getRoomState sends facilitatorIds (no facilitatorId; both pages deploy together, and the restart wipes rooms). Client app.js: the 'Lead' badge for every id in the list; the per-participant role select omits 'Facilitator' when the list is full and that participant is not a facilitator. join.js does not use facilitatorId.
Peer facilitators are equal: either can demote the other, end the session, etc. I am treating that as acceptable because both are company members a facilitator deliberately chose.
Tests: handler tests for grant-adds, cap of 2, grant to a guest refused, step-down with a co-facilitator, demoting the other facilitator, last-facilitator step-down handover, a leaving facilitator leaves the other in place; room-state projection; e2e for granting a co-facilitator who can then reveal after the original leaves.

Challenge the invariant, the equal-powers choice, and anything that lets a guest or a stale id gain or keep facilitator powers.

## Round 1/3 — ChatGPT: OBJECT

The additive co-facilitator model and equal powers are reasonable, but two authorization details need to be explicit before agreement.

1. canChangeRole is not a facilitator-only check. In lib/roles.js it permits every participant to change their own role. I reproduced an authenticated Voter sending changeRole with newRole='Facilitator' and no targetUserId: handleChangeRole promotes them without error. Under the proposed additive implementation, that would let them claim the second slot without a grant. Require isFacilitator(currentUser.role) whenever newRole is Facilitator, alongside the existing target authentication and room checks. Preserve self-service Voter/Observer changes. Also remove the Facilitator option for non-facilitators from the self-role modal in public/index.html/public/js/app.js. Add handler tests rejecting both Voter and Observer self-promotion when a slot is available.

2. Strengthen the invariant: facilitatorIds must contain unique IDs of authenticated participants whose roomName matches and whose IDs belong to room.users, with exactly the same participants holding the Facilitator role. lib/roomState.js assignFacilitator currently validates an existing ID using only existence and authed. With a synthetic stale ID pointing to an authenticated participant in another room, I reproduced it promoting that participant and leaving the local member unpromoted. The new helper must not retain or restore powers through such an ID. Test missing IDs, cross-room IDs, guest-only rooms, and a co-facilitator logging into another room through handleLogin/leaveCurrentRoom.

Equal powers fit the existing role-based permissions; no separate owner hierarchy is needed. Add a regression proving a demoted peer immediately loses reveal/reset/end permissions through lib/wsServer.js's current participant lookup. Existing focused role, room-state, and handler tests pass. Also update tests/roles.test.js and tests/ws-operations.test.js, which reference the existing login helper contract and facilitatorId projection.

## Round 2/3 — Claude

Both conceded. I reproduced point 1 on the current code: an authed Voter sends changeRole {newRole:'Facilitator'} with no target, becomes Facilitator, and the real facilitator is demoted to Voter with no error. The self-role modal (public/index.html #edit-role-select) even offers it. That is a live escalation today, so the fix ships with this change and I will report it to David as such.

Revised design additions:
1. In handleChangeRole, newRole === Facilitator requires isFacilitator(currentUser.role), self or other, checked before any state change. Self-service Voter <-> Observer stays allowed. The client removes the Facilitator option from #edit-role-select for non-facilitators (a facilitator sees it but it is a no-op for themselves). Tests: a Voter and an Observer self-promotion are refused with a slot free and with the list full, and state is unchanged.
2. The invariant becomes: facilitatorIds holds unique ids, each in room.users, of authed participants whose roomName equals this room, and the participants with role Facilitator in the room are exactly that set. A single helper, normalizeFacilitators(rooms, participants, roomName), filters the list by that predicate, demotes any in-room participant holding Facilitator who is not in the list, and fills an empty list with the first eligible member. It never promotes an id outside the room. It runs from assignFacilitator, which login, changeRole, exit and leaveCurrentRoom already route through. Tests: missing ids, cross-room ids (the synthetic case you reproduced), guest-only rooms (list empty, nobody promoted), and a co-facilitator logging into another room via handleLogin/leaveCurrentRoom (removed here, the other facilitator kept).
3. Regression: after a facilitator demotes their peer, the peer's revealVotes, resetVotes and endSession are refused through the real participants lookup in wsServer (a transport test with two sockets).
4. tests/roles.test.js and tests/ws-operations.test.js get updated for the facilitatorIds projection and the login helper contract.

## Round 2/3 — ChatGPT: AGREE

The revised design addresses both objections: promotion requires an existing facilitator, and normalization validates authentication and actual room membership. Equal powers fit the existing role-based permissions, and the transport regression will verify that demotion immediately revokes authority.

One implementation correction from inspecting the repository: handleChangeRole currently never calls assignFacilitator, and reassignFacilitatorIfLeaving calls it conditionally. Explicitly wire normalization into successful login, role-change, and departure paths before broadcasting; those routes do not already provide it universally. Normalization must deduplicate IDs and enforce the two-person bound. Rejected requests must leave state unchanged, and last-facilitator step-down must select a replacement excluding the person stepping down.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Support at most two equal facilitators per room. Login retains its existing allocation rule; an existing facilitator can explicitly add an authenticated room member without losing their own role. Block non-facilitator self-promotion server-side and remove that option from their self-role modal. Maintain a unique, bounded facilitatorIds list matching authenticated, present participants with Facilitator roles, using normalization on successful membership and role transitions. Preserve a remaining co-facilitator on departure; automatically appoint an eligible replacement only when none remain. Permit step-down with a peer or eligible replacement. Update state projection, badges, role controls, and unit, transport, and browser tests, including stale membership and immediate permission revocation.

