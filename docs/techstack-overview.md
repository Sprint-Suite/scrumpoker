# Technical Stack Overview — Scrum Poker & Retrospective

> **Purpose:** Reference document for architecture planning. Describes the
> current technology, structure, data model, security posture, and deployment
> of the two existing apps so future app decisions can build on a known
> baseline (and reuse what already works).
>
> **As of:** 2026-09-14. Both apps live on the same host under `/var/www/`,
> alongside `signal`, `raid` and the `suite` hub.

---

## 1. Executive Summary

Two small, self-contained real-time collaboration web apps for agile ceremonies:

| | **Scrum Poker** | **Retrospective** |
|---|---|---|
| Purpose | Planning-poker estimation rooms | Start/Stop/Continue retro boards + action tracking |
| Path | `/var/www/scrumpoker` | `/var/www/retrospective` |
| Port | 3000 | 3001 |
| Domain | `scrum-poker.uk` | (placeholder `retro.example.com`) |
| Runtime | Node.js + Express 5 + `ws` | Node.js + Express 4 + `ws` |
| Persistence | **None** — fully in-memory | **SQLite** (`better-sqlite3`) |
| Auth model | Suite session cookie, verified via `@suite/auth-client` | Suite session cookie, verified via `@suite/auth-client` |
| Frontend | Vanilla HTML/CSS/JS, no build step | Vanilla HTML/CSS/JS, no build step |
| Code shape | Modular (`lib/` + thin `server.js`) | `server.js` (~1.2k lines) + a growing `lib/` |
| CI | GitHub Actions | GitHub Actions |

Both share a deliberate philosophy: **minimal dependencies, no front-end
framework, no build/transpile step, no client-side bundler.** All browser code
is plain ES served as static files under a strict Content-Security-Policy that
forbids inline scripts and `eval`. Both sit behind Apache (TLS termination) and
run as `systemd` services.

They are **no longer independent codebases.** Both — along with `signal` and
`raid` — depend on `@suite/auth-client`, pinned as `file:../suite/shared/auth-client`
and resolved by relative path from the parent directory. Authentication is now
the suite hub's job, not each app's.

That coupling is the single most important thing to know before changing either
app: the shared package is *linked*, not installed, so its own dependencies live
in the sibling checkout and one `npm ci` there changes what all four apps load.
None of them pick it up until restarted.

---

## 2. Scrum Poker — Detailed

### 2.1 Runtime & Dependencies

- **Node.js** (CI targets Node 24; host currently runs v20.19.6).
- **Production dependencies** (`package.json`):
  - `@suite/auth-client` — `file:../suite/shared/auth-client`; session verification.
  - `express` `^5.1.0` — HTTP server, static files, JSON body parsing.
  - `ws` `^8.18.2` — WebSocket server.
  - `uuid` `^11.1.0` — per-connection user IDs (`uuidv4`).
  - `pino` / `pino-http` — structured logging.
  - `zod` — message and request validation.
- **Dev dependencies:** `@playwright/test`, `pino-pretty`, `supertest`.
- **No ORM, no database driver, no front-end framework, no bundler.**
- Package name in manifest is still the generic `websocket-server`.

### 2.2 Process & Module Layout

`server.js` is a thin composition root (~60 lines). Real logic lives in `lib/`:

| Module | Responsibility |
|---|---|
| `lib/httpApp.js` | Builds the Express app: security headers, no-cache headers, static serving, admin REST API, `/health`. |
| `lib/wsServer.js` | Creates the `ws` server on path `/ws`, routes inbound messages, manages the `participants` registry, wires rate limiting. |
| `lib/wsHandlers.js` | Per-message-type business logic (login, vote, reveal, reset, end, next round, change role, exit). |
| `lib/roomState.js` | Room lifecycle: create/join/leave/touch, facilitator (re)assignment, idle expiry, room-state snapshots. |
| `lib/roles.js` | Role constants (`Voter`, `Observer`, `Facilitator`) and permission predicates. |
| `lib/upgradeAuth.js` | Decides whether a WebSocket upgrade is allowed, from the auth-client's `verifySession` + the raw Cookie header. |
| `lib/validate.js` | zod-backed validation for WS messages and HTTP payloads. |
| `lib/logger.js` | pino logger construction and redaction rules. |
| `lib/contrast.js` | Colour-contrast helpers backing the theme tests. |
| `lib/buildInfo.js` | Resolves version (from `package.json`) and commit (`SCRUM_POKER_COMMIT` / `GITHUB_SHA`, else `git rev-parse HEAD`). |

This separation makes the unit-test surface clean — each `lib/` module has a
matching `tests/*.test.js`.

### 2.3 Data Model & State

**Entirely in-memory. Nothing survives a process restart.** With the access-key
files gone, the app holds no state of its own on disk; sessions live in the
hub-written SQLite file it only reads.

- `rooms` — `Map<roomName, { users: Set<userId>, lastActive, votesRevealed, facilitatorIds }>`.
- `participants` — object keyed by `userId` holding the live `ws` socket, role, name, vote, room.
- Rooms idle for **60 minutes** are swept every minute (`expireRooms`).
- Card deck (fixed): `['0','1','2','3','5','8','13','?']`.
- Roles: **Voter** (can vote), **Observer** (cannot), **Facilitator** (can vote + reveal/reset/manage). First user into a room becomes facilitator. A facilitator can add one co-facilitator (at most two, company members only, equal powers); members cannot promote themselves. When the last facilitator leaves or steps down, the role passes to another company member.

### 2.4 WebSocket Protocol

- Server endpoint: `/ws`. `maxPayload: 64 KB`, `perMessageDeflate: false`.
- Limits (`lib/wsLimits.js`): a slot is reserved per upgrade before auth runs,
  40 concurrent per client IP and 400 in total, plus 60 admitted upgrades per IP
  per sliding 10 s. Refusals are HTTP 429/503. Each socket's messages are
  token-bucketed (20 burst, 5/s); a socket over that is closed with 1008 and
  never read again. The client IP is the rightmost `X-Forwarded-For` entry,
  trusted only from a loopback peer (Apache).
- On connect the server issues `{ type: 'yourId', payload: { id } }`.
- **Client → server message types:** `login`, `vote`, `revealVotes`,
  `resetVotes`, `endSession`, `startNextRound`, `changeRole`, `logout`.
- Server broadcasts room-state snapshots to all room members on every change;
  any broadcast also "touches" the room so live sessions are never expired.
- Invalid JSON / unknown type → `{ type: 'error', ... }`.

### 2.5 Authentication & Authorization

- **Suite session cookies.** A `poker_session` cookie is verified through
  `@suite/auth-client`'s `verifySession`; the session must also be `entitled`.
  Unauthenticated visitors are bounced to the hub dashboard.
- WebSocket upgrades are gated by the same check (`lib/upgradeAuth.js`), so an
  unauthenticated upgrade is rejected with **401** rather than being accepted
  and policed later.
- Anonymous players can join a room through a **share link** carrying a token,
  without a suite session, and cannot facilitate.
- Sessions are stored in a local SQLite file, written by the hub and read by
  each app (`APP_SESSIONS_DB`).
- **The access-key model is gone.** `keys.json`, `lib/accessKeys.js`,
  `manageKeys.js`, `lib/loginRateLimiter.js`, `lib/adminActivity.js` and the
  entire `/admin` surface were removed; `/admin` now returns **404**, which a
  test pins.

### 2.6 Security Posture

- Strict **Content-Security-Policy**: `default-src 'self'`, `script-src 'self'`
  (no inline, no `eval`), `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`, `upgrade-insecure-requests`.
- Full hardening header set: HSTS, `X-Content-Type-Options`, `X-Frame-Options:
  DENY`, COOP / COEP (`require-corp`) / CORP, `Referrer-Policy`,
  `Permissions-Policy`, `Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`.
- `Server` and `X-Powered-By` headers stripped; `etag` disabled; all responses
  `no-store`.
- `express.json({ limit: '8kb' })`.
- `trust proxy` = 1 (correct client IP from `X-Forwarded-For` behind Apache).
- Rate limiting moved out with the access-key login it protected; authentication
  is now the hub's responsibility.

### 2.7 Frontend

- Static files in `public/`: `index.html`, `join.html` (anonymous share-link
  entry), `license.html`, plus `js/app.js` (~1k lines), `js/join.js`,
  `js/cardDeck.js`, `js/clipboard.js`, and `css/poker.css` +
  `css/instrument-core.css` (the synced Instrument theme). `js/oscilloscope.js`
  is synced but not loaded: poker's header band uses the static
  `images/room-banner.webp` instead of the animated trace.
  `admin.html` / `js/admin.js` were removed with the admin surface.
- No framework, no build step. All JS is external (CSP forbids inline).
- `robots.txt` + `sitemap.xml` present.

### 2.8 Testing & CI

- **Unit tests:** `node --test` over `tests/*.test.js` (one per `lib/` module).
- **E2E:** Playwright (`tests/e2e/`) — smoke, multi-user room, anonymous join,
  header waves. Headless Chrome, **serial: `workers: 1`**, because the specs
  share one server and one sessions DB and seed a fixed session id;
  `fullyParallel: false` alone only serialises *within* a file.
- **CI** — `.github/workflows/ci.yml`, GitHub Actions on PR + push. It checks
  out **`davidmjackson/suite` as a sibling**, because `@suite/auth-client` and
  the theme foundation are resolved by relative path, and installs the linked
  package's own dependencies separately — `npm ci` here does not pull them.
  Then Node 24 → syntax pass → `npm test` (135) → `npm run test:e2e` (9) →
  `npm audit --omit=dev`.

### 2.9 Operations

- `GET /health` → `{ status, version, commit, uptime, rooms }` (unauthenticated).
- Runs as the `scrumpoker` `systemd` service on port 3000 behind **Apache**
  (TLS, `/ws` proxied with `Upgrade`; vhosts in `suite/infrastructure/apache/`).
  Deployment runbook in `docs/deployment.md`, which also documents the sibling
  `suite` checkout this repo needs.
- Custom free-use license; in-app page at `/license` (and `/licence`).

---

## 3. Retrospective — Detailed

### 3.1 Runtime & Dependencies

- **Node.js** (host v20.19.6).
- **Production dependencies** (`package.json`):
  - `@suite/auth-client` — `file:../suite/shared/auth-client`; session verification.
  - `express` `^4.19.2` — HTTP server. *(Note: Express **4**, vs Scrum Poker's 5.)*
  - `ws` `^8.17.1` — WebSocket server.
  - `better-sqlite3` `^12.6.2` — **synchronous** SQLite driver.
  - `dotenv` `^17.2.4` — loads `.env`.
  - `pino` / `pino-http` — structured logging.
  - `zod` — validation.
- **Dev dependencies:** `@playwright/test`, `pino-pretty`, `supertest`.
- No ORM (raw SQL via `better-sqlite3`), no front-end framework, no bundler.

### 3.2 Process & Module Layout

Two large files do most of the work:

| File | Lines | Responsibility |
|---|---|---|
| `server.js` | ~1,211 | HTTP routes, page routes, REST API, WebSocket server, timer reconciliation, retention scheduling. |
| `db.js` | ~1,008 | SQLite: schema creation & migrations, normalization helpers, CRUD/upserts for retros/cards/actions, team table + key hashing, retention, JSON seed import. |
| `scripts/db-maintenance.js` | — | CLI: `migrate`, `retention`, `vacuum`. |

`server.js` is **no longer monolithic**: it has shed ~460 lines into a `lib/`
(`upgradeAuth.js`, `companyAccess.js`, `validate.js`, `logger.js`, `contrast.js`)
plus a `middleware/` directory, converging on Scrum Poker's layout. Auth is now
the shared auth-client's `verifySession`, not a hand-rolled HMAC token.

### 3.3 Persistence & Data Model

- **SQLite** file `retros.db` (path overridable via `RETRO_DB_PATH`; production
  is expected to point this outside the git tree, e.g. `/var/lib/retrospective/`).
- `foreign_keys = ON`; cascade deletes from `retros` → `cards` / `actions`.
- **Schema (current version 5, tracked in a `meta` key/value table):**
  - `teams` — **dropped.** Tenancy moved to `retros.company_id`, taken from the
    verified suite session.
  - `retros` — `id`, `title`, `company_id` (NOT NULL), `share_token`,
    `created_at`, `closed`, `closed_at`,
    timer columns (`duration/remaining/running/end_at`), `last_action_json`,
    `updated_at`.
  - `cards` — `id`, `retro_id` (FK), `column_type` (`well`/`improve`/`continue`),
    `text`, `details`, `votes`, `status`, `notes`, `created_by`, `updated_at`.
  - `actions` — `id`, `retro_id` (FK), `source_card_id`, `text`, `details`,
    `owner`, `due_date`, `status`, `notes`, `created_at`, `created_by`,
    `updated_at`.
  - Indexes on `retro_id` and composite `(retro_id, column_type)` /
    `(retro_id, status)`.
- **Migration system** runs on boot (`ensureSchema`):
  - Legacy single-column JSON-blob table (`retros.data_json`) → normalized
    `retros`/`cards`/`actions`.
  - Legacy plaintext `teams.join_key` → hashed `key_hash` + `key_salt`.
- **In-memory mirror:** on boot the whole DB is loaded into `state.retros`.
  Mutations are applied in memory **and** write-through to SQLite, then
  broadcast. If the DB is empty, the server can seed once from `state.json`.

### 3.4 Domain Model

- **Retro board** = 3 columns: `well` / `improve` / `continue` (Start / Stop /
  Continue). Cards have `text`, `details`, `votes`, `createdBy`.
- **Shared timer** per retro: duration / remaining / running / `endAt`.
  `reconcileTimers()` recomputes remaining time from wall-clock `endAt`.
- **Actions** are created deliberately from cards and form a cross-team kanban:
  statuses `todo` / `in_progress` / `blocked` / `done`.
- **Teams** own retros; team names are case-insensitive and unique.

### 3.5 HTTP Surface

**Page routes:** `/` (login), `/lobby`, `/retrospective` (alias `/retro`),
`/actions`, `/admin`, `/license`.

**REST API:**

| Method & path | Purpose |
|---|---|
| `POST /api/login` | Issue session cookie |
| `POST /api/logout` | Clear session cookie |
| `GET /api/session` | Return active session |
| `GET/POST /api/retros` | List / create retros |
| `GET /api/retros/:id` | Load one retro |
| `POST /api/retros/:id/close` | Close a retro |
| `GET /api/actions-report` | Cross-team action list |
| `PUT /api/actions` | Update action status/notes |
| `POST /api/teams` | Create a team (facilitator) |
| `GET /api/admin/teams` | List all teams (admin) |
| `DELETE /api/admin/teams/:id` | Delete a team (admin) |
| `POST /api/admin/teams/:id/rotate` | Rotate a team key (admin) |
| `GET /health` | Unauthenticated health check |

### 3.6 WebSocket Protocol

- WebSocket server attached to the same HTTP server (**no dedicated path** —
  any upgrade is accepted, distinguished by query string).
- **Origin checking:** connections are rejected unless the `Origin` matches
  `RETRO_ALLOWED_ORIGINS` (or the same host if that env var is unset).
- Two connection modes via query params `?retroId=&view=`:
  - `view=lobby` → live per-team retro list.
  - retro board → joins a retro room.
- **Client → server:** `hello` (presence), `timer` (`set`/`start`/`stop`/`reset`
  — facilitator-only), `addCard`, `voteCard`, `moveCard`, `createAction`.
- **Server → client:** `init`, `update`, `retros`, `presence`, `timer`,
  `retroClosed`, `error`.

### 3.7 Authentication & Authorization

- **Suite session cookies**, verified through `@suite/auth-client`'s
  `verifySession` — the same mechanism as Scrum Poker. WebSocket upgrades go
  through `lib/upgradeAuth.js`, which also admits a valid board **share token**
  for anonymous participants.
- **Tenancy by company.** A board carries `company_id`; `lib/companyAccess.js`
  allows a request only when that matches the company on the verified session.
- **The hand-rolled HMAC token is gone** — `RETRO_AUTH_SECRET`, the `retro_auth`
  cookie, the `teams` table and `RETRO_ADMIN_KEY` team keys were all removed
  when auth moved to the hub. The "replace this with a real JWT library"
  recommendation in the 2026-05 draft was overtaken by deleting it instead.

### 3.8 Security Posture

- CSP (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `form-action 'self'`), `X-Content-Type-Options`,
  `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`.
  *(Slightly lighter than Scrum Poker — no HSTS / COOP / COEP / CORP in the app
  layer; those are added at the Apache edge.)*
- `express.json({ limit: '1mb' })`.
- **Extensive input validation** in `server.js`: max lengths for name (80),
  team (80), retro title (140), card text (500), card details (2000), action
  notes (4000), owner (80); max 100 cards/column; timer 1–240 min; due date must
  match `YYYY-MM-DD`; IDs constrained to a safe charset.
- **Login rate limiter:** in-memory `Map` keyed `IP:role:team`, default
  **20 failures / 15 min** (`RETRO_LOGIN_RATE_LIMIT_MAX` /
  `RETRO_LOGIN_RATE_LIMIT_WINDOW_MS`).
- Production boot guards: exits if `RETRO_AUTH_SECRET` missing or
  `RETRO_ADMIN_KEY` missing/default.

### 3.9 Configuration (`.env`)

`NODE_ENV`, `PORT`, `RETRO_AUTH_SECRET`, `RETRO_ADMIN_KEY`,
`RETRO_ALLOWED_ORIGINS`, `RETRO_DB_PATH`, `RETRO_AUTH_TTL_HOURS`,
`RETRO_RETENTION_DAYS`, `RETRO_LOGIN_RATE_LIMIT_MAX`,
`RETRO_LOGIN_RATE_LIMIT_WINDOW_MS`. Template in `.env.example`.

### 3.10 Frontend

- Static files in `public/`: `login`, `lobby`, `retrospective`, `actions`,
  `admin`, `license` — each as `.html` + a matching `.js`, plus `styles.css`.
- **Vendored `dragula`** (`public/vendor/dragula/`) for card drag-and-drop —
  the only third-party browser library, bundled locally to satisfy CSP.
- `public/sounds/timer-complete.wav` for timer completion.
- No framework, no build step.

### 3.11 Testing & CI

- **Unit:** a single test file, `tests/ws-operations.test.js`
  (`npm test` = `node tests/ws-operations.test.js`).
- **E2E:** Playwright (`tests/e2e/`: `page-shell`, `retro-smoke`). The repo
  vendors Linux browser libraries under `.playwright-libs/` and points
  `LD_LIBRARY_PATH` at them — a WSL/sandbox workaround. The Playwright web
  server boots a throwaway DB on port 3101.
- **No CI workflow committed** (no `.github/`). Contrast with Scrum Poker.
- Acknowledged test-coverage gap in the README TODOs (API + WebSocket tests).

### 3.12 Operations & Maintenance

- `GET /health` (unauthenticated).
- `retrospective` `systemd` service on port 3001. **Production fronts it with
  Apache**, alongside every other app (vhosts in `suite/infrastructure/apache/`);
  the `deploy/nginx/` sample configs still committed in this repo describe a
  topology that is not the one in use. `deploy/systemd/` is current.
- **DB maintenance** via `scripts/db-maintenance.js`:
  `npm run db:migrate`, `npm run db:retention`, `npm run db:vacuum`.
- **Retention:** if `RETRO_RETENTION_DAYS` is set, closed retros older than the
  cutoff are deleted; an in-process job runs this every 24 h.
- `AGENTS.md` and a `.vscode/` workspace config are committed.

---

## 4. Side-by-Side Comparison

| Dimension | Scrum Poker | Retrospective |
|---|---|---|
| Express major version | **5.x** | **4.x** |
| `ws` version | 8.18.2 | 8.17.1 |
| Persistence | In-memory only (ephemeral) | SQLite, durable, normalized + migrations |
| State on restart | Rooms & votes lost (keys/audit kept) | Fully restored from DB |
| Auth mechanism | Suite session cookie (`@suite/auth-client`) | Suite session cookie (`@suite/auth-client`) |
| User identity | From the suite session; anonymous share-link joins supported | From the suite session |
| Team store | Hub-side (company on the session) | `teams` table in SQLite |
| Admin gate | Removed — `/admin` returns 404 | `admin` role + `Admin` team key |
| WebSocket path | Dedicated `/ws` | Same server, query-string routed |
| WS origin check | None (relies on CSP/proxy) | `RETRO_ALLOWED_ORIGINS` enforced |
| Code organization | Modular `lib/` + thin `server.js` | `server.js` (~1.2k) + a growing `lib/` |
| Unit test coverage | Per-module test files | Per-concern test files |
| CI | GitHub Actions | GitHub Actions |
| Body size limit | 8 KB | 1 MB |
| Security headers | Full set incl. HSTS/COOP/COEP/CORP | Lighter set (HSTS etc. left to the edge) |
| Audit log | Removed with the admin surface | None |
| Config loading | Env vars directly | `dotenv` + `.env` |

### Shared, near-identical patterns (already converged)

- Node + Express + `ws`; vanilla static frontend; no framework; no build step.
- Strict CSP forbidding inline JS / `eval`; external-asset-only policy.
- **`@suite/auth-client` for session verification** — the convergence in the
  2026-05 draft has since been extracted into an actual shared package.
- `/health` endpoint; `X-Forwarded-For`-aware client IP behind Apache.
- Apache reverse proxy + TLS at the edge + `systemd` service per app.
- Structured `pino` logging with redaction; `zod` validation.
- Custom free-use license + in-app `/license` page in both.
- Playwright + `node --test` (Scrum Poker) / `node:test`-style scripts (Retro).

---

## 5. Deployment Topology

```
                 Internet (443/TLS)
                        │
                   ┌────▼────┐
                   │ Apache  │  TLS termination, edge security headers,
                   │ (proxy) │  WebSocket Upgrade pass-through
                   └────┬────┘
            ┌───────────┴───────────┐
            │                       │
   ┌────────▼────────┐     ┌─────────▼─────────┐
   │  Scrum Poker     │     │  Retrospective    │
   │  systemd svc     │     │  systemd svc      │
   │  node :3000      │     │  node :3001       │
   │  in-memory state │     │  SQLite retros.db │
   │  suite session   │     │  .env config      │
   └──────────────────┘     └───────────────────┘
```

The hub (`suite-hub`, :3004) sits alongside these and owns authentication;
`signal` and `raid` are two further apps on the same pattern. All four apps read
sessions written by the hub.

- Each app is a single Node process (no clustering, no worker threads).
- Each binds `0.0.0.0` and is fronted by Apache; production guidance is to bind
  to `127.0.0.1` and expose only 80/443 via firewall.
- No container/orchestration layer — bare `systemd` units.
- **Operational note:** the tool/development host is *not* the production
  server. On the dev host, both run as `systemd` services
  (`scrumpoker` :3000, `retrospective` :3001) restartable with `systemctl`.
  Production deploys are performed by handing the operator commands.

---

## 6. Single-Process Scaling Constraints

Both apps assume **exactly one process** holds all live state:

- Scrum Poker: `rooms` / `participants` maps are process-local — multiple
  instances could not share a room.
- Retrospective: `state.retros`, `clients`, `rooms`, `lobbyRooms`, the timer
  interval, and the login-attempt map are all process-local. SQLite is the
  durable store but the in-memory mirror and WebSocket fan-out are not shared.
- Login rate limiters are in-memory in both — they reset on restart and do not
  coordinate across instances.

This is fine at current (small-team) scale but is the **first hard limit** if
horizontal scaling is ever required (would need a shared pub/sub layer such as
Redis, plus externalized session/rate-limit state).

---

## 7. Known Gaps / Tech Debt

**Scrum Poker**
- All session state is volatile — a deploy or crash drops every active room.
- Generic package name (`websocket-server`).

**Retrospective**
- No CI pipeline.
- Thin automated test coverage (one test file; README TODOs call this out).
- `server.js` is a ~1,700-line monolith — harder to test and reason about than
  Scrum Poker's `lib/` layout.
- Hand-rolled token signing/verification instead of a vetted JWT library.
- Duplicate-markup / `state.json` decisions still listed as open TODOs.
- Vendored Playwright browser libs (`.playwright-libs/`) committed to the repo.

**Both**
- Hand-rolled auth and rate limiting rather than established middleware.
- No shared code despite heavy pattern overlap (see Section 8).
- Single-process scaling ceiling (Section 6).

---

## 8. What Was Extracted, and What Was Not

The 2026-05 draft listed candidates for extraction into a shared package. That
extraction has since happened, so this section records the outcome rather than
the wish-list.

**Extracted** into `suite/shared/`:

- **`auth-client`** — session verification (`verifySession`), the sessions-DB
  store, and the Express wiring. Consumed by scrumpoker, retrospective, signal
  and raid, all by relative path.
- **`theme`** — the Instrument foundation (tokens, `instrument-core.css`,
  glyphs, oscilloscope) plus a **drift checker** each app runs as a test, so a
  synced asset cannot quietly diverge from source.

**Deleted rather than extracted** — the access-key model they belonged to is
gone, replaced by hub sessions: the key store, the admin audit log, the login
rate limiter and the admin surface.

**Still duplicated per app** and worth a look if a fifth is built: the
security-header middleware (scrumpoker's `applySecurityHeaders` remains the
most complete), build-info/`/health` reporting, and the role predicates.

**The cost of the shared package**, which the original list did not anticipate:
it is *linked*, not installed. Its own dependencies live in the sibling
checkout, `npm ci` in a consuming app does not pull them, and a running process
holds the old copy until restarted. Both CI pipelines now encode that.

---

## 9. Architectural Decision Inputs

Of the eight questions the 2026-05 draft raised, four have been answered by
what shipped since. They are recorded as settled so nobody re-opens them:

1. **Consolidation vs. independence — settled: consolidated.** `@suite/auth-client`
   and `shared/theme` are real shared packages (§8).
2. **Auth standardization — settled.** Both apps moved to hub-issued session
   cookies; the hand-rolled HMAC token and the access-key model are both gone.
3. **Code organization — settled in practice.** Retrospective has grown a `lib/`
   and shed ~460 lines from `server.js`; the house style is scrumpoker's layout.
4. **CI baseline — settled.** Both apps have pipelines, and so does the `suite`
   repo itself as of 2026-09-14.

Still open:

5. **Persistence baseline** — Scrum Poker remains fully in-memory, so a restart
   still wipes active rooms. Worth deciding deliberately rather than by default,
   especially now that restarts are routine (a shared-package patch forces one).
6. **Express version** — Retrospective still lags at 4; Scrum Poker is on 5.
7. **Scaling** — unchanged, and now slightly sharper: five single-process
   services share one host. Multi-instance still needs shared state designed in
   rather than retrofitted (§6).
8. **Frontend stance** — both apps still prove no-build, no-framework, strict-CSP
   is viable. Unchanged.

New, not in the original list:

9. **The linked-dependency boundary.** Four apps resolve a shared package by
   relative path from their parent directory. It is the most load-bearing and
   least visible assumption in the estate: it is invisible to `npm ci`, absent
   on a fresh CI runner, and silently stale in a running process. Decide whether
   to keep the relative-path link or publish the package properly.

---

*Written 2026-05-22; corrected 2026-09-14 against the working source of both
apps. Cross-check against `docs/deployment.md` (each repo), `docs/session-log.md`
and `README.md` for operational detail and historical decisions.*
