# Phase 0 Research: Desktop Auth Pairing + Shared-API Enforcement

**Feature**: `004-desktop-auth-pairing` | **Date**: 2026-06-25

This document resolves every "Deferred to Planning" item from the spec and the brainstorm. Each
section follows the Decision / Rationale / Alternatives format. The headline finding drives
everything else: **better-auth already ships the exact RFC 8628 device-grant flow we need**, so the
feature is overwhelmingly _configuration + wiring_ rather than bespoke cryptography.

---

## R1. Pairing mechanism: better-auth `device-authorization` plugin vs. bespoke endpoint

**Decision**: Use the better-auth **`device-authorization`** plugin together with the **`bearer`**
plugin. Do **not** build a bespoke pairing endpoint.

**Rationale**:

- Both plugins are already present in the installed `better-auth@^1.6.14`
  (`node_modules/better-auth/dist/plugins/device-authorization/`, `.../bearer/`) — adding them is a
  config change in `auth.ts`, not a new dependency.
- The plugin implements RFC 8628 exactly as the spec describes (outbound-only, code + polling, no
  loopback, no URL scheme). It exposes four endpoints, all served automatically by the existing
  `app.all("/api/auth/*", toNodeHandler(getAuth()))` line in `serverApp.ts`:
  - `POST /api/auth/device/code` — desktop requests a pairing; returns `device_code`, `user_code`,
    `verification_uri`, `verification_uri_complete`, `expires_in`, `interval`.
  - `POST /api/auth/device/approve` — browser (authenticated session) approves a `user_code`.
  - `POST /api/auth/device/deny` — browser declines.
  - `POST /api/auth/device/token` — desktop polls with `device_code`; on approval returns
    `{ access_token, token_type: "Bearer", expires_in, scope }` where `access_token` is a real
    better-auth **session token** (verified in `device-authorization/routes.mjs`:
    `internalAdapter.createSession(user.id)` → returns `session.token`).
- The plugin already enforces single-use (`adapter.delete` on token redemption), expiry
  (`expiresAt < now` → `expired_token`), `slow_down` / `authorization_pending` poll states, and
  status precedence (pending → approved/denied). Re-implementing this by hand would duplicate ~250
  lines of battle-tested protocol logic and violate constitution Principle VII (Simplicity, DRY).
- It binds the credential to "the user who approved" for free: `/device/approve` reads the browser
  session (`getSessionFromCtx`) and stamps `userId` on the `deviceCode` row; `/device/token`
  creates the session for exactly that `userId` (satisfies FR-005, FR-007 wrong-party guard — a
  different signed-in user approving binds the code to _their_ id, never the polling desktop's
  intended account silently).

**Alternatives considered**:

- _Bespoke pairing endpoint reusing the invitation token recipe_ (random secret → SHA-256 lookup →
  AES-GCM at rest). Rejected: it would re-derive a worse version of the plugin, own a new table,
  and still need a separate credential mechanism for the resulting bearer token. The invitation
  recipe stays relevant only as the _at-rest_ pattern reference (see R5), not the protocol.
- _`one-time-token` plugin_. Rejected: it is a single-use login-token primitive, not a polled
  device grant; we'd still hand-build the poll loop, expiry, and approval UI contract.

---

## R2. The credential model: what the desktop holds and presents

**Decision**: The device credential **is a better-auth session token**, presented on shared-API
requests as `Authorization: Bearer <token>`. No separate token type, no new credential table.

**Rationale**:

- `/device/token` returns `access_token = session.token`. The **`bearer` plugin** installs a
  `before` hook that converts any incoming `Authorization: Bearer <sessionToken>` into the session
  cookie the rest of better-auth expects (`bearer/index.mjs`). Therefore
  `getAuth().api.getSession({ headers })` — _which `loadSession()` in `requireUser.ts` already
  calls_ — resolves **both** a web cookie **and** a desktop bearer token with zero new code. This
  is the single largest simplification in the design and directly answers the "how does one gate
  accept both" deferred question (R6).
- Session == credential gives us, for free: server-side existence (the `session` table),
  expiry/renewal (R3), self sign-out (R7), and admin revocation (R8).

**Alternatives considered**:

- _`api-key` plugin for a long-lived opaque key_. Rejected for v1: it adds a second auth path and a
  second thing to gate/revoke; the session-as-bearer path already satisfies every requirement and
  keeps one mental model.

---

## R3. Credential lifetime & renewal

**Decision**: Configure a **generous shared session lifetime** in `auth.ts`:
`session: { expiresIn: 60 days, updateAge: 1 day }`. A desktop that syncs at all within 60 days
auto-renews to a fresh 60 days; one offline longer than that must re-pair.

**Rationale**:

- better-auth refreshes `expiresAt` when a session is used within `updateAge`, so any normal-use
  desktop (the watcher syncs whenever online) stays connected indefinitely with no re-approval
  (FR-013, SC-002). 60 days comfortably covers field translators who are offline for weeks.
- The same setting applies to web sessions. For an internal, invitation-only translation tool a
  longer web session is acceptable and was implicitly fine before (cookie-session had no short TTL
  pressure). This avoids inventing a device-only lifetime, honoring Simplicity.

**Alternatives considered**:

- _Device-only longer lifetime_ (web stays short, device stays long). Rejected for v1: better-auth
  applies `session.expiresIn` uniformly and the device plugin creates an ordinary session, so
  splitting lifetimes needs a custom credential — out of proportion to the need.
- _Short expiry with a refresh token_. Rejected: adds a refresh dance the plugin does not provide;
  `updateAge`-based sliding renewal already gives "stays connected in normal use."

**Open spike for implementation** (not blocking): confirm `updateAge` renewal triggers on a plain
authenticated GET (the desktop's sync calls) and not only on sign-in, so daily syncs slide the
expiry. If not, the desktop's watcher will periodically hit `/api/auth/get-session` to refresh.

---

## R4. Pairing-code format, expiry, poll interval, and browser auto-open

**Decision**:

- **User code** (typed by the human): **8 uppercase Base32-ish characters in two groups of four**,
  e.g. `WDJB-MJHT`, generated via the plugin's `generateUserCode` option from an
  ambiguity-free alphabet (`BCDFGHJKLMNPQRSTVWXZ` + `23456789`; no `0/O/1/I/L/U/V` confusables).
  Copyable from the desktop (FR-001).
- **Device code** (the desktop's polling secret): plugin default (long random), **never shown in
  the browser or any URL** (FR-007). Carried only in the desktop→server poll body.
- **Expiry**: `expiresIn: 10 minutes` (RFC 8628 typical; generous for "sign in then type a code").
- **Poll interval**: `interval: 5 seconds`; the desktop honors the plugin's `slow_down` backoff.
- **Browser auto-open**: **Yes, auto-open** `verification_uri_complete` (link page with the code
  pre-filled) via Electron `shell.openExternal`, while still **displaying the code** so the user can
  copy/retype if the auto-open fails or lands in the wrong browser profile.

**Rationale**: Two short groups are the established readable device-code shape (Google/GitHub style)
and minimize mis-keying for a field user. 10 min / 5 s are the RFC-recommended defaults and match
the plugin's own defaults closely. Auto-open removes a step (SC-001 "under 2 minutes") without
removing the manual fallback the spec's edge cases require.

**Alternatives considered**: 6-char single group (higher collision/typo rate at scale, fewer bits);
no auto-open (more friction). Both rejected on UX grounds.

---

## R5. Secure at-rest storage of the credential on the desktop

**Decision**: Store the bearer session token using **Electron `safeStorage`** (OS keychain —
Keychain on macOS, DPAPI on Windows), persisted as an encrypted blob in a new file under the
existing `LocalStorage` `userData` base path (e.g. `credential.bin`). Plaintext token lives only in
memory in the Electron main process.

**Rationale**:

- `safeStorage.encryptString` / `decryptString` ties the ciphertext to the OS user account without
  the app needing to hold a key — the right primitive for a desktop secret. The AES-256-GCM
  invitation recipe needs a server-held secret the desktop does not have, so it is the wrong tool
  here; we cite it only as the project's established "encrypt secrets at rest" precedent.
- Keeping the credential in `LocalStorage`'s base path keeps all desktop state in one place and
  reuses the atomic tmp-file write pattern already in `LocalStorage`.

**Alternatives considered**: plaintext file (rejected — a lost laptop's disk yields the token; the
whole point of revocation is the lost-laptop case, so don't make theft trivial); AES-GCM with a
hardcoded app key (rejected — key ships in the binary, no real protection). On Linux `safeStorage`
can fall back to weaker backing, but the packaged targets are macOS/Windows; note as a documented
caveat.

---

## R6. The unified server gate (cookie **and** bearer) + CSRF interaction

**Decision**: Keep a **single gate** built on the existing `requireUser` / `loadSession`. Because
the `bearer` plugin makes `getSession` accept the bearer token, `loadSession` _already_ authenticates
both clients. Wrap domain routes in a **flag-conditional** wrapper (R9). No change to
`requireSameOrigin`.

**Rationale & CSRF analysis**:

- **Bearer (desktop) is CSRF-safe by construction**: it travels in an `Authorization` header set
  explicitly by the Electron main process, never auto-attached by a browser, so cross-site forgery
  cannot add it. The domain-route gate therefore does **not** need `requireSameOrigin` for the
  bearer path.
- **Cookie (web) CSRF** on the domain API: the gated domain routes are GETs (reads) plus
  `POST /api/tStrings`. Cross-site GETs leak nothing (same-origin policy blocks the JSON response,
  as already reasoned for the invitation lookup GET). For the one state-changing
  `POST /api/tStrings`, document whether to add `requireSameOrigin` to it under enforcement — see
  R7-followup. better-auth's own `/api/auth/device/approve|deny` (browser, cookie) get better-auth's
  built-in `trustedOrigins`/origin enforcement automatically.
- **Desktop-called auth endpoints and origin checks**: `/device/code` and `/device/token` are
  called by Node Axios with **no Origin header**. RFC 8628 treats these as public (the `device_code`
  is the secret), and better-auth does not require an Origin for non-cookie token exchange. **Spike
  to confirm** in the integration suite that `BETTER_AUTH_ENFORCE_ORIGIN=1` does not 403 the
  Origin-less `/device/code` / `/device/token` calls; if it does, mark those two paths exempt or
  send an allowed Origin from the desktop.

**Alternatives considered**: a second middleware that hand-parses `Authorization` and looks the
session up directly (rejected — duplicates what the bearer plugin already does inside `getSession`).

---

## R7. Exact set of shared `/api/*` routes the enforcement gate covers

**Decision**: When the flag is ON, require an authenticated user on the **domain data routes**:

| Gate                            | Routes                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gated (require user)**        | `/api/languages`, `/api/languages/code/:code`, `/api/languages/:id/lessons/:id/tStrings`, `/api/languages/:id/tStrings`, `/api/languages/:id/tStrings/:ids`, `/api/lessons`, `/api/lessons/:id`, `/api/lessons/:id/webified`, `/api/sync/:timestamp/...`, `POST /api/tStrings` |
| **Already gated**               | everything under `/api/admin/*` (existing `requireAdmin`)                                                                                                                                                                                                                      |
| **Always public (never gated)** | `/api/auth/*` (sign-in, get-session, **device** endpoints, invitation lookup/accept)                                                                                                                                                                                           |

**Rationale**:

- These are precisely the routes the desktop `downSync` and web app call for curriculum data
  (confirmed by reading `downSync.ts`, `WebAPIClientForDesktop`, and `ApiContracts.ts`). They are
  the "open API hole" the brainstorm describes.
- `/api/auth/*` is registered _before_ the gate and the body parser in `serverApp.ts` and must stay
  anonymous so sign-in, invitation redemption, and device pairing keep working with enforcement on
  (FR-011, SC-007).

**Confirmation of FR-011 (no pre-login web flow hits a gated route)**: The web `AuthGate` (003)
already blocks the SPA's authenticated routes; its public allowlist is sign-in + invitation
redemption, both of which call only `/api/auth/*`. The invitation redemption page calls
`/api/auth/invitation/:token` and `/api/auth/invitation/accept` (auth-namespaced, ungated). No
pre-login screen calls a domain `/api/*` route. **This was verified by inspection and is recorded as
a contract test in Phase 1.**

**Follow-up (red-team input)**: decide whether `POST /api/tStrings` (the only state-changing domain
route) should also carry `requireSameOrigin` when enforcement is on, for cookie-CSRF defense in
depth. The `/webified` static mount (`docStorage`) is image assets referenced by previews; leaving
it ungated avoids breaking preview rendering — confirm acceptable.

---

## R8. Admin revoke-by-user surface

**Decision**: Add **one admin endpoint** `POST /api/admin/users/:userId/revoke-sessions`
(under the existing `app.use("/api/admin", requireAdmin)` guard + `requireSameOrigin`) that deletes
all of that user's sessions via direct SQL on the shared auth pool:
`DELETE FROM "session" WHERE "userId" = $1`. Surface it as a **"Revoke device access" button** in
the web admin user/invitation area.

**Rationale**:

- Because the device credential _is_ a session, deleting the user's sessions cuts off every device
  on its next online request (the gate's `getSession` returns null → 401), satisfying FR-017 and
  SC-005 within one poll/sync cycle. The device then re-pairs.
- Direct SQL on `getAuthPool()` mirrors the established `invitationStore` pattern (constitution VI
  server-only exemption) and avoids pulling in the better-auth `admin` plugin just for one call.

**Accepted tradeoff (v1, blunt-but-simple per spec)**: revoking by user also ends that user's **web**
sessions (they re-log-in on web). For the lost/stolen-laptop threat this is _more_ protective, not
less, and the spec explicitly frames revocation as "blunt but simple." Scoping revocation to
device-created sessions only would require tagging sessions at creation (a session discriminator);
recorded as a deferred enhancement, not v1.

**Alternatives considered**: better-auth `admin` plugin's `revokeUserSessions` (rejected — extra
plugin/dependency surface for one operation we can do in one SQL statement); per-device revocation
(out of scope — spec defers per-device management).

---

## R9. Enforcement flag: representation and default

**Decision**: A server-config flag, **default OFF**, read once at startup. Represent it as the env
var **`ENFORCE_API_AUTH`** (truthy = on), surfaced through a typed `config` accessor (not stored
domain data). Implementation: a `requireUserWhenEnforced` wrapper that calls `requireUser` when the
flag is on and `next()` when off, mounted ahead of the domain controllers.

**Rationale**: Env-var flag matches how the project already toggles auth behavior
(`BETTER_AUTH_URL`, `BETTER_AUTH_ENFORCE_ORIGIN`, `BETTER_AUTH_ENFORCE_RATE_LIMIT`). Default-off
guarantees FR-009/FR-012/SC-004 (no behavior change until the operator flips it after the
connect-capable desktop ships). Reading once at startup keeps the gate cheap and predictable.

**Alternatives considered**: a `secrets.json` boolean (works too, but env var is lighter for an
operator toggle and consistent with the other auth env flags); a DB-stored runtime flag (rejected —
adds a domain-data-shaped concept for an operator switch, and would tempt importing config into
non-server layers).

---

## R10. Rollout sequencing against deployed desktops (version skew)

**Decision**: The default-off flag **is** the rollout mechanism. Sequence: (1) ship server with
plugins + gate present but flag OFF; (2) ship the connect-capable desktop release; (3) once field
desktops have updated, the operator sets `ENFORCE_API_AUTH` and restarts. No grace period or forced
auto-update is built in v1.

**Rationale**: Field desktops that have not updated keep working anonymously while the flag is off;
the operator only flips it after the new desktop is out, so no field device breaks "on the wrong
day" (spec Assumptions, FR-009). Building a forced-update channel is out of scope and unnecessary
given the operator-controlled flag.

---

## Summary of decisions feeding Phase 1

| #   | Decision                                                                                         |
| --- | ------------------------------------------------------------------------------------------------ |
| R1  | Use better-auth `device-authorization` + `bearer` plugins (no bespoke endpoint).                 |
| R2  | Credential = better-auth session token, sent as `Authorization: Bearer`.                         |
| R3  | `session.expiresIn = 60d`, `updateAge = 1d` (sliding renewal).                                   |
| R4  | User code `XXXX-XXXX` unambiguous alphabet; 10 min expiry; 5 s poll; auto-open + visible code.   |
| R5  | Desktop at-rest via Electron `safeStorage`, blob under `LocalStorage` base path.                 |
| R6  | One gate; `getSession` (via bearer plugin) already accepts cookie + bearer; bearer is CSRF-safe. |
| R7  | Gate the domain data routes; keep `/api/auth/*` public; confirmed no pre-login domain calls.     |
| R8  | `POST /api/admin/users/:userId/revoke-sessions` → direct SQL delete of user's sessions.          |
| R9  | `ENFORCE_API_AUTH` env flag, default OFF, via `requireUserWhenEnforced` wrapper.                 |
| R10 | Flag-gated rollout: server first (off) → desktop release → operator flips flag.                  |
