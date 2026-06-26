# Implementation Plan: Desktop App Authentication (Code-Based Pairing) + Shared-API Enforcement

**Branch**: `004-desktop-auth-pairing` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-desktop-auth-pairing/spec.md`

## Summary

Give the Electron desktop its own server credential via an RFC 8628 device-grant (the user clicks
**Connect to account**, the desktop shows a short code and opens the browser, the user signs in and
approves, and the desktop — polling — becomes connected as them), then **require authentication on
the shared domain `/api/*` routes behind a default-off server flag** so anonymous callers are locked
out once the connect-capable desktop ships.

**Technical approach** (from Phase 0 research): adopt the better-auth **`device-authorization`** +
**`bearer`** plugins (both already in `better-auth@^1.6.14`). They provide the entire pairing
protocol and a credential that **is a better-auth session token**, presented as
`Authorization: Bearer <token>`. Because the `bearer` plugin makes `getSession` accept that header,
the existing `loadSession`/`requireUser` already authenticates **both** the web cookie and the
desktop bearer — so the "unified gate" is a thin flag-conditional wrapper, credential renewal is
better-auth's sliding session expiry, self-disconnect is `sign-out`, and admin revoke-by-user is a
one-line SQL delete of the user's sessions. Net-new code is small and mostly wiring + UI.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
**Primary Dependencies**: better-auth `^1.6.14` (NEW: enable its `device-authorization` + `bearer`
plugins — no new packages), `pg` (auth pool), Express, React 16 + styled-components, Electron
`^41.2.0` (NEW use of `safeStorage`, existing `shell.openExternal`), Axios.
**Storage**: Auth pool (`getAuthPool()`) — NEW `deviceCode` table (plugin schema), reuses existing
`session` table for the credential. Desktop-local encrypted credential blob via `safeStorage` under
the `LocalStorage` base path. **No domain-data / `Persistence` change.**
**Testing**: Jest (unit, TDD), `*.integration.test.ts` for the server auth flow, Cypress (web E2E
for the link/approval page + enforcement), Playwright + Electron (desktop E2E for connect/disconnect
/offline).
**Target Platform**: Web (Express + Passenger behind Cloudflare) and Desktop (Electron, macOS/Windows).
**Project Type**: Isomorphic four-layer (`core` / `server` / `frontend` / `desktop`).
**Performance Goals**: Connect end-to-end < 2 min, single code (SC-001); revoke effective within one
poll/sync cycle (SC-005); poll interval 5 s with `slow_down` backoff.
**Constraints** (carried from research + brainstorm Key Decisions): outbound-HTTPS only — **no
loopback server, no custom URL scheme**; desktop credential is bearer-style/non-cookie (CSRF-safe
from the Electron main process); server-only auth code MUST NOT enter `core` or the desktop offline
path (FR-018, Principle VI); offline-first preserved (FR-014); no third-party OAuth, no public
sign-up (FR-019); language-code selection unchanged (FR-020); enforcement default-OFF (FR-009).
**Scale/Scope**: Small internal user base; a user may pair multiple devices; one new admin endpoint,
one new web page, desktop connect/disconnect UI, one migration, plugin config, one gate wrapper.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-25-desktop-app-authentication-requirements.md](../brainstorms/2026-06-25-desktop-app-authentication-requirements.md)

### Key Decisions Carried Forward

- **Pair AND enforce in one feature**: the desktop credential is what lets the server honestly
  require auth → both ship together (US1 + US2).
- **Authentication only in v1**: prove a real account is behind each request; per-language
  authorization deferred (explicit non-goal below).
- **Code-based device grant, loopback/URL-scheme explicitly rejected**: only outbound HTTPS — drove
  the choice of the `device-authorization` plugin (research R1).
- **Bearer-style, non-cookie, CSRF-safe credential**, reusing the invitation at-rest pattern as
  precedent → realized as a better-auth session token + `safeStorage` (research R2, R5).
- **Revocable, minimal lifecycle surface**: Disconnect + admin revoke, no device-list UI
  (research R8; non-goal below).

### Deferred Questions (resolved during planning)

- Code format / expiry / poll interval / auto-open → research **R4** (`XXXX-XXXX`, 10 min, 5 s,
  auto-open + visible code).
- Credential lifetime & renewal, at-rest storage → **R3** (60-day sliding session) + **R5**
  (`safeStorage`).
- Plugin vs bespoke → **R1** (plugin).
- Unified gate accepting cookie + bearer, CSRF interaction → **R2/R6**.
- Exact gated `/api/*` set + no pre-login domain call → **R7**.
- Admin revoke-by-user surface → **R8**.
- Enforcement rollout / version skew → **R9/R10** (default-off flag is the rollout lever).

## Constitution Check

_GATE: re-checked after Phase 1 design — still PASS._

| Principle | Status | Notes |
| --- | --- | --- |
| **I. Test-First (TDD)** | PASS | Unit TDD for the gate wrapper, revoke store fn, desktop credential store, header injection, and connection-state logic; integration test for the pairing/enforcement flow; Cypress (link page + enforcement) and Playwright+Electron (connect/disconnect/offline) for the user-facing flows (Principle I doc-processing/E2E clause). |
| **II. Type Safety** | PASS | Strict TS, explicit return types, no `any` (mirror the cast-with-comment pattern already used for better-auth handler types), `type` imports. |
| **III. Code Quality** | PASS | JSDoc on new public fns; reuse `requireUser`, `requireSameOrigin`, `invitationStore` direct-SQL patterns; import ordering/Prettier. |
| **IV. Pre-commit Gates** | PASS | `yarn typecheck` + lint-staged + conventional commits; no `--no-verify`. |
| **V. Warnings** | PASS | Zero-warning; address any better-auth plugin deprecation immediately. |
| **VI. Layered Architecture / Dual Targets** | PASS | All auth data on the server-only auth pool (exemption); the desktop obtains/uses the credential **over HTTP only** and never imports better-auth (FR-018); `core` stays isomorphic — header passing added as an opaque-string param, no credential logic in `core`; offline-first preserved; the three runtime envs keep their isolation (the new flag is env-scoped, default off). |
| **VII. Simplicity** | PASS | The headline simplification: reuse the plugin + session-as-credential instead of bespoke crypto and a parallel credential table (YAGNI/DRY/KISS). One new endpoint, one table, one gate wrapper. |

**No violations** → Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/004-desktop-auth-pairing/
├── plan.md                      # This file
├── research.md                  # Phase 0 — R1..R10 decisions
├── data-model.md                # Phase 1 — entities & migration
├── quickstart.md                # Phase 1 — manual walkthrough
├── contracts/
│   ├── device-pairing-api.yaml      # /api/auth/device/* (plugin) + sign-out
│   ├── admin-revoke-api.yaml        # POST /api/admin/users/:userId/revoke-sessions
│   └── shared-api-enforcement.md    # flag behavior over the domain routes
└── tasks.md                     # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── auth/
│   │   ├── auth.ts                       # MODIFY: add deviceAuthorization() + bearer() plugins,
│   │   │                                 #         session{expiresIn:60d,updateAge:1d},
│   │   │                                 #         deviceAuthorization({ expiresIn:"10m",
│   │   │                                 #           interval:"5s", verificationUri:"/link" }),
│   │   │                                 #         rateLimit.customRules: { "/device/token": false,
│   │   │                                 #           "/device/code":{window:60,max:5},
│   │   │                                 #           "/device/approve":{window:60,max:5},
│   │   │                                 #           "/device/deny":{window:60,max:5} }
│   │   └── sessionRevocation.ts          # NEW: revokeUserSessions(pool, userId) — direct SQL
│   ├── middle/
│   │   └── requireUserWhenEnforced.ts    # NEW: flag-conditional wrapper around requireUser
│   ├── util/
│   │   └── enforcementFlag.ts            # NEW: typed ENFORCE_API_AUTH accessor (default off)
│   ├── controllers/
│   │   └── adminUsersController.ts       # NEW: POST /api/admin/users/:userId/revoke-sessions
│   └── serverApp.ts                      # MODIFY: mount requireUserWhenEnforced on domain routes;
│                                         #         register adminUsersController
├── core/
│   └── api/
│       └── WebAPIClient.ts               # MODIFY: optional opaque `headers` param on webGet/webPost
├── desktop/
│   ├── auth/
│   │   ├── DevicePairing.ts              # NEW: code request, browser open, poll loop, token capture
│   │   └── CredentialStore.ts            # NEW: safeStorage encrypt/decrypt of the bearer token
│   ├── WebAPIClientForDesktop.ts         # MODIFY: inject Authorization: Bearer; 401 → drop paired
│   └── DesktopApp.ts                      # MODIFY: wire pairing/disconnect, paired-state IPC
└── frontend/
    ├── web/
    │   └── deviceLink/
    │       ├── DeviceLinkPage.tsx        # NEW: enter/confirm code + Approve/Decline (authed route)
    │       │                             #   On mount: GET /api/auth/device?user_code=XXXX
    │       │                             #   (claims deviceCode row — required before approve/deny).
    │       │                             #   Approve → POST /device/approve; Decline → POST /device/deny.
    │       └── deviceLinkThunks.ts       # NEW: claimCode(userCode) → GET /api/auth/device?user_code=;
    │                                     #       approveCode(userCode) → POST /api/auth/device/approve;
    │                                     #       denyCode(userCode) → POST /api/auth/device/deny
    ├── web/MainRouter.tsx                # MODIFY: add /link as an authenticated (gated) route
    ├── web/home/AdminHome.tsx            # MODIFY: "Revoke device access" control
    └── desktopFrontend/
        ├── ConnectAccount.tsx            # NEW: Connect/Connected/Disconnect + code display
        └── downSync/DownSyncPage.tsx     # MODIFY: surface not-connected/connect prompt

migrations/
└── <ts>-AddDeviceCodeTable.js           # NEW: deviceCode table on the auth pool (plugin schema)
```

**Structure Decision**: Standard isomorphic four-layer layout. Server auth lives under
`src/server/auth/`; the desktop's credential handling is a new `src/desktop/auth/` folder that talks
to the server **only over HTTP** (Principle VI); the web link page is a new authenticated route in
the existing web SPA; `core` changes are limited to an opaque header pass-through.

## Presentation Design

**Component Framework**: React 16 + styled-components, using the existing
`src/frontend/common/base-components/` kit and `Colors.ts` / Helvetica scale per `DESIGN.md`
(consistency over novelty — the invitation screens are explicitly _not_ the reference).
**Interaction Patterns**: Redux Toolkit + thunks (web); desktop uses the IPC + `useLoad`/`usePush`
pattern already in `desktopFrontend`; web routing via React Router v6 inside the 003 `AuthGate`.
**Accessibility Target**: WCAG 2.2 AA (readable copyable code, keyboard-operable approve/decline,
clear status/error text per `PRODUCT.md`).

### UI Decisions

| Screen / Component | User Story | Approach | Design Skills |
| --- | --- | --- | --- |
| Desktop **Connect to account** (idle + code display + "Connected as <user>" + Disconnect) | US1, US4 | New `ConnectAccount.tsx` from base-components; shows copyable `XXXX-XXXX` code, auto-opens browser, polls; Disconnect button | `/design-language-to-daisyui` (map to base-components), `/design-clarify` (status + error copy) |
| Desktop **not-connected / connect prompt** in DownSync | US3 | Modify `DownSyncPage` empty/disconnected state | `/design-onboard` (first-run / empty state), `/design-clarify` |
| Web **Device link / approval page** (`/link`): enter/confirm code, Approve / Decline | US1 | New authenticated React route + thunks; pre-fills `?user_code`; requires sign-in (AuthGate) | `/design-language-to-daisyui`, `/design-clarify`, `/design-adapt` (small windows) |
| Web admin **Revoke device access** control | US4 | Button in `AdminHome` user/invitation area + confirm | `/design-clarify` (destructive-action copy) |

### Quality Pass

**Design quality target**: Production (internal field tool — clarity/robustness over flourish).
**Post-implementation refinement**: `/design-audit` (consistency vs. `DESIGN.md`), `/design-clarify`
(microcopy for the four desktop states + expiry/decline messages).

## Security Considerations

> Added by `/sp:04-red-team` (adversarial pre-implementation review). These harden the design
> against device-grant-specific abuse and CSRF; the device-grant phishing and brute-force vectors
> are the headline risks because the pairing endpoints stay anonymous-reachable even with
> enforcement on (FR-011).

### Device-grant approval: anti-phishing consent + brute-force protection (FR-002, FR-003, FR-007)

The RFC 8628 device grant has a well-known phishing/fixation risk: an attacker initiates pairing on
*their own* desktop, obtains a `user_code`, and socially engineers a victim into approving it on the
`/link` page — binding the **attacker's** device to the **victim's** account (the credential is
issued to whoever approves, and the approving user is whoever is signed in). The mirror risk is
brute-forcing pending `user_code`s on `/device/approve`.

- **Consent copy is a security control, not just UX.** The `/link` approval screen MUST state
  explicitly that the user is authorizing a **new desktop computer to sign in as them**, and warn
  to continue **only if they personally started this on their own computer** (e.g. "Connect a new
  desktop? This lets that computer act as your account. Only continue if you started this on your
  own machine."). No silent / auto-approve — approval is always an explicit click (FR-003). If any
  device/client context is shown (`client_id`), treat it as **untrusted display only**: `client_id`
  is self-asserted by whoever called `/device/code`, so an attacker can send the official
  `"lessons-from-luke-desktop"` value to look legitimate. The consent copy must therefore anchor the
  decision on *"did **you** start this on **your** computer?"* and must NOT imply the request is
  trustworthy because the client looks like the official app.
- **Rate-limit `/device/approve` and `/device/deny`** per authenticated user and per IP so pending
  `user_code`s cannot be brute-forced or enumerated (without this limit, a malicious authenticated
  user would spray-`deny` to grief in-flight pairings — the mirror of brute-force `approve`). Reuse the existing
  better-auth `rateLimit` config / the `invitationRateLimit` precedent. User-code entropy (8 chars
  over a 28-symbol ambiguity-free alphabet ≈ 38 bits, R4) is adequate **only when paired with rate
  limiting** per RFC 8628 §5.2.
- **Rate-limit `/device/code`** per IP to stop anonymous flooding of the `deviceCode` table
  (DoS / table-growth). This endpoint is anonymous by design (FR-011), so it needs its own ceiling.
- These per-path limits MUST NOT throttle the legitimate 5 s `/device/token` poll — see
  Edge Cases (poll-vs-rate-limit). Propagated to `contracts/device-pairing-api.yaml` (429 responses).

### CSRF on the one state-changing gated route: `POST /api/tStrings` (resolves research R7 follow-up)

Bearer (desktop) requests are CSRF-safe by construction (header set by the Electron main process,
never auto-attached by a browser). The **cookie (web)** path is not. Of the gated domain routes,
all are reads except `POST /api/tStrings`, which writes translation data. Under enforcement a
logged-in web user's cookie becomes a CSRF target for that write.

- **Decision (red-team):** apply the existing `requireSameOrigin` middleware to `POST /api/tStrings`
  when enforcement is on, mirroring the invitation-accept POST (which already pairs
  `requireSameOrigin` with a state-changing cookie route). GET reads stay un-origin-gated (same as
  the invitation lookup GET — cross-site GETs cannot read the JSON response).
- Propagated to `contracts/shared-api-enforcement.md` (403 same-origin row + behavior matrix).

### Static asset mount bypasses the gate: `/webified/*` (data exposure under enforcement)

`serverApp.ts` serves lesson imagery via `app.use("/webified", express.static(...))`, an
**unguarded** static mount. With enforcement on, `GET /api/lessons/:id/webified` (the HTML) is
gated, but the `/webified/*` image assets that HTML references remain anonymously fetchable —
leaking curriculum imagery and partially defeating the lock-down.

- **Decision (red-team):** gate the `/webified` static mount behind the same
  `requireUserWhenEnforced` wrapper as the domain routes (or, if preview rendering breaks, document
  the residual exposure as an explicit, accepted tradeoff with rationale). Default to gating.
- Propagated to `contracts/shared-api-enforcement.md`.

### Admin revoke hygiene (FR-017)

`revokeUserSessions` deletes the user's `session` rows but leaves that user's in-flight `deviceCode`
rows. On revoke, delete **all** of that user's `deviceCode` rows **regardless of status** — not just
`pending` ones. An `approved`-but-not-yet-redeemed row (status flipped by `/device/approve`, token
not yet pulled by the desktop poll) is the dangerous case: if it survives the revoke, the device's
very next `/device/token` poll mints a **fresh** session for the user and silently re-grants the
access the admin just revoked — a revocation-bypass window. The delete must therefore be
`DELETE FROM "deviceCode" WHERE "userId" = $1` (every status), not a `status = 'pending'` filter.
(The periodic expiry sweep — see Performance — is a backstop, not a substitute, because it only
reaps `expiresAt < now`.)

**Ordering/atomicity (red-team, second-order):** the two deletes (sessions + deviceCode rows) must
not leave a race window. If sessions are deleted **first**, a `/device/token` poll arriving in the
gap can redeem a still-present `approved` deviceCode row and mint a **new** session that survives the
revoke. Therefore either run both deletes in a **single transaction**, or — robust regardless of
isolation level — delete the user's **`deviceCode` rows first, then the `session` rows**: once the
deviceCode rows are gone, an in-flight poll gets `expired_token`/`invalid_grant` and cannot create a
session, and the subsequent session delete closes out everything already issued.

### Bearer credential widens the admin API surface (second-order of the `bearer` plugin)

The `bearer` plugin is **global**: it makes `getAuth().api.getSession` accept
`Authorization: Bearer <session-token>` on *every* route that resolves a session, not only the
gated domain routes. `requireAdmin` (in `requireUser.ts`) goes through the same `loadSession` →
`getSession` path, so once `bearer` is installed an **admin user's desktop device credential
authenticates `/api/admin/*`**. Consequences worth designing for, not just noticing:

- A leaked/stolen *admin* desktop token is now an **admin-API** credential, callable with plain
  `curl` from outside any browser — strictly more dangerous than the curriculum-data exposure the
  enforcement flag closes. This is the strongest argument for the fail-closed `safeStorage`
  handling below and for treating admin revoke as a first-class operation.
- **State-changing admin routes are partially protected already**: `requireSameOrigin` rejects a
  request with no `Origin`/`Referer` (it 403s when neither is present — confirmed in
  `requireSameOrigin.ts`), and a desktop bearer call carries neither. So the new
  `POST /api/admin/users/:userId/revoke-sessions` and the existing invitation-**write** admin POSTs
  are *not* reachable by a no-Origin bearer caller. **Action:** confirm every state-changing admin
  route carries `requireSameOrigin` so this hold is deliberate, not incidental.
- **Admin GET routes have no such guard**: e.g. the admin invitation **list** is `requireAdmin`
  only, so an admin bearer token *can* read it via `curl`. **Decision (red-team):** accept this for
  v1 (internal, invitation-only tool; an admin token is already trusted) but record it explicitly
  in the threat model — the admin desktop credential is **admin-equivalent**, and that is the
  reason admin revoke and fail-closed storage matter. Do **not** silently assume admin endpoints
  stay cookie-only after `bearer` ships.

### Audit trail & secret redaction (FR-021)

FR-021 ("pairing approvals, desktop disconnects, and admin revocations MUST be recorded") has **no
home** in the current plan/contracts/data-model — `/sp:05-tasks` would generate no audit work from
the artifacts as they stand. Pin it down here so it reaches tasks:

- **Where:** emit a structured audit log line (consistent with existing auth/invitation event
  logging) at three points — the desktop's successful token redemption / first connected sync
  (approval), `POST /api/auth/sign-out` from the desktop (disconnect), and the
  `revoke-sessions` admin endpoint (revocation, including `revokedCount`). The
  `device-authorization` plugin owns approval server-side; if it does not already log, the
  redemption is observable via the new session row's creation — prefer an explicit log line in the
  admin endpoint and on the desktop connect transition rather than inventing an audit table (no new
  domain/auth schema — Principle VII).
- **Redaction is mandatory:** the audit records and any debug logging added to the new auth code
  (`DevicePairing.ts`, `CredentialStore.ts`, `WebAPIClientForDesktop` header injection,
  `sessionRevocation.ts`) MUST NOT record the **bearer/session token**, the **`device_code`
  polling secret**, or the `/device/token` **`access_token`**. Log the `userId`, an event name, and
  timestamps only. (There is no morgan/access-log middleware today — confirmed — so the only
  leakage paths are the *new* code's own logging; keep it that way.)

## Edge Cases & Error Handling

> Added by `/sp:04-red-team`.

### Poll vs. rate limit (correctness of the happy path)

The desktop polls `/device/token` every 5 s (R4) — up to ~12 requests/min (≤ 2 per 10 s window)
over a 10-minute code. The better-auth global `rateLimit` default is 100 req/10 s per IP, far above
the poll rate, so the global limit does **not** threaten the legitimate poll under normal usage.
However, to make this unambiguous and future-proof (in case per-path rules are added later), the
implementation adds `"/device/token": false` to `rateLimit.customRules` to explicitly exclude the
poll path from rate limiting. The desktop already honors the plugin's `slow_down` backoff; it MUST
treat an unexpected `429` distinctly from `slow_down` and surface a clear retry rather than a
generic error (defensive programming).

### Session keep-alive so daily-use desktops never expire (FR-013, SC-002)

SC-002 ("100% of restarts stay connected") depends on `updateAge` sliding renewal (R3), which the
research flags as an open spike: it may only slide on certain calls, not on plain authenticated sync
GETs. Make the keep-alive **explicit** rather than spike-dependent: the desktop, when online, calls
`GET /api/auth/get-session` with its bearer token on a defined cadence (at least once per online
session and at most once per `updateAge` window, i.e. ~daily) to slide `expiresAt`. A desktop that
syncs at all within 60 days therefore never expires; one offline longer than 60 days re-pairs. (Noted
in `data-model.md` Entity 4.)

### 401 mid-sync: clean abort, no cache corruption (FR-014, US3, SC-006)

A revoke/expiry can land **between** the many requests of one sync. The first `401` MUST abort the
remaining sync cleanly, leave the local cache at its **last consistent checkpoint** (offline-first:
the local cache is authoritative for local use), drop `paired → false`, clear the stored credential,
and transition to "Not connected — reconnect" — never a half-applied sync or a silent failure.

### Secure storage unavailable: fail closed, never plaintext (FR-008)

`safeStorage.isEncryptionAvailable()` can return false (keychain locked, pre-`app.ready`, or a Linux
box without a keyring backend — R5 caveat). The design MUST **fail closed**: if encryption is
unavailable, do **not** persist the token in plaintext. Keep it in memory for the current session
only and tell the user securely storing the connection isn't available on this machine, so a lost
laptop never yields a readable token (the lost-laptop case is the whole reason revocation exists).
(Noted in `data-model.md` Entity 3.)

The mirror case is the **read path**: a `credential.bin` written on a previous run can later become
**undecryptable** — the OS user changed, the keychain was reset, the login keyring is locked, or the
file was copied to another machine. `safeStorage.decryptString` then **throws**. Startup credential
load MUST wrap the decrypt in try/catch and, on failure, treat the device as **unpaired** (discard
the unreadable blob, drop to "Not connected — reconnect", keep working offline from cache) rather
than crashing the main process or boot-looping. A decrypt failure is indistinguishable from "no
credential" for UX purposes and MUST resolve to the same safe unpaired state. (Noted in
`data-model.md` Entity 3.)

### `/link?user_code=` deep link must survive the 003 sign-in round-trip (US1.3, SC-001)

`/link` is a new **authenticated** route, so a not-yet-signed-in user who opens
`verification_uri_complete` (`/link?user_code=WDJB-MJHT`) is first bounced through the existing 003
`AuthGate` → sign-in → back. The `?user_code=` prefill (which makes SC-001's "single short code, under
2 min" and the seamless US1.3 path work) only survives this bounce if the AuthGate encodes the **full**
current location — path **and** query — into its `returnTo` param with `encodeURIComponent`. If it
instead builds `returnTo=/link?user_code=XXXX` unencoded, the router parses `user_code` as a separate
top-level param and `safeReturnTo` returns a bare `/link` (the sanitizer itself is fine — it returns
`pathname + search`, so a correctly-encoded `returnTo` round-trips the code; the failure is purely in
how `returnTo` is constructed). Two concrete requirements fall out:

- When `AuthGate` redirects an unauthenticated visitor away from `/link?user_code=…`, it MUST
  percent-encode the whole `pathname + search` as the `returnTo` value so the code is preserved
  through sign-in. Add a test asserting `/link?user_code=XXXX` (cold, unauthenticated) lands back on
  `/link` **with the `user_code` query intact** after login.
- The prefill is **best-effort, not a dependency**: `DeviceLinkPage` MUST still render an editable
  code field so a user who arrives at `/link` with no (or a dropped) `user_code` can paste the code
  the desktop displays (FR-001 copyable code is the fallback). The flow must never dead-end on a
  missing prefill. (Plan-only — no contract/data-model change; this is web-client behavior at the
  003↔004 seam.)

## Performance Considerations

> Added by `/sp:04-red-team`.

### Per-request session lookup under enforcement

With the flag on, every gated domain request now resolves `getSession` against the **auth pool** —
a DB round-trip that anonymous reads previously skipped. Desktop `downSync` and the web app are
request-heavy, so this adds measurable auth-pool load and per-request latency. Mitigation: enable
better-auth's session cookie-cache / short-TTL session caching so the gate does not hit the DB on
every sync request, and measure sync latency with enforcement on before flipping it in production
(the default-off rollout, R10, makes this measurable safely).

**Caveat (red-team — the cookie cache does NOT cover the heaviest client):** better-auth's
session *cookie-cache* stores the cached session in a signed **cookie** on the client. The desktop
is the request-heaviest sync client, but it authenticates with `Authorization: Bearer` and keeps no
cookie jar — the `bearer` plugin reconstructs a cookie from the header *per request* and the desktop
never persists/returns the cache cookie, so the cookie-cache optimization yields **no** DB savings
on the desktop path. Every gated desktop `downSync` request therefore still round-trips `getSession`
to the auth pool. Options: (a) accept it — the user base is small and `downSync` is bursty, not
sustained, so the added auth-pool load is likely negligible (measure under the default-off rollout
before deciding); or (b) configure server-side session caching via better-auth `secondaryStorage`,
which caches the lookup **server-side** and so benefits the bearer path too. Default to (a) +
measure; reach for (b) only if measurement shows auth-pool pressure.

### `deviceCode` table growth (unbounded without a sweep)

The plugin deletes a `deviceCode` row on token redemption, denial, or an expiry check **during a
poll** — but an **abandoned** pairing (code requested, desktop killed or browser never opened, so
the row is never polled) is never deleted and accumulates forever. Add a periodic sweep of
`expiresAt < now` rows (startup + opportunistic, mirroring how other transient auth rows are reaped),
so abandoned + anonymous-flood rows (see Security) cannot grow the table without bound. (Noted in
`data-model.md` Entity 1.)

## Accessibility Requirements

> Added by `/sp:04-red-team`. Target WCAG 2.2 AA (per Presentation Design). These are specific to
> the new surfaces.

### Pairing code (desktop display + `/link` entry)

- The `XXXX-XXXX` code MUST be announced as **discrete characters**, not read as a word — group with
  appropriate markup / `aria-label` (e.g. label the field "Pairing code, eight characters") so a
  screen-reader user can transcribe it.
- The desktop copy-to-clipboard control MUST have an accessible name and announce success via an
  `aria-live="polite"` region ("Code copied").

### Pairing status is a live, focus-free state machine

The desktop pairing status changes on its own (waiting for approval → connected as <user> →
expired / declined) without user action. Render status in an `aria-live="polite"` region (errors
`assertive`) so the transition is announced **without moving focus**, and keep the same for the
DownSync "Not connected / Connect" prompt (US3).

### `/link` page focus management

When the page opens with `?user_code` pre-filled, set initial focus to the **Approve** action (or a
heading describing the consent), not the top of the page, so keyboard and screen-reader users land
on the decision. Approve/Decline MUST be fully keyboard-operable with a visible focus ring and a
logical tab order (Decline reachable, not a trap).

### Admin "Revoke device access" (destructive)

The destructive admin control MUST be keyboard-operable, have an accessible confirm dialog with
focus moved into it and returned on close, and announce the outcome ("Revoked N sessions") via a
live region.

## Acceptance Test Strategy

> **ATDD Outer Loop**: `sp:05-tasks` creates these GWT files before the `US<N>` tasks run.
> Acceptance-spec numbering continues the global sequence (001/002 used US01–US08, 003 used
> US09–US10), so this feature is **US11–US14**, mapping to the spec's local US1–US4.

| User Story (local) | Acceptance Spec File | Scenarios |
| --- | --- | --- |
| US1 — Connect a desktop (P1) | `specs/acceptance-specs/US11-desktop-connect-pairing.txt` | 5 |
| US2 — Lock down the shared API (P2) | `specs/acceptance-specs/US12-shared-api-enforcement.txt` | 4 |
| US3 — Stay connected / offline (P2) | `specs/acceptance-specs/US13-stay-connected-offline.txt` | 3 |
| US4 — Disconnect & admin revoke (P3) | `specs/acceptance-specs/US14-disconnect-and-revoke.txt` | 3 |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Phase 0 — Outline & Research

Complete. All "Deferred to Planning" items resolved in [research.md](./research.md) (R1–R10). No
remaining open questions. Implementation spikes from R3 and R6 are now resolved by reading the
installed better-auth source (`^1.6.14`):

**(a) `updateAge` session renewal** (R3): Renewal fires **only** in the `GET /api/auth/get-session`
handler (`api/routes/session.mjs`, `needsRefresh` check). Domain API calls (`/api/languages`, sync
routes, etc.) go through `requireUser`/`loadSession` which queries the session but does **not**
extend `expiresAt`. The desktop explicit keep-alive call (`GET /api/auth/get-session` once per
`updateAge` window, ~daily) is therefore **required, not optional** to prevent 60-day expiry on
actively-syncing desktops (confirmed design decision, no spike needed at implementation time).

**(b) Origin check for Origin-less `/device/code` and `/device/token`** (R6):
`validateOrigin()` in `api/middlewares/origin-check.mjs` (line 102) returns immediately when the
request has no `Cookie` header and `Sec-Fetch-*` headers are absent: `if (!(forceValidate ||
useCookies)) return`. Desktop Electron main process calls via Axios carry neither header, so they
pass the origin middleware untouched even when `BETTER_AUTH_ENFORCE_ORIGIN=1` (`disableOriginCheck:
false`). Safe — no configuration change needed.

**Additional concrete findings from plugin source** (propagated to `contracts/device-pairing-api.yaml`
and `DeviceLinkPage` plan below):

- `/device/token` body requires `grant_type: "urn:ietf:params:oauth:grant-type:device_code"` (zod
  literal, line 122 of `routes.mjs`) — our contract was missing this field.
- The web link page **must use a two-step claim-then-approve flow**: `GET /api/auth/device?user_code=
  XXXX` (`deviceVerify`) is called on page-load to associate the signed-in user's id with the
  deviceCode row (sets `userId`); THEN `POST /api/auth/device/approve` succeeds. Without the prior
  `GET /device` call, `approve` returns `invalid_request: DEVICE_CODE_NOT_CLAIMED`. This flow must
  be reflected in `DeviceLinkPage.tsx` and `deviceLinkThunks.ts`.
- The `verificationUri` plugin option must be set to `"/link"` (relative) so the returned
  `verification_uri` / `verification_uri_complete` point at our SPA page, not the plugin's default
  `"/device"` path.
- Rate limiting: the global rateLimit default (100 req/10 s per IP) does not throttle the 5 s poll
  (at most 2 req/10 s window). The throttle risk in the Poll vs. rate limit edge case is therefore
  eliminated with the defaults. We still add explicit custom rules to lock in the guarantee:
  `"/device/token": false` (exclude from rate-limit to be unambiguous) and
  `"/device/code": { window: 60, max: 5 }` (anti-flood) and
  `"/device/approve": { window: 60, max: 5 }` (brute-force; better-auth rate limit keys on IP +
  path so this is per-IP — adequate for our internal user base and the high code entropy) and
  `"/device/deny": { window: 60, max: 5 }` (symmetry with approve — stops a malicious authenticated
  user spray-denying / enumerating pending `user_code`s; matches the Security section and
  `contracts/device-pairing-api.yaml`).

## Phase 1 — Design & Contracts

Complete: [data-model.md](./data-model.md), three files under [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Agent context refreshed via
`.specify/scripts/bash/update-agent-context.sh claude`.

**Post-design constitution re-check**: PASS (table above) — the design _reduces_ surface area
(plugin reuse, session-as-credential) rather than adding complexity; no new violations.
