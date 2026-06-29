# Feature Specification: Desktop App Authentication (Code-Based Pairing) + Shared-API Enforcement

**Feature Branch**: `004-desktop-auth-pairing`
**Created**: 2026-06-25
**Status**: Draft
**Input**: User description: "desktop app authentication via code-based browser pairing (device grant) plus shared-API auth enforcement — see specs/brainstorms/2026-06-25-desktop-app-authentication-requirements.md"
**Brainstorm**: specs/brainstorms/2026-06-25-desktop-app-authentication-requirements.md
**Beads Epic**: `lessons-from-luke-wgr`

**Beads Phase Tasks**:

- plan: `lessons-from-luke-wgr.1`
- red-team: `lessons-from-luke-wgr.2`
- tasks: `lessons-from-luke-wgr.3`
- analyze: `lessons-from-luke-wgr.4`
- implement: `lessons-from-luke-wgr.5`
- harden: `lessons-from-luke-wgr.6`

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Connect a desktop to my account (Priority: P1)

A translator running the desktop app wants to connect it to their account so it can work with
the server securely. They click **"Connect to account."** The desktop shows a short code and
opens their web browser to a link page. They sign in (if not already), enter or paste the code,
and approve connecting _this_ computer. The desktop — which has been quietly checking — becomes
connected as them, with no further steps. The whole handshake uses only outbound calls from the
desktop: there is no local server it has to run and no special link it has to register with the
operating system.

**Why this priority**: This is the foundational capability the whole feature rests on. Without a
way for the desktop to obtain a credential, nothing else (enforcement, revocation) can exist.
Pairing alone is independently valuable and demonstrable: a desktop can prove which account is
behind it.

**Independent Test**: On a fresh desktop install, run the connect flow end to end and confirm the
desktop ends up in a connected state bound to the signing-in user, with no code other than the
displayed one and no local listener or custom link handler involved.

**Acceptance Scenarios**:

1. **Given** an unconnected desktop, **When** the user clicks "Connect to account," **Then** the
   desktop displays a short, readable, copyable code and opens the browser to the link page.
2. **Given** the link page with the user signed in, **When** they enter the displayed code and
   approve, **Then** the desktop transitions to "connected as <that user>" without further steps.
3. **Given** a user who is not yet signed in on the link page, **When** they open it, **Then** they
   are required to sign in (with their existing invitation-based account) before they can approve.
4. **Given** a pairing in progress, **When** the user declines approval or the code expires before
   approval, **Then** the desktop stays unconnected and clearly states the outcome.
5. **Given** a pairing in progress, **When** anyone other than the intended user submits the code,
   **Then** the desktop is **not** bound to that other account (at worst the code is consumed and
   the user retries).

---

### User Story 2 - Lock down the shared API (Priority: P2)

The operator wants the shared data API to stop serving anonymous callers, so curriculum data can
no longer be read or written without an account. Enforcement ships **behind a server flag that
defaults to off**. Once the connect-capable desktop release is out and users have updated, the
operator turns the flag on. From then on, anonymous requests to the shared data endpoints are
rejected, while logged-in web users and connected desktops continue to work unchanged.

**Why this priority**: This is the security payoff — it is what makes the web sign-in gate
meaningful and closes the open-API hole. It builds on US1 (clients must have credentials first),
and the default-off flag lets it deploy safely without breaking field devices on the wrong day.

**Independent Test**: With the flag off, confirm no behavior change. With the flag on, confirm an
anonymous request to a shared data endpoint is rejected, while an equivalent request carrying a
valid web session or a valid device credential succeeds.

**Acceptance Scenarios**:

1. **Given** enforcement is off (default), **When** any client calls the shared data API, **Then**
   behavior is exactly as today (no regression for web or desktop).
2. **Given** enforcement is on, **When** an anonymous request hits a shared data endpoint, **Then**
   it is rejected as unauthorized.
3. **Given** enforcement is on, **When** a logged-in web user or a connected desktop calls the same
   endpoint, **Then** it succeeds.
4. **Given** enforcement is on, **When** a user opens the sign-in page or an invitation-redemption
   link, **Then** those still work without being signed in.

---

### User Story 3 - Stay connected and keep working offline (Priority: P2)

A translator in the field expects the desktop to stay connected day to day and to keep working
when there is no internet. Once connected, the desktop stays connected across restarts and resumes
syncing automatically whenever it is online — no re-approval. When it is not connected (or has been
disconnected) it still works fully from its local cache; if it is online but cannot sync, it says
so plainly and offers to connect, rather than failing silently.

**Why this priority**: Persistence and graceful offline behavior are what make the feature usable
for the actual user (intermittent connectivity, repeated app launches). It is separable from the
pairing handshake itself and independently testable.

**Independent Test**: Connect a desktop, restart it, and confirm it is still connected and syncing
with no prompt. Separately, take an unconnected desktop offline and confirm full local use; bring
it online and confirm it surfaces a clear "not connected" state.

**Acceptance Scenarios**:

1. **Given** a connected desktop, **When** the app is closed and reopened, **Then** it is still
   connected and resumes syncing without asking the user to approve again.
2. **Given** an unconnected or disconnected desktop with no network, **When** the user works in the
   app, **Then** all locally cached content remains fully usable.
3. **Given** an unconnected desktop that is online, **When** it cannot sync because it has no
   credential, **Then** it clearly indicates it is not connected and prompts the user to connect.

---

### User Story 4 - Disconnect and admin revocation (Priority: P3)

A translator who is done with a shared computer clicks **"Disconnect"** to remove the connection
from that desktop. Separately, if a translator's laptop is lost or stolen, an **admin** can revoke
that user's device access from the admin area; the lost device loses API access the next time it
tries to reach the server. Revocation is keyed to the **user** (it cuts off all of that user's
connected devices at once); the user simply re-connects any device they still have.

**Why this priority**: This closes the lost-device security gap and gives users a clean exit, but
it is not needed to demonstrate the core connect + enforce value, so it lands after them.

**Independent Test**: Connect a desktop, click Disconnect, and confirm it returns to unconnected
and its credential no longer works. Separately, as an admin, revoke a user's device access and
confirm that user's connected desktop is rejected on its next online request.

**Acceptance Scenarios**:

1. **Given** a connected desktop, **When** the user clicks Disconnect while online, **Then** the
   desktop returns to unconnected, clears its local credential, and that credential no longer works
   against the server.
2. **Given** a connected desktop that is offline, **When** the user clicks Disconnect, **Then** the
   local credential is cleared immediately (server-side invalidation happens later, via expiry or
   admin revoke).
3. **Given** a user with one or more connected devices, **When** an admin revokes that user's device
   access, **Then** each of that user's devices is rejected on its next online request and must
   re-connect to regain access.

---

### Edge Cases

- **Code expires mid-flow**: the user takes too long to approve — the desktop stops waiting, says
  the code expired, and lets them request a new one.
- **Code reuse**: a code that has already been approved or consumed cannot be used again.
- **Wrong account approves**: if someone other than the intended user enters the code, the desktop
  must not silently bind to that account; the code is consumed and the real user retries.
- **Connected but credential revoked/expired server-side**: the next online request is rejected; the
  desktop must drop to a clear "not connected — please reconnect" state and keep working offline.
- **Enforcement flipped on while a field desktop is still unconnected**: that desktop can no longer
  sync until it connects; offline use continues from cache and it prompts to connect.
- **Network drops during polling**: the desktop keeps trying within the code's lifetime and reports
  if it ultimately could not complete.
- **Web client on a public/pre-login page**: must still reach sign-in and invitation redemption with
  enforcement on.

## Requirements _(mandatory)_

### Functional Requirements

**Code-based pairing**

- **FR-001**: The desktop app MUST provide a "Connect to account" action that displays a short,
  human-readable, **copyable** pairing code and opens the user's web browser to the device-link
  page.
- **FR-002**: The link page MUST require the user to be authenticated with their existing account
  (signing in if needed) before pairing can be completed.
- **FR-003**: The user MUST enter or paste the pairing code in the browser and **explicitly
  approve** connecting the device; the link and approval screens MUST follow the existing design
  system (consistency over novelty).
- **FR-004**: The desktop MUST learn the pairing result by **polling** the server. The flow MUST
  NOT require a loopback localhost server and MUST NOT require a custom URL scheme — the desktop
  makes only outbound requests.
- **FR-005**: On approval, the desktop MUST obtain a credential **bound to the approving user
  account** and transition to a connected state with no further user steps.
- **FR-006**: The pairing code MUST be **single-use** and **short-lived** (it expires). After
  decline or expiry, the desktop MUST remain unconnected, clearly indicate the outcome, and allow
  retry.
- **FR-007**: The desktop's polling secret MUST NEVER be exposed in the browser or in any URL, and
  a forged/cross-site request or a wrong party entering the code MUST NOT be able to bind the
  desktop to an unintended account (at worst it consumes the code).
- **FR-008**: The desktop MUST store its credential securely on the device and send it on shared-API
  requests so the server can identify the connected user.

**Shared-API authentication enforcement**

- **FR-009**: The server MUST be able to require authentication on the shared domain data API,
  controlled by a server-side **enforcement flag that defaults to OFF**.
- **FR-010**: When enforcement is ON, the server MUST reject **anonymous** requests to the shared
  data API as unauthorized, and MUST accept **both** a logged-in web session **and** a valid device
  credential.
- **FR-011**: Enforcement MUST NOT block the pre-login public surface — the sign-in flow and the
  anonymous invitation lookup/redemption endpoints MUST remain reachable without authentication.
- **FR-012**: When enforcement is OFF, the shared API MUST behave exactly as today (open), while
  still **accepting** valid device credentials and web sessions, so pairing can be exercised and
  verified before lockdown.

**Connection persistence & offline behavior**

- **FR-013**: A connected desktop MUST remain connected across app restarts and MUST automatically
  resume syncing when online, with no re-approval in normal use.
- **FR-014**: An unconnected or disconnected desktop MUST continue to work fully **offline from its
  local cache**; absence of a credential MUST NOT break offline use.
- **FR-015**: When an unconnected/disconnected desktop is online and cannot sync, it MUST clearly
  indicate it is **not connected** and prompt the user to connect, rather than failing silently.

**Lifecycle & revocation**

- **FR-016**: The desktop MUST provide a "Disconnect" action that clears its local credential and
  returns to the unconnected state; when online it MUST also invalidate that credential server-side
  (a self sign-out). When offline, it MUST clear the local credential immediately.
- **FR-017**: An **admin** MUST be able to revoke a **user's** device access (all of that user's
  device credentials at once) from the admin surface; a revoked credential MUST stop working on its
  next online request, after which the device must re-connect to regain access.

**Isolation & continuity constraints**

- **FR-018**: The desktop MUST obtain and use its credential by calling the server's auth endpoints
  over the network; server-only authentication code MUST NOT be imported into the isomorphic core
  or the desktop offline path.
- **FR-019**: The feature MUST NOT add third-party/social login and MUST NOT enable public sign-up;
  pairing authenticates against the existing invitation-based accounts only.
- **FR-020**: The desktop's existing language-code selection MUST continue to work unchanged
  alongside user authentication — the code selects the working language; the credential proves
  identity. (The two coexist; neither replaces the other.)

**Auditability**

- **FR-021**: Pairing approvals, desktop disconnects, and admin revocations MUST be recorded for
  audit and troubleshooting, consistent with existing authentication/invitation event logging.

### Key Entities _(include if feature involves data)_

- **Device pairing request**: a short-lived attempt to connect one desktop. Holds the pairing code
  (stored so it can be looked up without keeping the raw value), the desktop's polling secret
  (stored protected, never exposed to the browser), a status (pending → approved / declined /
  expired / consumed), the approving user once approved, and creation/expiry timestamps.
  Single-use.
- **Device credential**: the credential a desktop holds after a successful pairing. Bound to a
  single user, has an active/revoked state, is presented on shared-API requests to identify the
  connected user, and can be invalidated by the desktop (self sign-out) or by an admin (revoke the
  user's device access). A user may hold credentials for more than one device.
- **User** (existing): owns zero or more device credentials; an admin may revoke a user's device
  access. Pairing binds a device credential to the user who approved.
- **Enforcement setting** (server configuration, not stored domain data): whether the shared API
  requires authentication; defaults to off.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a fresh install, a translator can connect the desktop to their account in under 2
  minutes, entering a single short code, and then sync successfully.
- **SC-002**: In 100% of normal-use cases, restarting a connected desktop keeps it connected and
  resumes syncing with no re-approval.
- **SC-003**: With enforcement on, 100% of anonymous requests to shared data endpoints are rejected,
  while logged-in web users and connected desktops retain full function (zero loss of capability).
- **SC-004**: With enforcement off (default), there is no measurable change to existing web or
  desktop behavior (no regression).
- **SC-005**: After an admin revokes a user's device access, the affected device loses API access
  within one sync/poll cycle of its next online attempt.
- **SC-006**: An unconnected or disconnected desktop retains 100% of locally cached functionality
  offline, and when online surfaces a clear "not connected" prompt rather than a silent sync
  failure.
- **SC-007**: The sign-in page and the invitation-redemption link remain usable without
  authentication after enforcement ships.
- **SC-008**: An expired or already-used pairing code can never complete a connection (single-use,
  time-limited), and the user can always request a fresh code.

## Clarifications

### Session 2026-06-25

- Q: What is the goal line — give desktop a credential, or actually lock down the shared API? → A:
  Pair **and** enforce — establish the desktop credential **and** require auth on the shared
  `/api/*`, so anonymous clients are locked out.
- Q: How far does enforcement go — prove identity, or also restrict what each user may edit? → A:
  **Authentication only** in v1 (prove a real account is behind every request). Per-user /
  per-language authorization is deferred to a future feature.
- Q: How seamless should the pairing handshake be — typed code or no typing? → A: **Code-based**:
  the user enters/pastes a short code and the desktop polls. Loopback-localhost and custom-URL-
  scheme flows are explicitly rejected (most robust for a field tool — only outbound HTTPS).
- Q: How much device-lifecycle control in v1? → A: Pairing **persists** across restarts; the
  desktop can **Disconnect**; and device access is **revocable** server-side.
- Q: How does enforcement turn on without breaking field desktops? → A: Ship enforcement behind a
  **server-side flag that defaults to OFF**; the operator turns it on after the connect-capable
  desktop release is out.
- Q: Who can revoke a paired device, and at what granularity? → A: **Admin-only**, keyed **by
  user** (revokes all of that user's device credentials at once). No user self-service and no
  per-device management UI in v1.

## Assumptions

- This feature builds on `001-better-auth-migration` (accounts, sessions, `requireUser`) and
  `003-web-auth-gate` (the web client guard), and the branch is **stacked on `003-web-auth-gate`**
  per the stacked-PR convention.
- The desktop's network calls originate in the Electron main process (not a browser context), so a
  credential carried in a request header is unaffected by browser cross-origin rules.
- The pairing code, the desktop polling secret, and the device credential reuse the established
  invitation token approach (random secret → hashed for lookup → protected at rest).
- The device credential is a bearer-style, non-cookie credential, so it works from the desktop main
  process without a browser origin and is not vulnerable to cross-site request forgery.
- A user may connect more than one device; admin revocation is **per user** (it cuts off all of a
  user's devices at once — blunt but simple), and the user re-connects any device they still hold.
- Desktop "Disconnect" invalidates the device's own credential server-side when online (like a
  logout); offline it clears the credential locally and relies on expiry or admin revocation.
- Authentication, pairing, and revocation events are logged consistently with existing auth and
  invitation logging.
- The enforcement flag lives in server configuration (environment / secrets) and defaults to off;
  flipping it is an operator action, sequenced after desktop rollout.

### Deferred to Planning

- Exact pairing-code format and length; code and polling-secret expiry durations; poll interval and
  backoff; whether the desktop auto-opens the browser to the link page.
- The device credential's lifetime and renewal model (long-lived/auto-renewing vs. session-based)
  and its secure at-rest storage on the device.
- Whether to use a better-auth plugin (the device-authorization plugin is the natural fit, optionally
  with a bearer-token plugin) versus a bespoke pairing endpoint reusing the invitation token recipe.
- The exact set of shared `/api/*` routes that the enforcement gate covers, and confirmation that no
  pre-login web flow calls a gated route before authentication.
- How the single server-side gate accepts **both** a cookie session and a device credential, and how
  same-origin / CSRF checks interact (bearer credentials are CSRF-safe; cookies rely on same-origin).
- The precise admin surface for revoke-by-user (new endpoint vs. extension of existing admin user
  tooling) and how it locates a user's credentials.

## Security Considerations

### Known: User-code existence and status disclosure via `GET /api/auth/device`

**Status: Accepted, low severity.**

The unauthenticated status-lookup endpoint `GET /api/auth/device?user_code=<code>` (built into
better-auth's `deviceAuthorization` plugin for the browser verification page) acts as an existence
oracle for pending device-pairing codes: a valid-but-pending code returns `200 {"status":"pending"}`
while an invalid or expired code returns `400 {"error":"invalid_request"}`. No authentication is
required to call this endpoint.

**Why this is inherent**: The verification page the user visits in their browser must be able to
validate the code without the user being signed in yet (sign-in may happen on that page). The
endpoint is part of better-auth's standard RFC 8628-like flow and cannot be removed without forking
the plugin.

**Why the risk is low**:

- `POST /api/auth/device/approve` and `/deny` both require an authenticated session; an attacker who
  discovers a pending code cannot act on it.
- The pairing-code space is 8 uppercase alphanumeric characters (~2.8 × 10¹¹ combinations), codes
  expire after 10 minutes, and `/api/auth/device/code` (which mints new codes) is rate-limited to
  5 requests per IP per 60 seconds — brute-force enumeration is impractical.
- The disclosure is limited to: "this code exists and is pending." No user data is exposed.

**What is NOT done in v1**: The `GET /api/auth/device` status endpoint is not independently
rate-limited and does not require authentication. These are accepted tradeoffs given the low
practical impact.

**If a future operator requires tighter posture**: add a per-IP rate limit to
`GET /api/auth/device` (e.g. 20 req/min) at the Express layer, or gate the endpoint behind session
authentication (requiring the user to sign in before the code-entry form submits). Either change
closes the oracle but requires modifications to the better-auth plugin or a wrapping middleware.

---

## Out of Scope

- **Per-user / per-language authorization** (which user may edit which language) — future feature.
- **User self-service device management** and any **per-device listing, naming, or last-seen UI** —
  revocation is admin-only and keyed by user.
- **Third-party / social OAuth** and **public sign-up** — pairing uses existing invitation-based
  accounts only.
- **Loopback-localhost or custom-URL-scheme pairing** — deliberately rejected in favor of code +
  polling.
- **Changes to how the desktop selects a working language** (the 3-letter code stays) and **changes
  to invitation onboarding** or account types.
