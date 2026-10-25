# Debate: Code review and security audit: co-facilitators and the self-promotion fix

- Id: 2026-10-25-code-review-and-security-audit-co-facilitators-and
- Opened: 2026-10-25T15:05:19.121Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Stage: commit on feat/co-facilitators (base c5503b7) implementing docs/debates/2026-10-25-design-allow-up-to-two-facilitators-per-poker-room.md. Files: lib/roles.js (MAX_FACILITATORS = 2), lib/roomState.js (facilitatorIds replaces facilitatorId; isEligibleFacilitator = in room.users, authed, roomName matches; normalizeFacilitators dedupes, filters, caps at 2, fills an empty list with the first eligible member, sets Facilitator on listed members and demotes any unlisted in-room Facilitator; reassignFacilitatorIfLeaving removes the leaver then normalises; getRoomState sends facilitatorIds), lib/wsHandlers.js (login pushes to the list only when getAssignedLoginRole grants Facilitator, i.e. the list is empty, then normalises; handleChangeRole is split into resolveRoleChange for validation, including the new facilitatorGrantError: newRole Facilitator requires the actor to be a Facilitator, and the target authed, then updateFacilitatorList (add, refusing a third; remove, and when last hand to an eligible member other than the leaver, or refuse) and normalizeFacilitators before broadcast; refusals mutate nothing), public/js/app.js (facilitatorIds; Lead badge per facilitator; the per-participant select omits Facilitator when two exist and the target is not one; the self-role modal hides and disables the Facilitator option unless you already are one), tests.

Live bug this closes (reported to David): on c5503b7 any authed member could send changeRole {newRole:'Facilitator'} for themselves, take facilitation and demote the facilitator with no error.

Tests: room-state (normalisation drops missing, cross-room, guest and duplicate ids, caps, demotes unlisted Facilitator roles, keeps a co-facilitator on leave); handlers (grant adds without demoting, a third refused with state unchanged, Voter/Observer self-promotion refused with the list at 1 and 2 (mutation-checked: all 4 fail without the guard), Voter<->Observer self-service kept, step-down with a peer, demoting the peer revokes reveal, last-facilitator handover, leave keeps the peer, a co-facilitator logging into another room leaves the list); a transport test where a granted co-facilitator reveals, is demoted, and is then refused reset and endSession; an e2e covering grant, two badges, the option hidden at the cap, the member modal without Facilitator, and the co-facilitator running the room after the original logs out. The shared socket harness moved to tests/helpers/ws-harness.js. 198/198 unit, 17/17 e2e.

Please check correctness, auth and access control, input handling, error paths, and anything that lets a guest, a stale id or a non-facilitator gain or keep facilitator powers.

## Round 1/3 — ChatGPT: OBJECT

The self-promotion guard is correct, but two gaps remain in d54d40f.

1. normalizeFacilitators in lib/roomState.js:121 only reconciles roles for room.users. I reproduced a stale participant with roomName='alpha', authed=true and role='Facilitator', whose ID was absent from room.users but present in facilitatorIds. Normalization removed the ID but retained the Facilitator role. handleRevealVotes then successfully revealed votes because authorization checks that role (lib/wsHandlers.js:129). This requires inconsistent internal state; I have not demonstrated a normal WebSocket sequence creating it. Nevertheless, it violates the explicitly agreed stale-state invariant. Reconcile all participants whose roomName matches, demoting anyone outside the validated list. Add a regression proving the stale participant loses privileged actions.

2. The transport regression has a synchronization race. tests/helpers/ws-harness.js:61 searches all historical messages without consuming them. The demotion wait at tests/co-facilitators-transport.test.js:33 already matches Bob’s initial login state: one facilitator, Alice. It can therefore send reset before demotion has been processed across the two sockets. Use a message cursor or require Bob’s Voter role together with votesRevealed=true, distinguishing that state from login.

All 61 focused role, room-state and handler tests passed, as did production JavaScript syntax checks. Transport execution was blocked by sandbox listen EPERM; browser coverage was not rerun. No files changed or server left running.

## Round 2/3 — Claude

Both conceded, fixed in a follow-up commit on the branch.

1. normalizeFacilitators now reconciles every participant whose roomName matches (Object.values(participants)), not just room.users, so anyone with that roomName outside the validated list is demoted. Regressions: room-state, where a stale same-room participant listed in facilitatorIds but absent from room.users is dropped from the list and demoted to Voter; and handlers, where that stale participant's revealVotes is refused after normalisation. Mutation-checked: restoring the room.users-only loop fails both.

2. The harness inbox now keeps a cursor: each next() only matches messages after the previous match, so Bob's login state can no longer satisfy the demotion wait. The demotion wait in co-facilitators-transport therefore requires a state that arrives after the grant (and the reveal). 200/200 unit, transport 1/1, 17/17 e2e.

## Round 2/3 — ChatGPT: AGREE

I inspected follow-up commit 170b434. normalizeFacilitators now reconciles every same-room participant, closing the reproduced stale-role authorization gap. Both new regressions pass. The inbox cursor advances beyond each matched message, preventing Bob’s initial login state from satisfying the demotion wait. I independently verified that behavior without sockets. All 63 focused tests and touched-file syntax checks passed. Full transport/browser results remain Claude’s reported verification; local socket binding is denied in this sandbox. No remaining blocking findings.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Support at most two equal facilitators, with explicit grants restricted to existing facilitators and authenticated room members. Block non-facilitator self-promotion, normalize facilitator membership and roles across all same-room participants, preserve handover behavior, and use ordered transport waits to verify immediate permission revocation after demotion.

