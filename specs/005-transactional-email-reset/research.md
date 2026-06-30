# Phase 0 Research: Transactional Email & Self-Service Password Reset

**Feature**: 005-transactional-email-reset
**Date**: 2026-06-30

This document resolves every "Deferred to planning" item from the spec (§Assumptions)
and the brainstorm (§Deferred to Planning), plus the open technical questions surfaced
while reading the existing auth/invitation code. Each decision is grounded in the
better-auth source actually vendored in `node_modules/` and the existing feature-001/002
patterns, not assumed behavior.

---

## D1 — Mailgun integration surface (SDK vs REST)

- **Decision**: Call the Mailgun REST API directly with the Node 24 global `fetch`. No
  `mailgun.js`/`nodemailer` dependency.
- **Mechanics**: `POST https://api.mailgun.net/v3/<domain>/messages`, `Authorization:
  Basic base64("api:" + apiKey)`, `Content-Type: application/x-www-form-urlencoded`,
  body fields `from`, `to`, `subject`, `text`, `html`. A non-2xx response or a thrown
  `fetch` error is a send failure.
- **Region**: the API base URL is configurable (`https://api.mailgun.net` default;
  `https://api.eu.mailgun.net` for EU domains) so an EU sending domain is a config
  change, not a code change.
- **Rationale**: YAGNI + Principle VII. One `fetch` call replaces an SDK plus its
  transitive dependency tree; no `yarn audit` surface added; nothing to keep current.
  Node 24 ships global `fetch`, already relied on elsewhere.
- **Alternatives considered**:
  - `mailgun.js` official SDK — rejected: a dependency and an API-key-in-constructor
    pattern for a single POST we can express in ~15 lines.
  - `nodemailer` + Mailgun SMTP — rejected: heavier, SMTP credentials are a second
    secret shape, and connection pooling/timeouts add operational surface we don't need
    for two low-volume transactional messages.
- **Testability**: `MailgunEmailTransport.send` is unit-tested by stubbing global
  `fetch` (assert URL, auth header, form body; assert throw-on-non-2xx). No live network.

## D2 — Secret / configuration field shape

- **Decision**: Add an optional `email` block to the `Secrets` interface
  (`src/server/util/secrets.ts`):

  ```jsonc
  "email": {
    "apiKey": "string",        // Mailgun private API key
    "domain": "string",        // verified sending domain, e.g. mg.example.org
    "fromAddress": "string",   // RFC-5322 from, e.g. "Lessons from Luke <no-reply@mg.example.org>"
    "baseUrl": "string"        // optional; default https://api.mailgun.net
  }
  ```

  The `defaultSecrets` block carries obvious placeholder values
  (`apiKey: "dev-only-replace-in-production"`, etc.) that production rejects.
- **Startup validation** (in `secrets.ts`, production-gated, mirroring the existing
  `cookieSecret`/`adminPassword`/`BETTER_AUTH_URL` guards): when
  `NODE_ENV === "production"`, throw a clear `Error` naming the missing/defaulted field
  if `secrets.email` is absent, or any of `apiKey`/`domain`/`fromAddress` is empty or
  equal to the placeholder. **Never** interpolate a secret value into the message —
  field names only (FR-004).
- **Rationale**: keeps all secrets in one validated structure (FR-004); the optional
  field means dev/test need no Mailgun credentials at all (the log/memory transport is
  selected by `NODE_ENV`, see D3), so local and CI stay frictionless.
- **Alternatives considered**: separate env vars per field (rejected — splits config
  across two mechanisms, `secrets.json` is the established home and already fail-fast
  validated); a top-level `mailgunApiKey` flat field (rejected — grouping under `email`
  keeps the provider swap localized).

## D3 — Environment-gated transport selection & the log transport

- **Decision**: A `getEmailTransport()` singleton (mirroring `getAuth()`/`getAuthPool()`)
  selects by `NODE_ENV`:
  - `production` → `MailgunEmailTransport` (D1)
  - `development` → `LogEmailTransport` (writes the fully rendered message + link to the
    console logger; transmits nothing) — FR-003
  - `test` → `MemoryEmailTransport` (an in-process `sentEmails: SentEmail[]` array tests
    assert on; also logs like `LogEmailTransport` so behavior matches dev) — FR-003
- A `setEmailTransport(t)` / `resetEmailTransport()` pair (mirroring `resetAuth()`)
  allows controller/unit tests to inject a fake and guarantees isolation.
- **Rationale**: identical shape to the auth singletons the codebase already trusts;
  selection is the only env-dependent line, everything else is a pure interface.
- **Failure semantics**: every transport's `send` resolves on success and **throws** on
  failure. Callers that must not surface failure to the user (password reset) wrap the
  call; callers that must report it (invitation create/resend) catch and convert to an
  `emailSent` boolean. See D6.

## D4 — better-auth password-reset wiring (verified against vendored source)

Source read: `node_modules/better-auth/dist/api/routes/password.mjs`,
`node_modules/better-auth/dist/context/create-context.mjs`.

- **`/request-password-reset`** (POST): looks up the user by email. **If the user does
  not exist it still returns `{ status: true, message: "If this email exists…" }`** and
  even simulates token generation + a dummy verification lookup to flatten timing — i.e.
  it is **enumeration-safe by default** (FR-007, SC-004 require no extra work). It then
  calls `emailAndPassword.sendResetPassword({ user, url, token }, request)` via
  `runInBackgroundOrAwait`.
- **`runInBackgroundOrAwait`** (no `advanced.backgroundTasks.handler` configured here)
  does `try { await promise } catch (e) { logger.error(...) }` — it **awaits and swallows**
  callback errors. So a throwing `sendResetPassword` cannot turn the 200 into a 500
  (FR-013 holds at the library boundary). We still catch inside our callback to emit a
  structured operator log.
- **`/reset-password`** (POST `{ newPassword, token }`): validates `newPassword` against
  `minPasswordLength`/`maxPasswordLength` (already `12`/`128` in `auth.ts`, FR-008),
  updates the credential, deletes the reset verification (single-use, FR-010/SC-006),
  calls `onPasswordReset` if set (D7), and **if `revokeSessionsOnPasswordReset` is true**
  calls `deleteUserSessions(userId)` (FR-009/SC-005).
- **`/reset-password/:token`** (GET): a redirect convenience only; it does **not** consume
  the token. We therefore build our own direct link (D5) and let the SPA call
  `/reset-password` straight, skipping this hop.
- **Decision (config additions to `getAuth()`)**:
  - `emailAndPassword.sendResetPassword` → builds + sends the reset email (D5).
  - `emailAndPassword.revokeSessionsOnPasswordReset: true` (FR-009).
  - `emailAndPassword.onPasswordReset` → sends the "password changed" notice (D7).
  - `emailAndPassword.resetPasswordTokenExpiresIn` → leave default (`3600` s = 1 h),
    matching the spec assumption; no reason found to tune.
- **Client surface**: `/api/auth/*` is already mounted via `toNodeHandler(getAuth())`, so
  no new server routes. The browser uses the better-auth client
  (`authClient.requestPasswordReset({ email, redirectTo })` and
  `authClient.resetPassword({ newPassword, token })`; `forgetPassword` is the deprecated
  alias). Exact client method name is confirmed at implementation against
  `better-auth/react` — it is derived from the same endpoint paths read above.

## D5 — Reset-link construction & routing into the SPA

- **Decision**: In `sendResetPassword`, build the link ourselves from the `token` arg:
  `${getWebAppBaseUrl()}/reset-password?token=${token}` — reusing the exact web-app-origin
  helper that invitation links already use (`getInvitationBaseUrl()` in
  `trustedOrigins.ts`; generalize/alias as `getWebAppBaseUrl()`). In production this is
  `BETTER_AUTH_URL` (web + API share an origin); in dev it is the webpack-dev-server
  origin (`:8080`), so the dev link lands on the SPA, not the API port.
- A new SPA route `/reset-password` renders the set-new-password form, reads `?token=`,
  and calls `authClient.resetPassword`. A new `/forgot-password` route renders the
  request form. Both are added to `MainRouter` alongside the existing public
  `/invitation/:token` route.
- **Rationale**: building our own link (a) keeps dev/test links pointing at the SPA, (b)
  avoids the extra `/reset-password/:token` redirect hop, (c) matches the established
  invitation-link pattern, keeping one base-URL helper as the single source of truth.

## D6 — Invitation auto-delivery & resend

- **Decision**: `createInvitation` (controller, POST `/api/admin/invitations`) stays the
  source of truth; after it returns the link, the controller sends the invitation email
  and adds `emailSent: boolean` to the 201 body. A send failure does **not** fail the
  request (FR-017): the invitation is created, the link is returned, `emailSent: false`.
- A new endpoint `POST /api/admin/invitations/:id/resend` re-derives the link from
  `getInvitationLink` (which already enforces pending-only via the derived-status rule and
  throws `NotPendingError`/`NotFoundError`), sends the email, and returns
  `{ emailSent: boolean }`. It carries `requireSameOrigin` (state-changing/side-effecting
  POST) and the existing per-IP `invitationRateLimit`, exactly like the create route.
- **Why the controller, not `invitationStore`, owns sending**: the store is the
  data/SQL layer (Principle VI server-only infra). Email is an I/O side effect orthogonal
  to persistence; keeping it in the controller mirrors how the store already returns the
  `link` and the controller decides response shape, and keeps the store unit tests pure.
- **Pending gate for resend** (FR-016, edge case "Resend… not available" for
  accepted/expired/retracted): enforced by reusing `getInvitationLink`'s derived-status
  `NotPendingError` → HTTP 409, plus the UI only renders the button for `pending` rows
  (same predicate as the existing Re-copy/Retract actions in `InvitationsList`).
- **Expiry unchanged on resend** (edge case): resend re-derives the *existing* encrypted
  token via `getInvitationLink` and does not touch `expiresAt`. Confirmed: `getInvitationLink`
  only decrypts `tokenEnc`; it issues no new token and runs no UPDATE.

## D7 — Optional "your password was changed" confirmation email

- **Decision**: **Include it.** Wire `emailAndPassword.onPasswordReset({ user }, req)` to
  send a short, link-free "your password was just changed — if this wasn't you, contact an
  administrator" notice via the shared transport.
- **Rationale**: notifying on credential change is a standard security control (out-of-band
  alert to the real account owner on takeover via a leaked reset link); the marginal cost
  is one pure message builder + one hook line, both already env-gated and testable. Worth
  the small cost per the spec's explicit "decide in planning" framing.
- **Failure handling**: best-effort; a send failure here is caught and logged and never
  affects the reset outcome (the password is already changed by the time the hook runs).

## D8 — Throttling thresholds & scope for forgot-password

- **Decision**: Use better-auth's existing DB-backed rate limiter (already
  `rateLimit.storage: "database"`, keyed on the non-spoofable `CF-Connecting-IP`), adding
  `customRules`:
  - `"/request-password-reset": { window: 60, max: 3 }` — tight, because each accepted
    request costs an email send + provider quota (FR-012, edge case "Reset request
    flooding").
  - `"/reset-password": { window: 60, max: 5 }` — defense-in-depth against token guessing
    (tokens are 24-char high-entropy ids, so this is belt-and-suspenders on top of the
    global limit).
- **Scope = per-IP/origin, not per-email.** Per-email throttling would need a new
  email-keyed store and, done naively, reintroduces an enumeration oracle (different
  behavior for known vs unknown addresses). Per-IP is consistent with the existing
  `/sign-in/email` rule and the FR-012 phrase "consistent with existing authentication
  rate limiting." Thresholds are one-line tunable.
- **Test note**: like the existing rules, these are enforced when `NODE_ENV !== "test"`
  unless `BETTER_AUTH_ENFORCE_RATE_LIMIT === "1"` (the integration server sets it), so the
  Cypress/unit suites aren't throttled.

## D9 — Test strategy for the log transport (capture + cleanup)

- **In-process (unit/controller)**: default test transport is `MemoryEmailTransport` with
  an exported `sentEmails` buffer; tests assert recipient/subject/body/link. Controller
  tests may instead `setEmailTransport()` a jest-fn fake. `jestSetupAfterEnv.ts` calls
  `resetEmailTransport()` (and clears `sentEmails`) in `afterEach`, exactly mirroring the
  existing `DELETE FROM "invitation"` cleanup, so no email leaks between tests.
- **Cross-process (integration)**: the integration server runs in a child process
  (`jestIntegrationGlobalSetup.ts`), so an in-memory buffer isn't visible to the test.
  - *Reset flow*: the test reads the reset token straight from better-auth's
    `verification` table (`identifier = 'reset-password:<token>'`) over the auth pool,
    rebuilds the link, and completes the reset — deterministic, no stdout parsing.
  - *Invitation flow*: the link is already in the create response and the resend response
    reports `emailSent`; no email capture needed.
- **E2E (Cypress)**: drives the SPA `/forgot-password` → reads the link the same way
  (verification table or the dev `LogEmailTransport` output) → `/reset-password` → sign in.

## D10 — Migrations

- **Decision**: **No new migration.** Reset tokens reuse better-auth's existing
  `verification` table (created by `1780760814404-AddBetterAuthTables`); session
  revocation deletes from the existing `session` table; rate limits use the existing
  `rateLimit` table (already populated because `rateLimit.storage: "database"`); the
  `invitation` table is unchanged (resend re-derives the existing token). The only schema
  touched is the `Secrets` *interface* (D2), which is not a DB migration.
- **Rationale**: the cheapest correct path; confirmed by reading the migration list and
  `jestSetupAfterEnv.ts`'s existing `DELETE FROM "verification"`/`"rateLimit"` cleanup.

---

## Carry-forward from brainstorm (rejected alternatives — do not re-explore)

- Hand-rolled reset flow — rejected in brainstorm in favor of better-auth's built-in
  `sendResetPassword`/`/reset-password` (less code, security-reviewed). Confirmed viable
  in D4.
- Removing the copyable invitation link in favor of email-only — rejected; the link +
  resend stay as resilience fallbacks (D6, FR-015/FR-017).
- Re-enabling public sign-up / adding an email-verification step / SMS — out of scope
  (spec §Out of Scope); not revisited.
