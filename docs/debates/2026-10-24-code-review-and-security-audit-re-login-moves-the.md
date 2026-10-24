# Debate: Code review and security audit: re-login moves the user out of their current room (fix/relogin-leaves-room, 7c6b35f..f2f1053)

- Id: 2026-10-24-code-review-and-security-audit-re-login-moves-the
- Opened: 2026-10-24T17:56:22.045Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

Stage: fixes the authenticated crash and cross-room role mutation you agreed should be an urgent separate fix (debate 2026-10-24-code-review-and-security-audit-websocket-message-c). Commit range 7c6b35f..f2f1053. Files: lib/wsHandlers.js, tests/ws-handlers.test.js, tests/ws-validation.test.js, docs/superpowers/specs/2026-10-24-ws-message-crash-design.md (section "Re-login on an open socket").

Design, decided by David: a second `login` on the same socket MOVES the user. handleLogin calls leaveCurrentRoom (the existing handleParticipantExit: leaveRoom, facilitator handover via reassignFacilitatorIfLeaving, delete participants entry, broadcast old room) once the login's own checks pass, then joins the new room. Authed branch: after name/company/role/room validation, so a rejected login leaves the user in place. Guest branch: leave happens before the rooms.has(anonRoom) check, so a guest who was the last member closes the room and is told "room has closed" rather than joinRoom recreating it with a new shareToken; this matches what logout-then-login already did.

Evidence: new handler tests (move hands facilitation on; rejected login keeps the user in place; lone guest is told the room closed) and a real-server test of the exact crash sequence (re-login to second room, disconnect, changeRole in first room; asserts child.exitCode null, /health ok, Bob promoted). The handler test and the server test fail on the old code; moving the leave to the top of handleLogin fails the rejected-login test. npm test 150/150 and Playwright 9/9 locally. Caveat: this WSL dev box's wall clock oscillates ±63 s (measured), which flakes local tests whose helpers use Date.now() deadlines (waitForHealth); main flakes at a similar rate; GitHub CI is unaffected. Logged as a minor, not fixed here.

Please check correctness, auth and access control, room isolation, input handling, injection, secrets and error paths. In particular: any remaining stale member/facilitatorId path (e.g. re-login to the SAME room, endSession, changeRole), any remaining participants[id] dereference that can be undefined, and whether the move can be abused to escape an anonRoom or strip a facilitator.

## Round 1/3 — ChatGPT: AGREE

I independently reviewed 7c6b35f..f2f1053 and the surrounding lifecycle code. No blocking finding.

lib/wsHandlers.js:63 runs the existing exit handler after authenticated login checks. handleParticipantExit removes membership before facilitator reassignment, then deletes the participant before broadcasting. This prevents the departed user from becoming their own replacement and removes the cross-room mutation path.

Same-room re-login correctly follows logout-then-login semantics: another authenticated member inherits facilitation; a lone authenticated user recreates the room. handleEndSession deletes only participants in its room, so it leaves a moved user intact. Guests remain bound to ws.anonRoom and cannot request facilitation or displace the facilitator. Leaving before checking room existence correctly prevents a lone guest from recreating it.

The unchecked participants[room.facilitatorId] dereference remains at lib/wsHandlers.js:253, but I found no reachable stale-reference sequence through login, exit, role changes, session ending or expiry after this fix. Input validation still precedes dispatch; the patch adds no injection or secret-handling surface.

Verified: 59 focused unit tests, syntax and diff checks, explicit same-room/endSession/guest probes, and 50,000 mixed lifecycle operations checking invariants. Server integration tests were blocked before their assertions by EROFS when creating temporary directories; I cannot independently confirm the reported full-suite or Playwright results.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Accept f2f1053: a valid second login exits the current room through normal cleanup and facilitator handover before joining its destination. Rejected authenticated logins preserve membership; a lone guest's re-login closes the room and returns the closed-room error.

