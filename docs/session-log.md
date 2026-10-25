# Scrum Poker Session Log

## 2026-05-08 - Development Kickoff

Branch: `feature/scrum-poker-baseline`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before kickoff: `master`
- Latest baseline commit: `f4a0091 Reduce scanner noise in frontend comments`
- Working tree at kickoff: untracked `docs/` directory containing `docs/scrum-poker-handover.md`
- Server status: no `node server.js` process was running

Last verified baseline from the handover:
- Live root page returned `200 OK`
- Live WebSocket opened and returned a `yourId` message
- `node --check server.js` passed
- `node --check public/js/app.js` passed
- `npm test` failed because no test script exists
- `npm audit --omit=dev` reported 4 production dependency vulnerabilities

Recommended next steps:
- Commit the handover and session log on a feature branch.
- Add focused baseline coverage for current WebSocket behavior.
- Add a `/health` endpoint.
- Review dependency audit findings and remove unused dependencies where practical.
- Use the Retrospective design and structure patterns for later UI and architecture work.

Work completed:
- Created and committed kickoff docs in `b68973f Add Scrum Poker kickoff docs`.
- Added `SCRUM_POKER_KEYS_FILE` so tests and future deployments can point at an explicit keys file without exposing local secrets.
- Added `/health`, returning status, uptime, and active room count.
- Added `npm test` using Node's built-in test runner.
- Added WebSocket baseline tests for health, login, facilitator/voter/observer behavior, voting, reveal, reset, role restrictions, and invalid access keys.
- Removed unused `animejs` and ran `npm audit fix`, updating vulnerable production transitive dependencies.

Verification:
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Actions CI

Branch: `feature/github-actions-ci`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `e7eda7e Add Scrum Poker baseline tests`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Add a GitHub Actions workflow that runs the established local baseline checks on pushes and pull requests.
- Keep Bitbucket as a backup remote while GitHub remains the primary `origin`.

Work completed:
- Added `.github/workflows/ci.yml`.
- Configured CI to run on pull requests to `main`/`master` and pushes to `main`, `master`, and `feature/**`.
- CI installs with `npm ci`, checks JavaScript syntax, runs `npm test`, and audits production dependencies.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Deployment Documentation

Branch: `feature/github-deployment-docs`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `4f574c6 Add GitHub Actions CI`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Document GitHub as the primary deployment source.
- Keep the old Bitbucket remote documented as a temporary backup.
- Capture production pull, verification, runtime, and health-check steps.

Work completed:
- Added `docs/deployment.md`.
- Linked the deployment runbook from `README.md`.

Verification:
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Room State Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `24a9f84 Document GitHub deployment workflow`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract room lifecycle and room-state projection helpers from `server.js`.
- Preserve current WebSocket behavior under the existing baseline tests.
- Add direct unit coverage for the extracted helper module.

Work completed:
- Added `lib/roomState.js` for room creation, join/leave, expiry, state projection, and facilitator assignment/reassignment.
- Updated `server.js` to use the extracted helpers and a local room-broadcast helper.
- Added `tests/room-state.test.js` with focused helper coverage.
- Updated GitHub Actions and deployment docs to syntax-check the helper module and all test files.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check lib/roomState.js`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 11 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Access Key Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `feature/extract-room-state`
- Latest baseline commit: `089bd12 Extract room state helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract access-key file path resolution, loading, validation, and internal room naming from `server.js`.
- Preserve the current key-file behavior used by the WebSocket login flow.
- Add direct unit coverage for access-key helpers.

Work completed:
- Added `lib/accessKeys.js`.
- Updated `server.js` to use the access-key helper module.
- Added `tests/access-keys.test.js`.
- Updated GitHub Actions and deployment docs to syntax-check all helper modules in `lib/*.js`.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 18 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Role Helper Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `feature/extract-room-state`
- Latest baseline commit: `5763c84 Extract access key helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Centralize server-side role names and role permission checks.
- Preserve current role behavior and existing user-facing error messages.
- Add direct unit coverage for role helpers.

Work completed:
- Added `lib/roles.js`.
- Updated `server.js` to use role helpers for role validation, voting permission, facilitator-only actions, role change permission, and duplicate facilitator login handling.
- Updated `lib/roomState.js` to use the shared facilitator role constant.
- Added `tests/roles.test.js`.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 25 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - WebSocket Handler Extraction

Branch: `feature/extract-ws-handlers`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `15a8575 Extract role permission helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract WebSocket message handler logic from `server.js`.
- Preserve login, voting, reveal/reset, role-change, logout, disconnect, and error cleanup behavior.
- Add direct unit coverage for the extracted handler module.

Work completed:
- Added `lib/wsHandlers.js` for login, voting, reveal/reset, role-change, and participant-exit handling.
- Updated `server.js` so the WebSocket switch delegates to the handler module while retaining transport and broadcast helpers locally.
- Added `tests/ws-handlers.test.js` with focused coverage for handler decisions and room-state effects.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 31 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Admin Access Key Management

Branch: `feature/admin-key-management`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `925a962 Extract WebSocket handlers`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #1 was merged, main CI passed, and `feature/extract-ws-handlers` was deleted locally and remotely.

Work planned:
- Start moving terminal-only access key management into the app.
- Keep the existing `keys.json` format and CLI compatible.
- Guard in-app key management behind an explicit admin secret.

Work completed:
- Extended `lib/accessKeys.js` with strict key-store reads/writes, generated key creation, sorted listing, deletion, and constant-time admin-key comparison.
- Updated `manageKeys.js` to use the shared access-key helper module and honor `SCRUM_POKER_KEYS_FILE`.
- Added authenticated admin API endpoints for listing, generating, and removing access keys.
- Added `public/admin.html` and `public/js/admin.js` for a small in-app access-key manager at `/admin`.
- Added admin UI styles to `public/css/app.css`.
- Updated CI, README, and deployment docs for `SCRUM_POKER_ADMIN_KEY` and the new browser/CLI syntax checks.
- Added helper and HTTP integration coverage for admin key management.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check manageKeys.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `for file in public/js/*.js; do node --check "$file"; done`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 39 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Actions Node 24 Update

Branch: `feature/update-ci-node24`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `be5aa8b Add admin access key management`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #2 was merged, main CI passed, and `feature/admin-key-management` was deleted locally and remotely.

Work planned:
- Remove the GitHub Actions Node 20 deprecation warning.
- Test the project on the upcoming Node 24 runtime before GitHub changes the default action runtime.

Work completed:
- Updated CI to use `actions/checkout@v6`.
- Updated CI to use `actions/setup-node@v6`.
- Updated CI's Node runtime from `20` to `24`.
- Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to the CI job environment.
- Documented the Node 24 CI runtime in the deployment runbook.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `for file in public/js/*.js; do node --check "$file"; done`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- Local checks passed on Node.js `v20.19.6`.
- GitHub Actions CI passed on Node.js 24 for PR #3.
- No project `node server.js` process was left running.

## 2026-05-08 - Browser Smoke Test Coverage

Branch: `feature/browser-smoke-tests`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c480b82 Update CI to Node 24`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #3 was merged, main CI passed on Node.js 24, and `feature/update-ci-node24` was deleted locally and remotely.

Work planned:
- Add browser-level coverage before making larger UI changes.
- Exercise the current page login, vote, reveal, and reset wiring through a real browser.
- Include the browser smoke test in CI.

Work completed:
- Added Playwright as a development dependency.
- Added `playwright.config.js`.
- Added `npm run test:e2e`.
- Added `tests/e2e/scrum-poker-smoke.spec.js`, which starts the app with a temporary keys file and drives the facilitator workflow in Chromium.
- Updated CI to install Chromium and run the browser smoke test.
- Updated deployment verification docs for Playwright checks and e2e execution.
- Ignored Playwright output directories in `.gitignore`.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`
- `npx playwright install chromium`
- `npm run test:e2e`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- `npx playwright install chromium` completed locally.
- After the host Chromium dependencies were installed, `npm run test:e2e` passed locally with 1 browser smoke test.
- GitHub Actions CI passed, including `npm run test:e2e` in Chromium after `npx playwright install --with-deps chromium`.
- No project `node server.js` process was left running.

## 2026-05-08 - Login UI Foundation

Branch: `feature/ui-login-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `fc389e5 Add browser smoke test`
- Working tree: clean before the UI branch changes
- Server status: no `node server.js` process was running
- GitHub PR #4 was merged, main CI passed, and `feature/browser-smoke-tests` was deleted locally and remotely.

Work planned:
- Start the UI rebuild with a narrow login-screen-only slice.
- Preserve existing DOM IDs and app behavior so the current JavaScript and smoke test remain valid.
- Leave the in-room poker interface untouched for a later UI pass.

Work completed:
- Rebuilt the login screen markup in `public/index.html` around a two-column entry shell.
- Added tokenized app shell, form, footer, and planning-card preview styles in `public/css/app.css`.
- Preserved `connection-status`, login form IDs, `login-button`, `login-error`, and the existing poker room markup IDs.
- Adjusted the mobile footer and preview-card layout after screenshot review so the footer does not overlap content and sample cards stay inside the preview stage.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed at desktop `1440x900` and mobile `390x844`.
- Local preview checked at `http://localhost:3001`.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Preview server was started on port `3001` for local review.

## 2026-05-08 - Room UI Foundation

Branch: `feature/room-ui-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `b556038 Add login UI foundation (#5)`
- Working tree: clean before the room UI branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #5 was merged, main CI passed, and `feature/ui-login-foundation` was deleted remotely.

Work planned:
- Continue the UI rebuild with a narrow in-room screen slice.
- Preserve existing DOM IDs and WebSocket behavior covered by the Playwright smoke test.
- Keep the login screen from the previous slice unchanged.

Work completed:
- Rebuilt the in-room poker markup in `public/index.html` with room header, vote panel, participants panel, results panels, and facilitator controls.
- Added room, participant, result, modal, and action button styling in `public/css/app.css`.
- Updated generated voting cards, participant rows, role controls, and grouped result rows in `public/js/app.js` to use app-owned classes.
- Added scroll reset when switching between login and room views so mobile users land at the top of the target screen.
- Reviewed room screenshots at desktop `1440x900` and mobile `390x844` using a temporary access key server.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed for room and revealed-results states.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Preview server remained available on port `3001` for local review.

## 2026-05-08 - Admin UI Foundation

Branch: `feature/admin-ui-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `6c1a421 Add room UI foundation (#6)`
- Working tree: clean before the admin UI branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #6 was merged, main CI passed, and `feature/room-ui-foundation` was deleted remotely.

Work planned:
- Finish the visible UI rebuild by refreshing `/admin`.
- Preserve the existing admin API and key-management behavior.
- Remove the now-unused Tailwind stylesheet dependency after confirming login and room screens use app-owned CSS.
- Refresh stale CSP documentation.

Work completed:
- Rebuilt `public/admin.html` around the shared app visual language.
- Updated generated admin key rows and copy fallback behavior in `public/js/admin.js`.
- Replaced the old admin-specific button/form styling with shared action, field, panel, and token styles in `public/css/app.css`.
- Removed the unused Tailwind stylesheet link from `public/index.html`.
- Deleted `public/css/tailwind.min.css`.
- Updated `README.md` and `docs/scrum-poker-handover.md` so CSP and Tailwind notes match the current code.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed for locked admin, unlocked admin desktop/mobile, and login without Tailwind.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Temporary admin screenshot server used `SCRUM_POKER_ADMIN_KEY` and a temporary keys file only.

## 2026-05-08 - Admin Browser Coverage

Branch: `feature/admin-browser-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c07e312 Add admin UI foundation (#7)`
- Working tree: clean before the browser coverage branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #7 was merged, main CI passed, and `feature/admin-ui-foundation` was deleted remotely.

Work planned:
- Add dedicated browser coverage for the refreshed `/admin` workflow.
- Keep the existing Scrum Poker browser smoke test intact.
- Avoid duplicating temporary server setup across Playwright specs.

Work completed:
- Added `tests/e2e/helpers/test-server.js` for shared temporary server setup with disposable key files and optional admin key configuration.
- Updated `tests/e2e/scrum-poker-smoke.spec.js` to use the shared server helper.
- Added `tests/e2e/admin-key-management.spec.js` covering unauthorized unlock, valid unlock, key listing, key generation, copy action, and key removal.
- Granted Chromium clipboard permissions in the admin spec so the copy path is deterministic.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 2 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Multi-User Browser Coverage

Branch: `feature/multi-user-browser-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c98e858 Add admin browser coverage (#8)`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #8 was merged, main CI passed, and `feature/admin-browser-coverage` was deleted remotely.

Work planned:
- Add browser coverage for multiple users sharing one room.
- Cover facilitator, voter, and observer behavior in the same realtime room.
- Verify reveal/reset synchronization, role changes, logout, and disconnect behavior.

Work completed:
- Added `tests/e2e/multi-user-room.spec.js`.
- The spec starts a temporary server with a disposable access key.
- It logs in Alice as facilitator, Bob as voter, and Carol as observer.
- It verifies participant lists sync across clients.
- It verifies observer vote restrictions.
- It verifies facilitator/voter voting, reveal average `6.5`, grouped results, reset, facilitator role change, logout removal, and disconnect removal.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `npx playwright test tests/e2e/multi-user-room.spec.js`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/multi-user-room.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Client Error Handling Cleanup

Branch: `feature/client-error-cleanup`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `727cee1 Add multi-user browser coverage`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #9 was merged, main CI passed, and `feature/multi-user-browser-coverage` was deleted remotely.

Work planned:
- Keep the next slice small after the browser-coverage merge.
- Improve client-side inline error handling without changing the room workflow.
- Remove stale browser helpers and duplicate WebSocket event logging from `public/js/app.js`.
- Add browser coverage for invalid access-key feedback on the login screen.

Work completed:
- Added shared login and vote error helpers in `public/js/app.js`.
- Preserved connection errors when returning to the login screen instead of hiding them immediately.
- Replaced the disconnected-send alert fallback with inline login feedback.
- Removed unused saved-session reads, hostname logging, duplicate WebSocket event listeners, and unused hidden-field/reload helpers.
- Extended the browser smoke test so it first verifies an invalid access key shows `Invalid access key.` and keeps the user on the login screen.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - HTTP App Extraction

Branch: `feature/http-app-extraction`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `797e05a Clean up client error handling`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #10 was merged, main CI passed, and `feature/client-error-cleanup` was deleted remotely.

Work planned:
- Continue reducing monolith risk with a structural server cleanup.
- Move Express, static file, security header, admin API, and health route setup out of `server.js`.
- Keep WebSocket room behavior and existing route responses unchanged.

Work completed:
- Added `lib/httpApp.js` with `createHttpApp`.
- Moved CSP/security headers, no-cache headers, static file serving, licence routes, admin key routes, admin-key authorization, access-key API error mapping, and `/health` into the HTTP app helper.
- Updated `server.js` to create the HTTP app with `publicDir`, `keysFile`, `adminKey`, and a `getRoomCount` callback.
- Reduced `server.js` from 347 lines to 179 lines while keeping WebSocket setup in place.

Verification:
- `node --check server.js`
- `node --check lib/httpApp.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - WebSocket Server Extraction

Branch: `feature/ws-server-extraction`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `d13426f Extract HTTP app setup`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #11 was merged, main CI passed, and `feature/http-app-extraction` was deleted remotely.

Work planned:
- Continue reducing `server.js` to startup wiring only.
- Move WebSocket server creation, client messaging helpers, participant state, and message dispatch into a focused helper.
- Keep existing realtime room behavior unchanged.

Work completed:
- Added `lib/wsServer.js` with `createWsServer`.
- Moved WebSocket setup, `sendToClient`, `sendToRoom`, `sendRoomState`, participant storage, connection handling, message parsing, dispatch, close cleanup, and error cleanup out of `server.js`.
- Updated `server.js` to call `createWsServer({ server, rooms, keysFile })`.
- Reduced `server.js` from 179 lines to 56 lines.

Verification:
- `node --check server.js`
- `node --check lib/wsServer.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Reset Card Flip Animation

Branch: `feature/reset-card-flip-animation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `25afd37 Extract WebSocket server setup`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #12 was merged, main CI passed, and `feature/ws-server-extraction` was deleted remotely.

Work planned:
- Add the missing first half of the reset animation.
- When votes are reset after reveal, flip the voting deck face-down from right to left first.
- After all cards are face-down, keep the existing left-to-right face-up animation.
- Keep reset behavior and vote state unchanged.

Work completed:
- Added reusable card flip timing helpers in `public/js/app.js`.
- Detect the revealed-to-hidden reset state transition before re-rendering the room UI.
- Delay the reset UI refresh until the existing deck has flipped face-down right-to-left.
- Reuse the existing face-up animation after the reset state renders.
- Disabled the reset button immediately after a facilitator clicks it to prevent repeated reset clicks during the animation.
- Extended the browser smoke test to verify the right-to-left face-down phase and the final face-up state.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Reset Animation Visibility Follow-Up

Branch: `feature/reset-animation-visible`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `f4d42ea Animate reset card flip sequence`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User reported that the reset animation change was not visible after refreshing with F5.

Work planned:
- Make the reset face-down phase visibly start as soon as the facilitator clicks `Reset Votes`.
- Keep the two-phase sequence: right-to-left face-down, then left-to-right face-up.
- Preserve behavior for other connected users.

Work completed:
- Added a local reset animation guard so the facilitator starts the face-down phase before the reset WebSocket message is sent.
- Delayed sending `resetVotes` until the local face-down phase completes.
- Kept non-clicking clients on the state-update-driven face-down animation path.
- Slightly increased the reset stagger and turnaround timing so the right-to-left pass is easier to see.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- Focused reset animation browser test passed.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Client Card Deck Module

Branch: `feature/client-card-deck-module`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `949efec Make reset animation visible immediately`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User confirmed the reset animation fix was working.

Work planned:
- Start reducing the size of `public/js/app.js` with a low-risk browser-side extraction.
- Move voting-card DOM creation and card flip animation timing into a focused helper.
- Keep existing script loading CSP-friendly and avoid changing runtime behavior.

Work completed:
- Added `public/js/cardDeck.js` with a `ScrumPokerCardDeck` browser namespace.
- Moved voting card creation into `createVotingCard`.
- Moved card flip timer management and reset/entry animation sequencing into `createCardAnimator`.
- Updated `public/index.html` to load `cardDeck.js` before `app.js`.
- Updated `public/js/app.js` to call the card deck helper for rendering and animation while preserving existing room state behavior.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- Focused browser smoke test passed.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Invites

Branch: `feature/admin-team-invites`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `1ec3246 Extract client card deck helper`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User asked for an admin/facilitator-oriented way to create teams and keys, then copy details into Teams or another communication app.

Work planned:
- Keep the existing admin-key protected `/admin` flow for this slice.
- Present saved access keys as team access records.
- Add a clipboard action that copies a complete facilitator invite, while preserving raw key copying.
- Update browser coverage for the new admin workflow.

Decision:
- Full signed user roles for admin access remain a future persistence/authentication task.
- The current admin role is still represented by possession of `SCRUM_POKER_ADMIN_KEY`.

Work completed:
- Renamed the admin page around team access and team keys.
- Added facilitator invite generation in `public/js/admin.js`.
- Added `Copy invite` and `Copy key` actions for each team row.
- Updated admin action layout so the extra row action wraps cleanly.
- Updated README and deployment wording for team access and invite management.
- Extended admin browser coverage to verify copied invite text, app URL, facilitator role, and raw key copying.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `node --check tests/ws-operations.test.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Invite Prefill Links

Branch: `feature/invite-prefill-links`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `3160bc7 Add admin team invite copy flow`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add an optional room name to the admin invite workflow.
- Include a prefilled app link in copied facilitator invites.
- Prefill the login screen from invite URL parameters for access key, room, and role.
- Avoid leaving the access key in the browser address bar after prefill.

Work completed:
- Added an optional `Invite room` field to `/admin`.
- Updated copied facilitator invites to include the room when provided and an app URL with `accessKey`, `room`, and `role` parameters.
- Added login prefill handling for invite links, including a legacy `key` parameter alias.
- Removed the invite query string from the address bar after applying prefill.
- Extended admin browser coverage to parse the copied invite URL and verify login prefill behavior.

Verification:
- `node --check public/js/admin.js`
- `node --check public/js/app.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Role Specific Invites

Branch: `feature/role-specific-invites`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `900566d Add invite prefill links`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Let admins choose the role included in copied team invites.
- Keep facilitator as the default role.
- Preserve the existing prefilled login link behavior.

Work completed:
- Added an `Invite role` selector to `/admin` with Facilitator, Voter, and Observer options.
- Updated copied invite links and invite text to use the selected role.
- Renamed the admin invite helper from facilitator-specific wording to team-invite wording.
- Updated admin browser coverage to verify a Voter invite link and login prefill.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Invite Preview

Branch: `feature/admin-invite-preview`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `afa2089 Add role-specific team invites`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Show admins the exact invite text before using `Copy invite`.
- Keep preview generation tied to the same helper as the clipboard action.
- Update previews when invite room or role changes.

Work completed:
- Added an invite preview block to each team key row.
- Rendered preview text from the same `createTeamInvite` helper used by `Copy invite`.
- Re-rendered previews when the invite room or invite role control changes.
- Updated admin browser coverage to confirm the preview updates and exactly matches copied clipboard text.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Copy Invite Link

Branch: `feature/admin-copy-invite-link`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `30755c1 Add admin invite preview`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a direct way to copy only the prefilled invite link.
- Reuse the same invite URL helper used by the full invite preview/message.
- Keep the existing full invite and raw key copy actions.

Work completed:
- Added `Copy link` to each admin team key row.
- Wired `Copy link` to `createInviteUrl`, matching the URL embedded in the full invite text.
- Extended admin browser coverage to verify copied link text equals the invite URL.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Accordion

Branch: `feature/admin-team-accordion`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `d87127d Add admin copy invite link action`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Replace the growing flat admin team-key list with collapsible sections grouped by team name.
- Avoid adding Bootstrap as a new dependency for a single collapse behavior.
- Keep invite preview and copy actions inside each team section.
- Preserve open sections when invite room or role changes re-render the list.

Work completed:
- Converted each admin team row to a native `details`/`summary` collapsible section.
- Added custom app-native styling, plus/minus affordance, and open-panel animation.
- Kept the team name visible in the collapsed header with the selected invite role as metadata.
- Preserved open team sections across invite room and role changes.
- Updated admin browser coverage to open a team section before copying and verify it stays open during invite setting changes.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Search

Branch: `feature/admin-team-search`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `856350d Add admin team accordion`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a search/filter control to `/admin` for growing team lists.
- Filter collapsed team sections by team name.
- Keep visible counts and empty states clear while filtering.

Work completed:
- Added a `Find team` search field above the team list.
- Filtered rendered team sections by case-insensitive team-name matching.
- Updated the team count to show filtered count and total count when search is active.
- Added a no-match empty state.
- Extended admin browser coverage for matching search, no-match search, and clearing the search.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Accordion Controls

Branch: `feature/admin-accordion-controls`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `7743c39 Add admin team search`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add bulk controls for the admin team accordion.
- Keep controls scoped to the currently shown, filtered team sections.
- Preserve manually opened sections across search and invite option re-renders.

Work completed:
- Added `Expand shown` and `Collapse shown` buttons above the team list.
- Wired the controls to only affect currently rendered team sections.
- Promoted open-section tracking to explicit state so open teams survive filtering and no-match search states.
- Cleaned removed teams out of the open-section state.
- Extended admin browser coverage for expand all, collapse all, filtered expand, and open-state preservation.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Key Lifecycle

Branch: `feature/admin-key-lifecycle`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `07a5f47 Add admin accordion controls`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a reversible admin action for deactivating a team key without deleting it.
- Preserve compatibility with existing `keys.json` files that store team names as plain string values.
- Reject suspended keys during WebSocket login while keeping them visible in the admin list.
- Keep copy/share actions unavailable for suspended teams until restored.

Work completed:
- Extended key storage to read legacy string entries and metadata entries with an `active` flag.
- Added `PATCH /api/admin/keys/:name` for suspend/restore status changes.
- Updated `/admin` team sections with active/suspended status badges, suspend/restore controls, and disabled copy actions for suspended keys.
- Kept suspended keys in the admin list and included suspended counts when relevant.
- Updated the command-line list output to show each key status.
- Fixed accordion open-state tracking so manually closed rows stay closed after re-renders.
- Added unit/API/browser coverage for suspended key storage, admin status updates, rejected suspended logins, and admin suspend/restore UI.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `node --test tests/access-keys.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused key-storage and API tests passed.
- Focused admin browser test passed.
- `npm test` ran 42 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Activity Log

Branch: `feature/admin-activity-log`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `264c7ad Add admin key lifecycle controls`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add an append-only admin audit trail for team key lifecycle actions.
- Avoid storing or displaying full access keys in the audit trail.
- Show recent activity in `/admin` after unlock.
- Keep activity storage configurable for production.

Work completed:
- Added `lib/adminActivity.js` for JSONL activity logging, key fingerprints, and recent activity reads.
- Added `SCRUM_POKER_ACTIVITY_FILE` support with a default `admin-activity.jsonl` path.
- Logged admin API actions for key creation, suspension, restoration, and removal.
- Added authenticated `GET /api/admin/activity` for recent activity.
- Added a Recent activity panel in `/admin`, including event counts, action badges, timestamps, team names, and short key fingerprints.
- Updated `.gitignore` and README production notes for the activity file.
- Extended isolated test server setup to use temporary activity log files.
- Added unit/API/browser coverage for activity logging, display, newest-first ordering, and secret avoidance.

Verification:
- `node --check lib/adminActivity.js`
- `node --check lib/httpApp.js`
- `node --check server.js`
- `node --check public/js/admin.js`
- `node --check tests/admin-activity.test.js`
- `node --check tests/ws-operations.test.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `node --test tests/admin-activity.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin activity and API tests passed.
- Focused admin browser test passed.
- `npm test` ran 47 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - IONOS Production Deployment

Branch: `main` on the IONOS production checkout, documentation recorded from `chore/log-production-deployment`

Starting state:
- Production host: IONOS server reachable with `ssh scrum-poker.uk`
- Production path: `/var/www/scrumpoker`
- Existing app checkout: old Bitbucket `master` branch with `origin` pointing at `git@bitbucket-scrumpoker-prod:epicnerd/scrum-poker.git`
- New production domain: `sprintpoker.uk`
- Existing service: `scrumpoker.service`
- Existing reverse proxy: Apache with `scrum-poker.uk` TLS vhosts

Work completed:
- Backed up the old production app directory to `/var/www/scrumpoker-backup-20260508-135250.tar.gz`.
- Switched the production checkout to GitHub:
  - Renamed old `origin` remote to `bitbucket`.
  - Added `origin` as `git@github.com:davidmjackson/scrumpoker.git`.
  - Fetched and switched production to `origin/main` at `b1f167b Add admin activity log`.
- Installed production dependencies with `npm ci --omit=dev`.
- Updated `scrumpoker.service` to set:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `SCRUM_POKER_ADMIN_KEY`
  - `SCRUM_POKER_KEYS_FILE=/var/www/scrumpoker/keys.json`
  - `SCRUM_POKER_ACTIVITY_FILE=/var/www/scrumpoker/admin-activity.jsonl`
- Restarted `scrumpoker.service`.
- Removed a stale extra `node server.js` process so only the systemd-managed Node process remained.
- Added Apache vhost config for `sprintpoker.uk` and `www.sprintpoker.uk`.
- Used Certbot to issue and deploy the `sprintpoker.uk` and `www.sprintpoker.uk` certificate.
- Confirmed Certbot added HTTP-to-HTTPS redirects.
- Removed the old local shell alias/banner setup from the IONOS user's `.bashrc`.
- Removed old untracked `/var/www/scrumpoker/README.txt` from production.

Verification:
- `curl -fsS http://127.0.0.1:3000/health`
- `curl -fsS -H 'Host: sprintpoker.uk' http://127.0.0.1/health`
- `curl -fsSI http://sprintpoker.uk/`
- `curl -fsS https://sprintpoker.uk/health`
- `curl -fsS https://sprintpoker.uk/admin | grep -E 'Team access|Recent activity|Team keys'`
- `curl -fsS https://sprintpoker.uk/ | grep -E 'Scrum Poker|Sprint|access-key-input|voting-deck' | head`
- Node WebSocket smoke test against `wss://sprintpoker.uk/ws`
- `systemctl is-active scrumpoker.service apache2`

Result:
- `https://sprintpoker.uk` is live.
- `http://sprintpoker.uk` redirects to HTTPS.
- `https://sprintpoker.uk/health` returned healthy with `rooms: 0`.
- `/admin` serves the new admin UI with team keys and recent activity.
- `wss://sprintpoker.uk/ws` opened successfully.
- `scrumpoker.service` and `apache2` were active.
- Production checkout reported `## main...origin/main`.

Notes:
- The production admin key was set in the systemd service during deployment. Treat it as a secret and rotate it if it has been shared beyond the deployment session.
- The old alias banner may continue to show in already-open shells because `.bashrc` was loaded before cleanup. It should be gone in new SSH sessions.

## 2026-05-08 - Admin Key Rotation

Branch: `feature/admin-key-rotation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `0e0c9b9 Log IONOS production deployment`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add a reversible admin operation to rotate a team key without deleting the team.
- Preserve the team's active or suspended status after rotation.
- Invalidate old invite links by replacing the stored key value.
- Log key rotations in the admin activity trail without exposing full keys.

Work completed:
- Added `rotateAccessKey` to replace one team key while preserving team name and status.
- Added `POST /api/admin/keys/:name/rotate`.
- Logged `rotated` admin activity events with short key fingerprints only.
- Added a `Rotate key` action to each admin team section with a confirmation prompt.
- Updated admin activity labels and badge styling for rotated events.
- Extended unit, API, activity, and browser coverage for key rotation.

Verification:
- `node --check lib/accessKeys.js`
- `node --check lib/adminActivity.js`
- `node --check lib/httpApp.js`
- `node --check public/js/admin.js`
- `node --check tests/access-keys.test.js`
- `node --check tests/admin-activity.test.js`
- `node --check tests/ws-operations.test.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `node --test tests/access-keys.test.js`
- `node --test tests/admin-activity.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused key-storage, activity, API, and admin browser tests passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Rotate Key Modal

Branch: `feature/admin-rotate-modal`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `6f3c637 Add admin key rotation`
- Working tree: clean before branch changes
- Server status: local `node server.js` process was running on PID `209446`

Work planned:
- Replace the native browser confirmation for key rotation with an app-styled admin warning modal.
- Keep the warning clear that rotating a team key invalidates existing invite links.
- Preserve the existing rotate-key API behavior and admin activity logging.

Work completed:
- Added a `rotate-key-modal` confirmation dialog to the admin page.
- Updated the `Rotate key` action to open the modal with team-specific copy.
- Added Cancel, backdrop click, and Escape dismissal support.
- Added warning modal styling that matches the app's existing modal patterns.
- Updated the admin browser test to verify cancel and confirm flows through the modal.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Equal Entry Panel Heights

Branch: `feature/equal-entry-panel-heights`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `bbc0ea2 Restore room after admin navigation`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running before verification

Work planned:
- Make the desktop login panel and card preview panel visually match heights.
- Preserve natural stacked heights on mobile.
- Add browser coverage so the desktop panel alignment does not regress.

Work completed:
- Added a desktop-only entry layout rule that stretches the two entry panels to the tallest content while centering the grid row in the viewport.
- Left the existing mobile stacked layout unchanged under `820px`.
- Added a smoke e2e assertion that the desktop login and preview panels have matching heights.

Verification:
- Measured panel heights with Playwright:
  - Desktop `1280x800`: login `571.609375`, preview `571.609375`
  - Mobile `390x844`: panels remain independently sized
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke browser test passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Estimation Rounds And History

Branch: `feature/estimation-rounds-history`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `ad5a5ad Equalize entry panel heights`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add a facilitator-controlled current estimate item to the room.
- Keep the current item synchronized for voters, observers, and facilitators.
- Save revealed rounds into in-memory room history so teams can review and copy the result.
- Preserve the existing reveal/reset/card animation behavior.

Work completed:
- Added `currentItem` and capped `roundHistory` state to each in-memory room.
- Added a `setRoundItem` WebSocket message that only facilitators can use.
- Locked current item edits while votes are revealed so history labels stay consistent.
- Snapshotted revealed rounds with title, reveal time, numeric average, vote count, votes, and grouped vote spread.
- Added a current item panel to the room UI.
- Added a revealed rounds history panel with a `Copy summary` action for each round.
- Kept history room-local and in-memory; if the final participant leaves a room, that room and its round history are removed with the existing lifecycle.
- Bumped the app script query to `js/app.js?v=4`.

Verification:
- `node --check lib/roomState.js`
- `node --check lib/wsHandlers.js`
- `node --check lib/wsServer.js`
- `node --check public/js/app.js`
- `node --check tests/room-state.test.js`
- `node --check tests/ws-handlers.test.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- `npm test` ran 51 tests successfully.
- Focused smoke and multi-user browser tests passed.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Return To Room From Admin

Branch: `feature/return-to-room-from-admin`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `053454a Add facilitator admin link`
- Working tree: clean before branch changes
- Server status: local `node server.js` process was running on PID `209446`

Work planned:
- Make the Admin page's room navigation match the text-link style used in the room action bar.
- Allow facilitators to return from `/admin` to the active room instead of landing on an empty login screen.
- Keep return-to-room behavior scoped to users who navigated to Admin from the room page.

Work completed:
- Changed the Admin page `Room app` control from a button-styled link to the shared `text-action` link style.
- Persisted the current room login context in tab-scoped `sessionStorage` after successful room joins.
- Marked room-to-admin navigation so returning to `/` auto-rejoins the saved room only for that flow.
- Cleared saved room context on explicit logout or invalid stored restore attempts.
- Extended the smoke e2e test to cover Room -> Admin -> Room navigation and the Admin page link style.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke browser test passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Facilitator Admin Link

Branch: `feature/facilitator-admin-link`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `f47b56d Add admin modal loading state`
- Working tree: clean before branch changes
- Server status: local `node server.js` process was running on PID `209446`

Work planned:
- Add an in-app route to the admin page from the room experience.
- Show admin navigation only to users whose live role is `Facilitator`.
- Keep `/admin` protected by the existing admin key unlock.

Work completed:
- Added an `Admin` link to the room action bar.
- Hid the Admin link by default and only showed it when `currentUser.role === 'Facilitator'`.
- Kept the link hidden for Voters and Observers.
- Added e2e coverage for facilitator visibility and voter/observer hidden states.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused facilitator and multi-user browser tests passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Modal Loading State

Branch: `feature/admin-modal-loading-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `ea8ab7c Add admin action modals`
- Working tree: clean before branch changes
- Server status: local `node server.js` process was running on PID `209446`

Work planned:
- Make admin action modals visibly show work in progress after confirmation.
- Prevent repeated action submissions while rotate, suspend, or remove requests are running.
- Preserve existing modal cancel and confirmation behavior.

Work completed:
- Added reusable busy-state handling to the admin action modal.
- Added `aria-busy` and an `is-busy` class while a modal action is running.
- Disabled Cancel and the confirm button during in-flight requests.
- Added action-specific button labels: `Rotating...`, `Suspending...`, and `Removing...`.
- Added browser coverage that pauses a rotate request and asserts the visible busy state.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Action Confirmation Modals

Branch: `feature/admin-action-modals`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `e3d15dc Add admin rotate key modal`
- Working tree: clean before branch changes
- Server status: local `node server.js` process was running on PID `209446`

Work planned:
- Replace the remaining native browser confirmations for admin team key actions.
- Reuse the styled admin warning modal for rotate, suspend, and remove actions.
- Keep restore as a direct safe action.

Work completed:
- Refactored the rotate confirmation dialog into a reusable `key-action-modal`.
- Added styled modal flows for suspending and removing team keys.
- Removed native `window.confirm` usage from the admin key controls.
- Extended admin browser coverage for cancel and confirm paths on rotate, suspend, and remove.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `find . -path ./node_modules -prune -o -name '*.js' -print | xargs -r -n1 node --check`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 48 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-09 - Round History Copy Coverage

Branch: `feature/round-history-copy-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `59d080b Add estimation rounds and history`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add browser coverage for the revealed round history `Copy summary` workflow.
- Verify the copied clipboard text matches the summary teams can paste elsewhere.
- Keep the change test-only unless the workflow exposes an implementation bug.

Work completed:
- Extended the Scrum Poker smoke test to grant clipboard permissions.
- Verified the round history copy button changes to `Copied`.
- Verified the clipboard payload includes the item title, average, vote count, and grouped spread.

Verification:
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke browser test passed.
- `npm test` ran 51 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Start Next Item Workflow

Branch: `feature/start-next-item-workflow`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `6e84921 Cover round history copy workflow (#35)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- PR #35 was marked ready, CI passed, and it was merged into `main` before this branch.

Work planned:
- Add a facilitator-controlled way to move from a revealed estimate into the next item.
- Reset votes and clear the current item while preserving revealed round history.
- Focus the item field so the facilitator can immediately enter the next estimate target.

Work completed:
- Added a `startNextItem` WebSocket message handled server-side for facilitators only.
- Preserved the existing `resetVotes` behavior while sharing vote-reset logic.
- Added a `Start Next Item` facilitator button that appears after votes are revealed.
- Cleared the current item, hid revealed results, reset votes, retained history, and focused the item input after starting the next item.
- Bumped the app script query to `js/app.js?v=5`.
- Added handler, WebSocket workflow, and browser coverage for the new flow.

Verification:
- `node --check lib/wsHandlers.js`
- `node --check lib/wsServer.js`
- `node --check public/js/app.js`
- `node --check tests/ws-handlers.test.js`
- `node --check tests/ws-operations.test.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `git diff --check`
- `node --test tests/ws-handlers.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused handler, WebSocket, and smoke browser tests passed.
- `npm test` ran 52 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Start Next Item Production Verification

Branch: `main`

Production context:
- Production was first observed at `6e84921 Cover round history copy workflow (#35)`, which served `js/app.js?v=4`.
- PR #36 was marked ready, merged into `main`, and produced `e2a0eac Add start next item workflow (#36)`.
- Production then pulled `origin/main` and services were bounced.

Verified:
- `https://sprintpoker.uk/health` returned `{"status":"ok","rooms":0}`.
- The public root page served `js/app.js?v=5`.
- The public root page contained `start-next-item-button` and `Start Next Item`.
- `wss://sprintpoker.uk/ws` opened and returned a `yourId` message.

Result:
- The Start Next Item workflow is live on production.

## 2026-05-09 - Start Next Item Multi-User Coverage

Branch: `feature/start-next-item-multi-user-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `e2a0eac Add start next item workflow (#36)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add browser coverage proving Start Next Item synchronizes across facilitator, voter, and observer clients.
- Keep the change test-only unless the workflow exposes a product bug.

Work completed:
- Extended the multi-user room Playwright test to reveal a round, use Start Next Item, and assert all connected clients see:
  - hidden revealed results
  - cleared current item
  - open round status
  - preserved round history
  - cleared selected vote cards
- Verified the facilitator's next item input is cleared and focused.
- Added a second estimate after Start Next Item so reset and role-change coverage still exercise a revealed round.

Verification:
- `node --check tests/e2e/multi-user-room.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused multi-user browser test passed.
- `npm test` ran 52 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Copy All Round History

Branch: `feature/copy-all-round-history`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `f9f6a7a Cover start next item multi-user sync (#37)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add a facilitator-visible control to copy the full revealed round history.
- Keep individual round copy behavior unchanged.
- Copy full session history in chronological order so it is useful in planning notes.

Work completed:
- Added a `Copy all` action to the Revealed rounds panel for facilitators.
- Added a full-session clipboard summary with round count, item titles, averages, vote counts, and grouped spreads.
- Kept voters and observers from seeing the facilitator-only copy-all control.
- Bumped the app script query to `js/app.js?v=6`.
- Extended smoke and multi-user browser coverage for copy-all behavior and visibility.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke and multi-user browser tests passed.
- `npm test` ran 52 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Health Build Info

Branch: `feature/health-build-info`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `f4780dd Add copy all round history (#38)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add version and deployed commit metadata to `/health`.
- Make deploy verification possible from the health endpoint instead of inspecting served HTML.

Work completed:
- Added `lib/buildInfo.js` to resolve package version and git commit.
- Added `SCRUM_POKER_VERSION`, `SCRUM_POKER_COMMIT`, and `GITHUB_SHA` runtime overrides.
- Updated `/health` to include `version` and `commit` alongside status, uptime, and rooms.
- Documented the enhanced health check in `README.md`.
- Added unit coverage for build-info helpers and integration coverage for the health payload.

Verification:
- `node --check lib/buildInfo.js`
- `node --check lib/httpApp.js`
- `node --check server.js`
- `node --check tests/build-info.test.js`
- `node --check tests/ws-operations.test.js`
- `node --test tests/build-info.test.js`
- `node --test tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused build-info and health integration tests passed.
- `npm test` ran 55 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Room Invite Links

Branch: `feature/room-invite-links`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `5462a37 Add build info to health endpoint (#39)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add facilitator-only invite links directly inside the planning room.
- Let facilitators copy voter and observer invite URLs without visiting `/admin`.
- Verify copied invite URLs prefill access key, room, and role.

Work completed:
- Added `Copy voter invite` and `Copy observer invite` room actions for facilitators.
- Reused the existing invite URL prefill format with `accessKey`, `room`, and `role` query parameters.
- Added visible copied feedback for each invite action.
- Kept room invite actions hidden for voters and observers.
- Bumped the app script query to `js/app.js?v=7`.
- Extended smoke and multi-user browser coverage for invite visibility, copied URL content, and invite prefill.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke and multi-user browser tests passed.
- `npm test` ran 55 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - End Room Session

Branch: `feature/end-room-session`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `e3ea05f Add room invite links (#40)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running

Work planned:
- Add a facilitator-only way to end the active room session.
- Clear the server-side room and participant state for that room.
- Return every connected participant to the login screen with a clear message.

Work completed:
- Added an `endSession` WebSocket action restricted to facilitators.
- Broadcast `sessionEnded` to all room participants before deleting the room and its participants.
- Added a facilitator-only `End session` room action with a confirmation modal.
- Updated the client to clear local room/session state and return to login without sending an extra logout.
- Bumped the app script query to `js/app.js?v=8`.
- Added unit, WebSocket integration, and multi-user browser coverage for ending a room session.

Verification:
- `node --check lib/wsHandlers.js`
- `node --check lib/wsServer.js`
- `node --check public/js/app.js`
- `node --check tests/ws-handlers.test.js`
- `node --check tests/ws-operations.test.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `node --test tests/ws-handlers.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused handler, WebSocket integration, and multi-user browser tests passed.
- `npm test` ran 57 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Auto Rejoin On Reconnect

Branch: `feature/auto-rejoin-on-reconnect`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `ac20b2f Add facilitator end session flow (#41)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `ac20b2fae310` with `/health` ok and `js/app.js?v=8`.

Work planned:
- Make reconnect behavior deliberate for transient WebSocket drops.
- Automatically rejoin an active room once after reconnect.
- Keep explicit Logout and End session as terminal exits that do not auto-rejoin.

Work completed:
- Added a `scrumPokerReconnectToRoom` session flag that is set only when an active room socket closes.
- Reused the stored room session to send one automatic login after the next WebSocket connection opens.
- Cleared reconnect intent on explicit room/session exits and on failed stored reconnect attempts.
- Kept admin return-to-room behavior on the existing stored-session path.
- Bumped the app script query to `js/app.js?v=9`.
- Added browser coverage for a voter socket close, successful auto-rejoin, and no auto-rejoin after Logout.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused multi-user browser test passed with 2 tests.
- `npm test` ran 57 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Hide Current Item Panel

Branch: `feature/hide-current-item-panel`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `6eefc45 Add automatic room rejoin on reconnect (#42)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `6eefc454b472` with `/health` ok and `js/app.js?v=9`.

Decision:
- The current item / ticket field is not needed because the app is used alongside Jira.
- Keep server-side current-item support for compatibility, but remove the visible Jira-ticket-style room panel from the browser UI.

Work completed:
- Removed the visible Estimate target panel, item input, and current item display from the Poker Room.
- Moved the Open/Revealed round status into the voting panel header.
- Removed the item line from revealed results.
- Updated round history and copied summaries to use generic `Round 1`, `Round 2`, etc. when no item title is present.
- Removed unused current-item client code and CSS.
- Bumped the app script query to `js/app.js?v=10`.
- Updated smoke and multi-user browser coverage for the simplified room UI.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke and multi-user browser tests passed.
- `npm test` ran 57 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Remove Room History Section

Branch: `feature/remove-room-history-section`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `1cd6c6b Hide current item panel (#43)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `1cd6c6b64705` with `/health` ok and `js/app.js?v=10`.

Decision:
- The Poker Room should stay lightweight and not show past-round history.
- Keep Grouped Results because it is useful during the active reveal.
- Leave server-side round history behavior in place for compatibility, but remove browser rendering and copy controls.

Work completed:
- Removed the Revealed rounds / History section from the Poker Room.
- Removed individual and copy-all history browser code.
- Removed history-specific CSS.
- Kept Vote Results and Grouped Results behavior unchanged.
- Bumped the app script query to `js/app.js?v=11`.
- Updated smoke and multi-user browser coverage to assert history controls are absent while grouped results remain visible.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke and multi-user browser tests passed.
- `npm test` ran 57 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Rename Next Round Action

Branch: `feature/rename-next-round-action`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `63a7289 Remove room history section (#44)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `63a7289f056e` with `/health` ok and `js/app.js?v=11`.

Decision:
- Keep the facilitator control because it resets the room for the next Jira ticket discussion.
- Rename the visible wording away from "item" because the app no longer tracks tickets/items directly.

Work completed:
- Renamed the facilitator-only `Start Next Item` button to `Next Round`.
- Updated server-side facilitator/reveal prerequisite messages to say `next round`.
- Bumped the app script query to `js/app.js?v=12`.
- Updated focused handler and browser assertions for the new wording.
- Kept the existing internal `startNextItem` message name unchanged to avoid unnecessary protocol churn.

Verification:
- `node --check lib/wsHandlers.js`
- `node --check public/js/app.js`
- `node --check tests/ws-handlers.test.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `node --test tests/ws-handlers.test.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npx playwright test tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused handler, smoke, and multi-user browser tests passed.
- `npm test` ran 57 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Remove Item And History Plumbing

Branch: `feature/remove-room-item-history-plumbing`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `a135969 Rename next round action (#45)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `a1359697ccb0` with `/health` ok and `js/app.js?v=12`.

Decision:
- The app is used alongside Jira, so the backend should not keep current-item state or in-memory round history.
- Keep the active-room workflow lightweight: vote, reveal, review grouped results, then move to the next round.
- Keep `startNextItem` only as a temporary compatibility alias for already-open browser tabs from the previous release.

Work completed:
- Removed `currentItem`, `roundHistory`, round-history snapshots, and current-item helpers from room state.
- Removed the `setRoundItem` WebSocket handler and its server switch case.
- Renamed the current client/server next-round action path to `startNextRound`.
- Renamed the DOM control id to `start-next-round-button`.
- Kept `Next Round` behavior as a facilitator-only reset from revealed results into an open voting round.
- Bumped the app script query to `js/app.js?v=13`.
- Updated unit, WebSocket integration, and browser tests for the simpler room state.

Verification:
- `node --check lib/roomState.js`
- `node --check lib/wsHandlers.js`
- `node --check lib/wsServer.js`
- `node --check public/js/app.js`
- `node --check tests/room-state.test.js`
- `node --check tests/ws-handlers.test.js`
- `node --check tests/ws-operations.test.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `node --test tests/room-state.test.js`
- `node --test tests/ws-handlers.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused room-state, handler, WebSocket integration, smoke, and multi-user browser tests passed.
- `npm test` ran 54 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Production Smoke And Alias Cleanup

Branch: `feature/remove-next-item-alias`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `16025bf Remove room item history plumbing (#46)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `16025bfabb18` with `/health` ok and `js/app.js?v=13`.

Production smoke verification:
- A facilitator and voter joined the same production room.
- Both users voted.
- `Show Votes` revealed the expected `6.5` average and grouped results.
- `Next Round` cleared results and selected cards for both users while keeping the room active.

Work completed:
- Removed the temporary `startNextItem` WebSocket compatibility alias.
- Added WebSocket integration coverage that stale `startNextItem` messages now return `Unknown type: startNextItem`.
- Kept `startNextRound` as the only supported next-round command.

Verification:
- `node --check lib/wsServer.js`
- `node --check tests/ws-operations.test.js`
- `node --test tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused WebSocket integration coverage passed.
- `npm test` ran 54 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-05-09 - Condensed Deployment Runbook

Branch: `feature/condense-deployment-runbook`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `d144f39 Remove next item websocket alias (#47)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production had been verified at commit `d144f3940674` with `/health` ok and `js/app.js?v=13`.

Decision:
- Keep future production instructions concise by grouping safe commands.
- Keep service restart/status and health/frontend verification as clear checkpoints.
- Add `printf '\n'` after curl health output so the shell prompt stays on a new line.

Work completed:
- Updated `docs/deployment.md` to use a condensed normal deployment command.
- Added grouped systemd restart/status guidance.
- Added public verification for `/health` and `js/app.js` with newline-safe curl output.
- Updated the expected health response shape to include `version` and `commit`.

Verification:
- `git diff --check`

Result:
- Documentation whitespace check passed.
- No project `node server.js` process was left running.

## 2026-05-09 - Compact Facilitator Toolbar

Branch: `feature/compact-facilitator-toolbar`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `95f7c49 Condense deployment runbook (#48)`
- Working tree: clean before branch changes
- Server status: no local `node server.js` process was running
- Production checkout had been verified at commit `95f7c491ce1c`.

Decision:
- The facilitator header actions were too long and visually noisy.
- Keep the main room toolbar short with `Invite`, `End`, `Role`, and `Logout`.
- Move admin access out of the room action row and label it as `Team access`.
- Keep invite copy actions available behind the compact `Invite` menu.

Work completed:
- Moved the admin link beside the room name and renamed it to `Team access`.
- Replaced the long facilitator action row with compact toolbar buttons.
- Added an invite dropdown with `Copy voter invite` and `Copy observer invite`.
- Added outside-click and Escape handling for the invite dropdown.
- Bumped the app script query to `js/app.js?v=14`.
- Updated smoke and multi-user browser coverage for the compact toolbar and invite menu.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `node --check tests/e2e/multi-user-room.spec.js`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js tests/e2e/multi-user-room.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused smoke and multi-user browser tests passed.
- `npm test` ran 54 tests successfully.
- `npm run test:e2e` passed with 4 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- No project `node server.js` process was left running.

## 2026-10-24 - Room Layout: Independent Columns

Branch: `feat/room-layout`. Spec: `docs/room-layout-handover.md`.

Problem: `.room-grid` used implicit rows, so a growing participants list stretched row 1 and pushed results, grouped results and the facilitator buttons down, leaving a gap under the deck.

Change (front end only):
- `public/index.html`: new `.room-main` wrapper holds the vote panel, `#facilitator-controls` (moved inside the grid), vote summary and grouped results. `.participants-panel` follows it. Ids, classes and aria attributes unchanged. `poker.css` link cache-busted with `?v=2`.
- `public/css/poker.css`: `.room-main` flex column; removed the `grid-column` rules for result and grouped cards (desktop and the 820px override) and the controls' `margin-top`.

Verification:
- `npm test`: 144 passed. `npx playwright test`: 9 passed.
- Browser measurement (1280px, facilitator): every left-column box identical at 2 and 13 participants; participants panel 284px → 1366px tall. Grouped results width equals vote panel (734px). At 600px the order is vote, buttons, results, grouped, participants. No console errors.

Stage review (TagTeam, `docs/debates/2026-10-24-code-review-and-security-audit-room-layout-rework.md`):
- ChatGPT found `public/join.html` (anonymous guest view) has its own `.room-grid`; removing the `grid-column` rules put grouped results in the participants column there. Fixed with the same `.room-main` wrapper (no facilitator controls on that page).
- Added `tests/e2e/helpers/layout.js` (`expectResultsInVoteColumn`), asserted after reveal in the smoke and anonymous-join specs. Confirmed it fails against the unfixed `join.html` (grouped results at x=800 vs 50).
- Logged, not fixed: the assertion pins column placement, not vertical independence from participant count. A cheap future check is to enlarge the participants panel and compare left-column y positions.
- `npm test` 144 passed; `npx playwright test` 9 passed.
