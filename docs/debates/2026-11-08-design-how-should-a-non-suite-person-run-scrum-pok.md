# Debate: Design: how should a non-Suite person run Scrum Poker estimation sessions as Facilitator while the Suite owner (David) is on leave, without opening the app to the public?

- Id: 2026-11-08-design-how-should-a-non-suite-person-run-scrum-pok
- Opened: 2026-11-08T14:15:21.837Z
- Model: gpt-6.1-sol
- Max rounds: 3

## Round 1/3 — Claude

USE-CASE (David's words, summarised faithfully): David will be on leave and needs to hand estimation duties to his team. Those people should not have to register for Sprint Suite (it is outside their remit). Today: David signs into the Suite, opens Scrum Poker, gets a login screen (create room + pick role), and from inside a room can share a per-room invite link for guests. David's proposed idea: a "semi-permanent" link he can send to a specific person; it opens the facilitator login page where that person can create a room, pick a role and become Facilitator. It is separate from the in-room share link. Hard requirements: NOT public, "highest security", the app stays reachable from the Suite with the Suite managing security. He is open to alternatives.

CURRENT FACTS (verify in code): lib/httpApp.js serves `/` only to hub-authenticated, entitled users. lib/wsServer.js decideUpgrade admits either a hub session or an anonymous socket carrying a room's `shareToken` (lib/roomState.js createRoom, 128-bit random, per room). Rooms are keyed `${companyId}-${room}` (lib/wsHandlers.js) and live only in process memory: they die when empty/expired (1h idle) and on every restart. Since #69 a guest can already be promoted to Facilitator in-room and keep it across reconnects via a rejoin key (lib/guestSeats.js). The hub (/var/www/suite/hub) has company member invites (lib/org.js inviteCompanyMember) and per-app entitlements (routes/company.js grant/revokeEntitlement) — but accepting an invite means creating a Suite account, which David wants to avoid.

OPTIONS I CONSIDERED:
(1) Do nothing new: David creates a room, promotes a guest to Facilitator, leaves. Fails: rooms die on idle/restart, so it cannot cover weeks of leave.
(2) Full decoupling: a standalone instance with its own login. Rejected: two security models to maintain, and it breaks "Suite manages security".
(3) Hub-side: invite the delegate as a company member entitled only to Poker. Strongest security (real identity, revocation, audit), but it IS registration, which David ruled out.
(4) David's idea, hardened — a "Host Pass" (my recommendation):
  - Issued only by a signed-in, entitled Suite member from inside Poker; bound to the issuer's companyId; carries the delegate's display name.
  - Mandatory expiry, chosen at issue (default = leave dates, hard cap e.g. 30 days). Revocable from inside the Suite by the issuer at any time; list of active passes visible.
  - Token: 256-bit random in the URL fragment (not the query string, so it stays out of proxy/access logs and Referer); stored server-side as a SHA-256 hash only, in the app's existing SQLite file (data/poker-sessions.db) so it survives restarts.
  - Second factor: a short PIN the issuer passes through a different channel (e.g. Teams vs email), with lockout after N failures, so a forwarded or leaked link alone is useless. 
  - Redeeming exchanges pass+PIN for a short-lived, HttpOnly, SameSite=Strict, Secure poker-only cookie (e.g. 12h) — not a hub session. That cookie lets the holder do exactly one thing beyond guest: create rooms under the issuer's company (namespaced so they cannot collide with or join members' rooms), become Facilitator, and share the normal per-room guest link. No access to /api/me, other apps, or the hub.
  - Rate-limit the redeem endpoint; audit-log issue/redeem/revoke/fail events; cap concurrent rooms per pass (e.g. 2).
  - Deliberately one pass = one named person; not shareable to a whole team (the team joins via the normal in-room link the host shares).

My view: (4) meets every stated requirement; (3) is the stronger security posture if David could accept a minimal "invited account" with no self-registration. The real residual risk of (4) is bearer-credential theft within the expiry window, mitigated by PIN + expiry + revocation + the narrow capability. Please challenge: is (4) defensible as "highest security", is the PIN worth its friction, is a poker-local credential the right place versus putting delegation in the hub, and have I missed a simpler option?

## Round 1/3 — ChatGPT: OBJECT

A Host Pass is defensible as restricted delegation, but option (4) does not yet satisfy the stated Suite-managed security requirement or establish effective revocation.

I independently inspected the repository and shared Hub code. The room-lifetime problem is real: server.js stores rooms in memory; lib/roomState.js deletes empty rooms; lib/guestSeats.js provides only a two-minute disconnected facilitator hold. Existing guest promotion cannot cover weeks of leave.

My objections are specific:

1. Security authority: persisting credentials and independently authenticating delegates inside Poker introduces another authentication lifecycle. Suite authentication at issuance alone does not establish ongoing Suite control. I recommend Hub-owned delegation records, redemption and revocation, with Poker enforcing a poker-only capability. Delegates need no Suite membership, dashboard access or ordinary Hub session. This requires new functionality; the current launch exchange assumes a user and central session.

2. Revocation must reach live connections and derived authority. lib/wsServer.js authenticates only at upgrade; message handlers subsequently trust participant state. lib/heartbeat.js checks connection liveness, not authorization. Deleting a pass or cookie would therefore be insufficient. Specify server-enforced expiry and revocation for existing sockets, and invalidate delegated rooms, guest links and rejoin keys so a promoted guest cannot preserve control after the grant ends. Cookie expiry must never exceed pass expiry.

3. A display name does not bind a credential to a person. Link plus static PIN reduces link-only leakage, but both remain transferable. Prefer a fresh, short-lived code delivered to the designated recipient through the Hub. Do not describe the static PIN arrangement as verified identity or strong MFA.

4. Granting delegation is a separate privilege from using Poker. Restrict issuance to the company owner or an explicitly authorized administrator, rather than every entitled member. Enforce company/pass scope and room limits server-side. Do not reuse ws.authed=true: admitMember in lib/wsHandlers.js would then permit joining arbitrary company rooms by name.

One factual correction: Hub inviteCompanyMember already creates the user record; routes/login.js provides magic-link login without self-registration. However, this still creates a Suite account, and routes/company.js currently toggles only Signal and RAID—not a Poker-only account configuration. It therefore does not meet the stated no-account constraint unchanged.

I support the proposed random-token hashing, fragment transport, expiry, audit and room limits. My recommended solution retains the Host Pass experience but makes delegation Hub-owned, recipient-verified and enforceably revocable throughout its lifetime. Calling the original design 'highest security' overstates what its controls guarantee.

Review only: main at c7a1d48; no changes, commit or push. Three focused test files and git diff --check passed. No project server was running or started.

## Round 2/3 — Claude

I verified your claims and concede points 1, 2 and 4 in full, and 3 mostly.

Verified: lib/wsServer.js authorises once at upgrade, and handlers trust participant state after that; lib/heartbeat.js checks liveness only. admitMember builds `${companyId}-${payload.room}`, so reusing ws.authed for a delegate would let them join any company room by name. That would be a real hole. hub/routes/login.js + magic.js do provide passwordless magic-link login, and routes/company.js toggles only signal/raid. So my "(3) is registration" framing was too strong: on the delegate's side, invite + magic link is "click a link in an email", not a sign-up form.

On 3: a static PIN is not identity, and I withdraw the "highest security" wording for it. A one-time code emailed by the Hub to the named recipient binds the grant to an inbox, which is the strongest binding available without an account.

REVISED POSITION — "Delegated Host" grant, Hub-owned:
- Issue: only the company owner or an admin, in the Hub. Fields: recipient email, display name, window (start/end, hard cap 30 days), app=poker. Stored and audited in the Hub. List and revoke there.
- Redeem: the recipient opens a Hub link, and the Hub emails a single-use, short-TTL code/magic link to that address (existing emailSender and limiters). Redemption mints a poker-only delegate session: no dashboard, no other apps, expiry ≤ grant end. The launch handoff to Poker carries principalType=delegate, grantId and companyId.
- Poker enforcement: a distinct ws.delegate flag, never ws.authed. A delegate may only create/join rooms in a per-grant namespace (`${companyId}-d-${grantId}-${room}`), capped at N rooms, and become Facilitator there. The normal per-room guest link then brings the team in.
- Revocation reaches live state: Poker re-verifies delegate grants on a timer (e.g. 60 s, using the existing verifySession path to the Hub) and on every room-creating message. On a revoked or expired grant it closes the delegate's sockets and ends every room in that grant's namespace. That kills the share tokens, guest keys and holds with the room, so a promoted guest cannot keep control.

Open question for you: is a new "delegate" principal in the Hub worth it compared with the much smaller change of (3'): invite the person as a company member, add a poker entitlement toggle, give them a magic-link login, and let them auto-expire on the leave end date? (3') reuses existing identity, revocation and audit wholesale, but it gives them a dashboard and an account. Which would you recommend to David, and why?

## Round 2/3 — ChatGPT: OBJECT

I recommend the Hub-owned Delegated Host grant for David’s stated requirements. An ordinary member account contradicts the no-account requirement and grants broader access. The revised direction is sound, but two concrete security issues remain.

1. The proposed namespace can collide. schemas/ws.js accepts arbitrary room strings up to 200 characters, and admitMember in lib/wsHandlers.js prefixes them with companyId. A member choosing room `d-G-planning` therefore reaches the same key as delegate grant G choosing `planning`. Use an unambiguous typed key for BOTH member and delegate rooms, and store companyId/grantId as server-owned room metadata. Authorize and revoke using that metadata, not string prefixes.

2. Existing verifySession does not verify grants. In suite/shared/auth-client/lib/verify-session.js it returns cached entitlement/company context; its Hub heartbeat checks central-session lifetime, not delegation status. Merely calling it every 60 seconds cannot implement the promised revocation. Add an explicit delegate validation path checking grant status, start/end, session expiry and company authorization. Set a documented maximum revocation delay, such as 60 seconds, without additional cache/grace extensions. Enforce expiry locally at the exact deadline and stop access when the validation lease expires during a Hub outage. Revocation must terminate all associated room authority, including promoted guests and rejoin holds.

I also disagree that (3') becomes Poker-only through one entitlement toggle. suite/hub/lib/entitlements.js combines user, team and company grants, while suite/hub/lib/apps.js makes Sprintplan available to every signed-in user. A new member can inherit company access, and removing a direct grant does not override those grants. Existing membership also has no automatic leave-end expiry. Consequently (3') needs more policy work than described, alongside the live-session revocation work already identified.

My recommendation is therefore a narrowly scoped Hub delegation record, redeemed through a fresh recipient-email challenge, handed to Poker through an app-bound, single-use launch token, and enforced as a distinct principal. Keep ordinary member access as an alternative only if David explicitly accepts Suite accounts and their access consequences. It may reduce implementation complexity under that changed requirement; it does not satisfy the current one.

Acceptance coverage should include namespace collisions, cross-grant access, revocation of an already-open socket, a promoted guest surviving host disconnection, exact expiry, Hub outage and restart recovery. Those tests establish the security properties that distinguish this feature from a persistent guest link.

## Round 3/3 — Claude

Conceded on both, after checking.

1. Collision: schemas/ws.js allows any room string up to 200 characters, so `d-G-planning` from a member collides with my prefix scheme. Revised: rooms carry server-owned metadata, `{ companyId, owner: {type:'member'} | {type:'delegate', grantId} }`. The map key is a typed tuple that no client string can forge, such as a JSON-encoded [companyId, kind, grantId|null, roomName]. Authorisation and revocation read the metadata, never a prefix.

2. verifySession: entitlements.js does resolve user, team and company principals, and it caches. A 60 s verifySession call would not see a revoked grant. Revised: a dedicated Hub endpoint validates a grant (status, window, company, delegate-session expiry) and returns a lease of at most 60 s. Poker enforces the grant's end time locally to the second. When a lease lapses (including during a Hub outage) Poker fails closed: it drops the delegate and ends every room the grant owns, which takes its share token, guest keys, holds and any promoted guest with it. Maximum revocation delay is 60 s, documented. The Hub-to-Poker handoff is a single-use, app-bound launch token.

On (3'): agreed. Membership inherits company and team grants, Sprintplan is open to every signed-in user, and nothing expires it at a leave-end date. So (3') only becomes the right option if David drops the no-account requirement and accepts that wider access.

Final position: a Hub-owned Delegated Host grant. Owner/admin issues it, the recipient redeems through a fresh email challenge, and Poker enforces it as a distinct principal using typed room ownership, a leased validation that fails closed, and room teardown when the grant ends. Acceptance tests as you listed them: collisions, cross-grant access, revoking an open socket, a promoted guest surviving host disconnect, exact expiry, Hub outage, restart recovery. Do you agree?

## Round 3/3 — ChatGPT: AGREE

The revision resolves my objections. Typed room keys prevent the collision permitted by admitMember in lib/wsHandlers.js. Dedicated grant validation avoids relying on the existing auth-client’s cached session context. Ending grant-owned rooms removes the authority retained through facilitator promotion and lib/guestSeats.js rejoin keys.

I recommend this over ordinary Suite membership under David’s no-account requirement. It keeps delegation under Hub control while giving the recipient narrowly scoped Poker access. The operational tradeoff is explicit: a Hub outage lasting beyond the validation lease ends delegated sessions. Email verification establishes inbox control; it does not make credentials impossible to share.

The listed acceptance tests adequately cover the principal security boundaries. This is agreement on the design, subject to implementation and verification.

## Outcome: AGREED

**Agreed solution, in ChatGPT's words:**

Build a Hub-owned Delegated Host grant without creating a Suite member account. Only the company owner or explicitly authorized administrator may issue, list and revoke grants. Each grant identifies a recipient email, company and bounded validity window. A fresh, single-use email challenge leads to an app-bound, single-use launch handoff and a short-lived Poker-only delegate session.

Poker treats delegates as a distinct principal. Use typed room keys and server-owned company/grant metadata, enforce room limits, and permit delegates to create or facilitate only their own grant’s rooms. Team members join through ordinary room invites.

Validate active grants through a dedicated Hub endpoint with leases lasting at most 60 seconds. Enforce expiry locally and fail closed when validation expires. Track grant-owned rooms independently of whether the host remains connected: revocation, expiry or lease loss must end those rooms and invalidate participant authority, share tokens and rejoin credentials. Verify isolation, live revocation, promoted-guest teardown, expiry, outages and restart recovery before release.

