# Implementation Plan: Transactional Email & Self-Service Password Reset

**Branch**: `005-transactional-email-reset` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-transactional-email-reset/spec.md`

## Summary

Introduce a single **server-only transactional email capability** (`EmailTransport`,
backed by Mailgun in production and a log/in-memory transport in dev/test) and use it for
two flows: (1) **self-service password reset** wired onto better-auth's built-in,
enumeration-safe `request-password-reset` / `reset-password` endpoints via `getAuth()`
options, and (2) **automatic delivery + resend of invitation links** layered onto the
existing feature-002 admin invitation endpoints. No new database table or migration is
needed: reset tokens reuse better-auth's existing `verification` table, session
revocation and rate limits reuse existing auth tables, and invitation resend re-derives
the existing encrypted token. Email-delivery config lives in `secrets.json` and fail-fasts
at startup in production, consistent with the existing `cookieSecret`/`adminPassword`/
`BETTER_AUTH_URL` guards.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: better-auth `^1.6.14` (built-in password reset via `getAuth()`),
`pg` `^8` (auth-owned `getAuthPool()`), Node 24 global `fetch` (Mailgun REST — **no new
dependency**), React 16 + styled-components + Redux Toolkit (frontend), Express
**Storage**: No new tables / no migration. Reuses better-auth auth-owned `pg.Pool` tables:
`verification` (reset token), `session` (revocation), `account` (new hash), `rateLimit`
(throttle), and the existing `invitation` table (unchanged). Domain porsager driver untouched.
**Testing**: Jest unit/controller (`*.test.ts`, mocked better-auth + injected
`EmailTransport`), Jest integration (`*.integration.test.ts`, real better-auth
child-process server; reset token read from `verification`), Cypress web E2E
**Target Platform**: Web (Express server + React SPA). **Desktop is not involved** and
sends no email (spec §Overview).
**Project Type**: Web (isomorphic four-layer; this feature touches only `server` + `frontend`)
**Performance Goals**: Not perf-sensitive; two low-volume transactional messages. Email
send is fire-and-forget for reset (awaited-and-swallowed by better-auth) and best-effort
for invitations.
**Constraints** (from spec + brainstorm Key Decisions, carried forward):
- Server-only email module; never imported into `core` or desktop (Principle VI exemption).
- Production fail-fast on missing/default email config; dev/test log the rendered email + link.
- Reset responses enumeration-safe (no account disclosure); reset is single-use,
  time-limited; successful reset revokes all other sessions; password policy 12–128 chars.
- Invitations keep the copyable link and gain resend; send failure never blocks creation.
- No public sign-up, no email-verification step, no SMS, no general notification system.
**Scale/Scope**: Small admin/translator user base; ~6 new server modules, ~4 new/edited
frontend modules, `getAuth()` + `secrets.ts` + `invitationController.ts` edits, i18n strings.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-29-transactional-email-and-password-reset-requirements.md](../brainstorms/2026-06-29-transactional-email-and-password-reset-requirements.md)

### Key Decisions Carried Forward

- **Both flows on one shared email module**: invitation auto-email is near-zero marginal
  cost once email exists → both in this feature (FR-014..FR-018 reuse FR-001 capability).
- **Use better-auth's built-in reset** (`sendResetPassword` / `/reset-password`) rather
  than hand-rolling: less code, security-reviewed, auth already owns this surface (research §D4).
- **Env-gated delivery with prod fail-fast**: mirrors existing secrets guards; keeps dev/CI
  frictionless without real mail credentials (research §D2, §D3).
- **Keep the link + add resend on invitations**: resilience against bounced/lost email;
  matches the utilitarian "Field Manual" register (research §D6).
- **Enumeration-safe reset responses**: confirmed default in better-auth source (research §D4).
- **Server-only constraint** is the constitution Principle VI exemption already used by
  better-auth + the invitation store.

### Deferred Questions (resolved during planning)

- Mailgun surface + secret shape → REST via global `fetch`; `secrets.email` block (research §D1, §D2).
- Reset routes/pages + `/api/auth/*` registration order → no new server route (better-auth
  owns the endpoints under the existing `toNodeHandler` catch-all); two new SPA routes
  `/forgot-password`, `/reset-password` (research §D5).
- Enumeration-safety of forget-password → enumeration-safe by default; no extra enforcement
  needed (research §D4).
- Optional "password changed" confirmation email → **included** via `onPasswordReset`
  (research §D7).
- Log-transport test strategy → `MemoryEmailTransport.sentEmails` for in-process tests
  (cleared in `jestSetupAfterEnv` `afterEach`); integration reads the `verification` table
  (research §D9).

## Presentation Design

**Component Framework**: React 16 + styled-components, Redux Toolkit thunks, React Router
(`MainRouter`). Reuses the existing base-component kit (`MiddleOfPage`, `Heading`,
`TextInput`, `Label`, `HelpText`, `Button`, `Alert`, `HandleKey`, `PDiv`) and the
`useTranslation` i18n hook — consistency over novelty (CLAUDE.md / PRODUCT.md "Field Manual").
**Interaction Patterns**: signed-out public routes mirror the existing `RedeemInvitation`
page state machine (loading / terminal-error-with-a-way-forward / form / success). Admin
resend mirrors the existing Re-copy/Retract row-action pattern in `InvitationsList`.
**Accessibility Target**: WCAG 2.2 AA, matching feature 002 (`role="alert"` / `role="status"`
+ `aria-live` announcements, focusable read-only fields, keyboard `onEnter` submit).

### UI Decisions

| Screen / Component                | User Story | Approach                                                                                                  | Design Skills        |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| "Forgot password?" link on sign-in | US1        | Add a text/link Button under the sign-in form in `PublicHome.tsx`; routes to `/forgot-password`           | `/design-clarify`    |
| Forgot-password request page (`/forgot-password`) | US1 | New `ForgotPassword.tsx`: email field → generic "check your email" confirmation (identical for any email) | `/design-clarify`    |
| Reset-password page (`/reset-password?token=`) | US1 | New `ResetPassword.tsx`: set-new-password form; state machine for invalid/expired token, policy error, success → "Continue to sign in" | `/design-clarify`, `/design-onboard` |
| Invitation create — email-failed notice | US2 | Extend `CreateInvitation.tsx`: when `emailSent === false`, show a warning Alert ("link created but email failed to send — copy it below") | `/design-clarify`    |
| Invitation "Resend email" row action | US2 | Extend `InvitationsList.tsx`: add a pending-only "Resend email" Button beside Re-copy/Retract; `aria-live` success/failure | `/design-clarify`    |

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**:

- `/design-audit` — verify the two new public pages and the two invitation edits match
  `DESIGN.md` tokens and the existing auth-screen register (the invitation screens are
  explicitly flagged in CLAUDE.md as not-yet-a-style-reference, so audit against
  `DESIGN.md`, not against the current invitation visuals).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Gate | Status |
| --------- | ---- | ------ |
| **I. Test-First (NON-NEGOTIABLE)** | TDD red-green-refactor for all new TS; 100% aspiration / 95% enforced; integration for cross-process reset; Cypress E2E for the user journey | **PASS** — email module (transport, message builders, config validation) is pure unit TDD; controller send/resend via injected fake transport; reset flow via integration (`verification` table) + E2E. Strategy in research §D9. |
| **II. Type Safety** | strict, explicit return types, no `any`, `type` imports, 0 warnings | **PASS** — new `EmailTransport`/`EmailMessage`/`EmailConfig` interfaces (contracts/); the one unavoidable `any` is confined to the existing `getAuth()` better-auth generic (already eslint-disabled). |
| **III. Code Quality** | JSDoc on public API, naming, import order, prettier | **PASS** — JSDoc on every exported transport/builder; PascalCase interfaces; follows existing `auth/`+`controllers/` conventions. |
| **IV. Pre-commit Gates** | typecheck + lint-staged + related tests green | **PASS** — standard pipeline; no bypass. |
| **V. Warnings/Deprecations** | none deferred; use only current APIs | **PASS** — uses current better-auth `requestPasswordReset`/`resetPassword` (not the deprecated `forgetPassword` alias); no deprecated calls. |
| **VI. Layered Architecture / server-only exemption** | email + auth infra server-only, never in `core`/desktop; no domain data bypassing `Persistence` | **PASS** — `src/server/email/` is server-only and imported only by `server`; it stores **no** domain data; reset tokens live in better-auth's already-exempt `verification` table. Squarely within the Principle VI v1.1.0 server-only infrastructure exemption. |
| **VII. Simplicity** | YAGNI/KISS/DRY | **PASS** — reuse built-in reset (no hand-rolled tokens), reuse the invitation store + base-component kit, **no new dependency** (global `fetch`), **no new table/migration**. |

**Initial gate: PASS.** No violations → Complexity Tracking left empty.

**Post-Phase-1 re-check: PASS.** The design adds interfaces + reuses exempt infra; no new
boundary crossings, no `Persistence` bypass for domain data, no added dependency.

## Project Structure

### Documentation (this feature)

```text
specs/005-transactional-email-reset/
├── plan.md              # This file
├── research.md          # Phase 0 — D1..D10 decisions (all deferred items resolved)
├── data-model.md        # Phase 1 — code-level types + reused auth tables
├── quickstart.md        # Phase 1 — operator/dev orientation
├── contracts/           # Phase 1
│   ├── auth-password-reset-api.yaml    # better-auth reset endpoints (behavioral contract)
│   ├── invitation-email-api.yaml       # create+emailSent / resend delta over feature 002
│   └── email-transport.contract.ts     # internal EmailTransport/EmailMessage/EmailConfig
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
src/server/
├── email/                              # NEW — server-only transactional email capability (FR-001)
│   ├── EmailTransport.ts               #   interface EmailTransport + type EmailMessage
│   ├── MailgunEmailTransport.ts        #   production: Mailgun REST via global fetch (D1)
│   ├── LogEmailTransport.ts            #   development: log rendered message + link (FR-003)
│   ├── MemoryEmailTransport.ts         #   test: capture into sentEmails[] (D9)
│   ├── getEmailTransport.ts            #   NODE_ENV-selected singleton + set/reset (D3)
│   └── messages/                       #   pure EmailMessage builders (unit-tested)
│       ├── passwordResetEmail.ts       #   reset link message (US1)
│       ├── passwordChangedEmail.ts     #   "your password was changed" notice (D7)
│       └── invitationEmail.ts          #   invitation link message (US2)
├── auth/auth.ts                        # EDIT — getAuth(): sendResetPassword, onPasswordReset,
│                                       #        revokeSessionsOnPasswordReset, rateLimit.customRules
├── auth/trustedOrigins.ts             # EDIT — add getWebAppBaseUrl() (alias of invitation base) (D5)
├── util/secrets.ts                     # EDIT — Secrets.email block + prod fail-fast validation (D2)
├── controllers/invitationController.ts # EDIT — auto-send on create (+emailSent), POST .../resend (D6)
└── jestSetupAfterEnv.ts                # EDIT — resetEmailTransport() in afterEach (D9)

src/core/interfaces/Api.ts              # EDIT — add emailSent to InvitationResult; resend route type

src/frontend/web/
├── home/PublicHome.tsx                 # EDIT — "Forgot password?" link → /forgot-password
├── auth/ForgotPassword.tsx             # NEW — request form (US1)
├── auth/ResetPassword.tsx              # NEW — set-new-password form, reads ?token= (US1)
├── auth/passwordResetThunks.ts         # NEW — authClient.requestPasswordReset / resetPassword
├── MainRouter.tsx                      # EDIT — /forgot-password, /reset-password routes
├── invitations/CreateInvitation.tsx    # EDIT — emailSent=false warning (FR-017)
├── invitations/InvitationsList.tsx      # EDIT — pending-only "Resend email" action (FR-016)
└── invitations/invitationsListThunks.ts # EDIT — resendInvitationEmail thunk

src/core/i18n/locales/{en,fr}.ts        # EDIT — new strings (reset + resend + email-failed)

cypress/integration/                    # NEW — forgot-password → reset → sign-in E2E (US1)
```

**Structure Decision**: Web application, isomorphic four-layer. This feature is confined to
the **server** and **frontend** layers plus shared i18n in `core`. The new email capability
lives entirely under `src/server/email/` (server-only, Principle VI exemption) and is never
imported by `core` or `desktop`. No new top-level directories; everything extends existing
feature-001/002 locations.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets a GWT acceptance spec
> file created during `sp:05-tasks` under `specs/acceptance-specs/`.

| User Story | Acceptance Spec File                                        | Scenarios |
| ---------- | ---------------------------------------------------------- | --------- |
| US1: Reset a forgotten password | `specs/acceptance-specs/US08-reset-forgotten-password.txt` | 6 |
| US2: Receive an invitation by email | `specs/acceptance-specs/US09-invitation-by-email.txt`      | 5 |
| US3: Safe, environment-aware email delivery | `specs/acceptance-specs/US10-environment-aware-email.txt`   | 3 |

(US numbering continues from the existing `specs/acceptance-specs/US01..US07` set.)

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Security Considerations

> Added by `/sp:04-red-team` (Pass 1). Adversarial hardening of the new email module
> and reset flow, beyond the header-injection guard already noted in `data-model.md`.

### Email-provider wire-format injection (Mailgun)

- The Mailgun REST body is `application/x-www-form-urlencoded` with fields
  `from`/`to`/`subject`/`text`/`html` (research §D1). The CR/LF guard in
  `data-model.md` stops SMTP **header** injection but does **not** stop Mailgun
  **form-parameter** injection: a field value containing `&`/`=` (e.g. an
  admin-typed invitee address `victim@x.org&bcc=attacker@evil.org`, or a
  mis-set `fromAddress`) can append unintended Mailgun parameters
  (`bcc`, `cc`, `o:tag`, a `from` override for phishing) if the body is built by
  string concatenation.
- **Mitigation**: `MailgunEmailTransport` MUST build the body with
  `URLSearchParams` (or equivalent percent-encoding) so every field value is
  encoded as a single opaque value and cannot introduce new parameters. Never
  hand-concatenate `key=value&` pairs. Add a unit test asserting that a value
  containing `&o:tag=` lands in the encoded body as data, not as a second field.

### Reset-token confidentiality (logs)

- A password-reset link embeds a single-use credential (the token). FR-013 and
  D7 require logging send **failures** for operators; the transports also log in
  dev/test (FR-003). The production failure path (the `sendResetPassword` /
  `onPasswordReset` catch in `auth.ts`, and any `MailgunEmailTransport` throw)
  MUST log only `to` + `subject` + the error — **never** the `text`/`html` body
  or the action link, so a reset token never lands in a production log aggregator
  or crash report. (The dev/test `Log`/`Memory` transports intentionally log the
  link per FR-003; that is acceptable because those environments never send real
  mail and the link targets a local SPA.)
- **Mitigation**: give the email module a single redaction-aware log helper used
  by every production error path; assert in a unit test that the token/link is
  absent from the production-failure log line.

### Reset-link construction trust boundary

- better-auth hands `sendResetPassword` both a prebuilt `url` and (via the
  client) an optional `redirectTo` (see the request schema in
  `contracts/auth-password-reset-api.yaml`). If the implementation ever used
  that `url`/`redirectTo` to build the emailed link, a caller-supplied
  `redirectTo` would poison the link's origin (reset-link / open-redirect
  poisoning) and turn a real reset email into a phishing vector.
- **Mitigation** (already the design intent in D5 — now made explicit and
  testable): the emitted link MUST be built solely server-side as
  `${getWebAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  ignoring the better-auth `url` arg and any client `redirectTo`. The
  contract is updated to state `redirectTo` is untrusted for link construction.

### Reset-token exposure in the SPA URL

- The token rides in `/reset-password?token=…`. helmet's default
  `Referrer-Policy: no-referrer` (confirmed in `serverApp.ts`) already prevents
  Referer leakage to any subresource. Residual exposure is browser history /
  shoulder-surfing / an accidentally-shared URL while the token is still live.
- **Mitigation**: `ResetPassword.tsx` reads `?token=` once into component state,
  then calls `history.replaceState` to drop the query string from the address
  bar; the reset page MUST NOT load cross-origin subresources while the token is
  present. (Single-use + ~1 h expiry already bound the window.)

### Email body content safety

- If an `html` body is rendered, the action link goes in an `<a href>` and any
  user-derived value (the invitee address shown in an invitation email) must not
  break out of its attribute/markup context and turn the email into a
  markup-injection / phishing surface.
- **Mitigation**: HTML-attribute-encode the href and HTML-escape any
  interpolated user-derived value in the `html` builder; keep the token
  URL-encoded in the query string. The `text` body stays plain (the link
  verbatim, per `data-model.md`).

### Timing side-channel account enumeration on reset request (Pass 2)

- FR-007/SC-004 make the `/api/auth/request-password-reset` **response body**
  identical for known and unknown emails. But the work behind it is not: for a
  **known** account better-auth generates a token, writes the `verification` row,
  and runs `sendResetPassword`; for an **unknown** email it short-circuits and
  returns immediately. The "Email-provider latency / hang" edge case below notes
  better-auth **awaits** `sendResetPassword`, so the response for a real account
  is delayed by the full transport round-trip (now bounded to ~10 s by the Pass 1
  timeout) while an unknown email answers instantly. That latency delta is a
  **timing oracle** that re-introduces the very account enumeration FR-007 closes
  in the body — a direct second-order interaction with the Pass 1 timeout
  mitigation.
- **Mitigation**: on the **reset path**, dispatch the actual `transport.send` as
  a **fire-and-forget background task** (not awaited by the request handler) so
  the endpoint returns in account-existence-independent time. The background task
  still applies the bounded timeout and the redaction-aware failure log (FR-013),
  but its latency never reaches the client. (If better-auth's
  `runInBackgroundOrAwait` cannot be forced to background, perform the send
  outside the awaited path — e.g. `void transport.send(...).catch(logRedacted)` —
  inside `sendResetPassword`.) This also **subsumes** the request-blocking half of
  the latency edge case *for the reset path*: that concern now applies only to the
  invitation create/resend path, which must await to populate `emailSent`. Add an
  integration assertion that the reset response time does not materially differ
  between a known and an unknown email.

### Email-provider latency / hang (request-blocking)

- Node's global `fetch` has **no default timeout**. better-auth's
  `runInBackgroundOrAwait` **awaits** `sendResetPassword`, and the invitation
  controller **awaits** the send before responding. A slow or hung Mailgun
  connection would therefore stall the user-facing forgot-password response and
  the admin's invitation-create/resend response until the OS socket timeout
  (potentially minutes) — a self-inflicted availability/UX failure on a flow
  whose whole point is a fast generic acknowledgement.
- **Mitigation**: `MailgunEmailTransport.send` MUST apply a bounded timeout
  (`AbortSignal.timeout(…)`, e.g. 10 s) and treat a timeout as a normal send
  failure (throw) — which the reset flow swallows (FR-013) and the invitation
  flow surfaces as `emailSent: false` (FR-017). Unit-test the timeout path with
  a stubbed never-resolving `fetch`.
- **Reconciliation (Pass 2)**: the Pass 2 timing-safety mitigation moves the
  **reset** send off the awaited request path (fire-and-forget), so this
  request-blocking concern no longer applies to the forgot-password response —
  the timeout there only bounds the background task. The **invitation**
  create/resend path still awaits (it must populate `emailSent`), so the bounded
  timeout remains its protection against a hung Mailgun connection.

### `onPasswordReset` confirmation email must not block or corrupt the reset response (Pass 4)

- The Pass 2 timing/latency analysis enumerated exactly **two** send sites and
  scoped them: the **reset-request** send → moved off the awaited path
  (fire-and-forget), and **invitation create/resend** → still awaited (it must
  populate `emailSent`). It never considered the **third** send site: the
  `onPasswordReset` "your password was changed" notice (D7), which better-auth
  invokes **inside the `/reset-password` request handler** *after* the password is
  already updated and all sessions are already revoked. As written, that send sits
  on the awaited reset-success path, so two distinct problems follow:
  - **Request-blocking on a success flow**: a slow or hung Mailgun connection
    delays the `/reset-password` 200 by up to the full Pass-1 ~10 s timeout, on a
    request that has *already succeeded* server-side and needs nothing from the
    confirmation email.
  - **Response that contradicts state**: research §D4 confirms better-auth swallows
    `sendResetPassword` errors via `runInBackgroundOrAwait`, but it does **not**
    confirm the same swallow for `onPasswordReset`. If the confirmation send throws
    and better-auth propagates it, the user would receive a 4xx/5xx **even though
    their password was changed and every session was revoked** — a confusing,
    lockout-adjacent failure where the error contradicts the actual account state.
- **Mitigation**: the `onPasswordReset` callback MUST (1) **self-catch** its own
  send so a failed or throwing confirmation email can never change the reset
  outcome — D7 already states this intent; pin it as a hard requirement, on par
  with the Pass-1 redaction guard — and (2) dispatch the confirmation
  `transport.send` **off the awaited response path** (fire-and-forget with the
  redaction-aware `.catch`, mirroring the Pass-2 reset send) so a slow provider
  never delays the reset-success 200. The bounded Pass-1 timeout still applies to
  the background send. Add a unit/integration assertion that a throwing or slow
  confirmation transport still leaves the `/reset-password` response a normal
  success. This is the **third** send site; the invitation create/resend path
  remains the only one that must await (it needs `emailSent`).

### Invitation resend as an email-bomb amplifier

- `POST /api/admin/invitations/:id/resend` carries only the existing per-IP
  `invitationRateLimit`. A malicious or compromised admin session can resend a
  single pending invitation repeatedly to flood the bound invitee's inbox (and
  burn provider quota) faster than per-IP limits intend, since one invitation can
  be resent over and over.
- **Mitigation**: add a per-invitation resend throttle (a small max-per-window
  keyed on the invitation id, in addition to the per-IP limit) so a single
  invitation cannot be weaponised as an inbox flooder; a throttled resend returns
  429. Documented in `contracts/invitation-email-api.yaml`.

### Per-address reset-request flooding — per-IP throttle is not enough (Pass 3)

- The reset path is currently throttled **per-IP only** (request schema in
  `contracts/auth-password-reset-api.yaml`: `customRules { window: 60, max: 3 }`).
  But FR-012 **and** the spec's named "Reset request flooding" edge case call for
  throttling repeated requests *"for the same address (or from the same origin)"*
  to limit email flooding and provider-quota abuse. better-auth `customRules` are
  keyed by **request path + IP** — the exact limitation already documented for the
  per-invitation resend throttle — so the per-IP rule alone does **not** bound
  requests for a single *address*. An attacker rotating IPs (or a botnet/proxy
  pool) can therefore drive repeated `request-password-reset` calls at a **known
  account holder's** address and flood that victim's inbox with reset emails while
  burning Mailgun quota/cost. This is the direct **reset-path twin** of the
  "Invitation resend as an email-bomb amplifier" finding that Pass 1 closed for the
  invitation path but left open here. Supersession (Pass 2) means only the newest
  link works, so the impact is **harassment + provider cost**, not token
  multiplication — but the protective *intent* of FR-012 and the edge case is still
  unmet, and `/sp:05-tasks` would otherwise implement only the per-IP `customRules`
  and treat FR-012 as satisfied, silently shipping half the requirement.
- **Mitigation**: add a **per-address** reset throttle reusing the *same* manual
  `rateLimit`-table check pattern Pass 2 pinned for the per-invitation resend
  throttle (synthetic key e.g. `reset-req:<normalizedEmail>`, small max-per-window,
  with the documented single-process in-process `Map`/LRU fallback). Perform the
  check **inside `sendResetPassword`** — which by design runs **only for accounts
  that exist** — so:
  - **Enumeration-safety is preserved**: an unknown email never reaches the
    throttle, and an over-limit known address still returns the *same generic 200*
    (the throttle simply suppresses the send, exactly like a failed send under
    FR-013); the response body never changes.
  - **Timing-safety is preserved**: the throttle check rides the **already
    backgrounded / fire-and-forget send path** (Pass 2), so it adds no latency to
    the request handler and creates no timing oracle.
  - Suppressing the email for an over-limit address is acceptable even though
    better-auth has already written the new `verification` row — supersession
    invalidates the prior row and the unused new token simply expires; it is never
    emailed.
  - The acceptable fallback (consistent with the per-invitation finding) is to
    **explicitly decide and document** that per-IP is the chosen scope and that the
    small admin-curated user base plus Mailgun's own sending limits and
    supersession are the accepted floor — but that decision must be *recorded*, not
    left implicit, so the per-address half of FR-012 is not silently dropped.
  - Whichever is chosen, state it in `data-model.md` (rateLimit) and
    `contracts/auth-password-reset-api.yaml`, and add an integration assertion that
    repeated same-address requests beyond the window stop producing sends while the
    response stays the generic, timing-safe 200.

### Superseded reset link must actually stop working (Pass 2)

- Spec §Edge Cases requires: "If a newer reset request is made, an older
  still-unused link is treated as no longer valid and rejected." But the
  `data-model.md` token model keys each reset token as its **own** `verification`
  row (`reset-password:<token>`) and only describes deletion on *successful
  reset*. As written, **two** un-consumed reset rows can coexist for one account,
  so an older link (e.g. one forwarded or left in an inbox) keeps working after
  the user requests a fresh one — contradicting the spec edge case and widening
  the single-use window an attacker can exploit. This gap is invisible in the
  current artifacts because nothing models supersession.
- **Mitigation (confirmed 2026-06-30)**: better-auth does **not** invalidate prior
  `reset-password` verification rows. `requestPasswordReset` calls
  `createVerificationValue` without any cleanup of existing rows for the same user.
  Our `sendResetPassword` callback MUST enforce supersession: inside the fire-and-forget
  background task, before sending, DELETE all non-expired `verification` rows for the
  user (`DELETE FROM "verification" WHERE "value" = userId` against `getAuthPool()`).
  With `verification.storeIdentifier: "hashed"` (the decision in `data-model.md`), the
  stored identifier is an opaque hash, so LIKE patterns on the identifier column are not
  viable — the `value = userId` filter is the correct mechanism. Reject any
  non-most-recent token at `/reset-password` validation time as the invariant backstop
  (per the Pass-5 atomic-supersession requirement in `data-model.md`). Add the
  SUPERSEDED transition to the `data-model.md` state machine and an integration test
  that a first link returns `INVALID_TOKEN` once a second reset has been requested.

### Where the per-invitation resend throttle counter lives (Pass 2)

- The Pass 1 per-invitation resend throttle introduced a new piece of **state**
  (a per-`{id}` counter) that the artifacts do not place. The hard "no new table /
  no migration" constraint plus better-auth's `rateLimit` rules being keyed by
  **request path + IP** (not by a route param) means there is no obvious home for
  a counter keyed on the invitation id, so the mitigation is currently
  under-specified for `/sp:05-tasks`.
- **Mitigation**: pin the storage explicitly. Preferred: reuse the auth-owned
  `rateLimit` table via a manual check in `invitationController` using a synthetic
  key (e.g. `resend:<invitationId>`), keeping "no new table" intact. Acceptable
  fallback given this app's single-process deployment: a bounded in-process
  `Map`/LRU, with the documented caveat that the throttle is per-process and
  resets on restart (the per-IP `invitationRateLimit` remains the durable floor).
  Whichever is chosen, state the mechanism in `data-model.md` so the task that
  implements resend builds the counter rather than discovering the gap.

### Fail-closed transport selection in production (Pass 2)

- `getEmailTransport()` selects by `NODE_ENV` (`production`→Mailgun,
  `development`→Log, `test`→Memory). The danger is the **misconfigured-but-running**
  case: a production deploy where `NODE_ENV` is unset or not exactly `production`
  would silently select `LogEmailTransport`, which writes the reset/invitation
  **link to the log and sends no mail** — a silent failure of the one flow whose
  entire purpose is recovery, and (worse) reset tokens landing in a prod log. The
  FR-002 startup fail-fast guards *missing config*, but a wrong-`NODE_ENV` selector
  can dodge it.
- **Mitigation**: make selection **fail-closed and config-driven**, not merely
  `NODE_ENV`-driven. Tie the production fail-fast and the Mailgun-transport
  selection to the **same predicate**: if `Secrets.email` is present/required,
  `getEmailTransport()` MUST return `MailgunEmailTransport` (and validation MUST
  have passed at startup); a `LogEmailTransport` must be unreachable whenever real
  email config exists. Add a unit test asserting that with production-shaped
  config present, the selected transport is the Mailgun one — never Log.

### Transactional email locale (signed-out / no-account recipients) (Pass 2)

- This is a translation product whose users and invitees are frequently **not**
  English speakers, yet both new emails go to recipients with **no usable locale
  signal**: the forgot-password requester is signed out, and an invitee has no
  account yet. The message builders (`passwordResetEmail`, `passwordChangedEmail`,
  `invitationEmail`) have no defined locale input, so they would silently hardcode
  English — a real first-touch usability gap for the product's core audience, and
  an under-specified builder signature for `/sp:05-tasks`.
- **Mitigation**: make the locale an **explicit, decided** input to the builders
  rather than an accident. At minimum, render against a single configured default
  locale consistent with the app's primary language and document that choice; if a
  per-recipient locale is desired (e.g. the requester's `Accept-Language`, or an
  invitation's intended language), pass it explicitly into the builder. Either way
  the builder signature must name a `locale` (or equivalent) parameter so the
  decision is visible and testable. (Full multi-locale email content can remain a
  deliberate follow-up, but the *seam* must exist now.)

### Suppressed-but-superseding reset request enables targeted denial-of-reset (Pass 5)

- This is a **second-order interaction between two prior mitigations** that each
  earlier pass reasoned about in isolation:
  - **Pass 2 supersession** invalidates a user's prior un-consumed
    `reset-password` token whenever a new `request-password-reset` is issued, so
    only the newest link is live.
  - **Pass 3 per-address throttle** *suppresses the email* for an over-limit
    address but explicitly accepts that better-auth "has already written the new
    `verification` row" and lets supersession invalidate the prior row, on the
    stated assumption that the prior row is "the unused new token [that] simply
    expires."
- That assumption has a blind spot. In the **targeted-victim** scenario the prior
  row is **not** the attacker's junk — it is the victim's *own legitimately-
  requested, actively-in-use* reset link. An attacker who only knows the victim's
  email can POST `request-password-reset` repeatedly from **rotating IPs** (the
  exact premise that motivated Pass 3): the per-IP `customRule` is bypassed by IP
  rotation, and the per-address throttle only suppresses the *email* — it does
  **not** stop better-auth from generating a fresh token and does **not** stop
  supersession from invalidating the victim's live link. Each suppressed-but-still-
  generated attacker request therefore **supersedes the victim's real link**, so
  that link is dead by the time the victim clicks it. While the attack is sustained
  the victim can **never complete a reset** — a remote, unauthenticated, indefinite
  denial-of-recovery that directly defeats SC-001 / FR-005 on the one flow whose
  entire purpose is recovery. Pass 3 actually cited supersession as a *mitigating*
  factor ("impact is harassment + provider cost, not token multiplication"); it is
  in fact the *amplifier* that turns harassment into denial-of-reset, and burns no
  provider quota (the sends are suppressed), so the attack is cheap.
- **Mitigation**: **couple supersession to an actual send, not to a mere request.**
  The Pass 2 supersession enforcement runs in *our* `sendResetPassword` callback,
  so we control the coupling: evaluate the Pass 3 per-address throttle **first**,
  and when it is over-limit (send suppressed) **do not** invalidate the user's prior
  un-consumed `reset-password` rows, and **delete the just-written new row** instead,
  so a suppressed flood request neither emails nor supersedes — the victim's live
  link survives and the just-created token does not even linger to expiry. Only a
  request that actually emails a new link may supersede the prior one. (If
  better-auth performs supersession *itself, before* the callback and it cannot be
  prevented, that is a design constraint that must be **raised, not silently
  accepted**: it would mean Pass 2's "if better-auth does not do this by default"
  branch is the only safe configuration, and we would additionally have to re-issue
  the victim's link or record the residual gap explicitly.) Add an integration test:
  a known address driven over the per-address window from rotating origins must
  **not** invalidate a separately-issued, still-live reset token for that account.

### Concurrent reset requests can leave two live tokens (supersession race) (Pass 5)

- The Pass 2 supersession enforcement (delete the user's prior un-consumed
  `reset-password` rows, then issue the new token) is **read-then-write** and not
  atomic. Two near-simultaneous *legitimate* `request-password-reset` calls for the
  same account can interleave so neither deletion sees the other's row, leaving
  **two** live tokens — the opposite of the supersession guarantee ("only the newest
  link works"). Impact is low (both links go to the same account holder's inbox) but
  it widens the single-use window the spec edge case ("Superseded reset link") means
  to close, and it is invisible in the current artifacts because supersession is
  modelled as a best-effort delete rather than an invariant.
- **Mitigation**: make supersession **authoritative rather than racy** — prefer
  enforcing it at *validation* time (on `/reset-password`, reject any
  `reset-password` row for the user that is not the most-recently-issued one) so the
  guarantee holds regardless of write interleaving; or perform the prior-row
  invalidation and new-row insert under a single transaction / conditional delete
  keyed on `value = user.id`. Record the chosen approach in the data-model
  SUPERSEDED transition so `/sp:05-tasks` implements supersession as a guarantee, not
  a best-effort delete.

### Account-conditional DB work re-opens the timing oracle (Pass 6)

- This is the **second-order effect of the Pass 5 mitigation itself**. Pass 2
  closed the enumeration timing oracle by moving the *network send* off the awaited
  request path, "so the endpoint returns in account-existence-independent time."
  But Pass 5 adds new work that lives in `sendResetPassword` and runs **only for
  accounts that exist**: the per-address throttle check, the conditional
  supersession decision, and (when suppressed) the delete of the just-written
  `verification` row — all DB round-trips. Pass 2 only ever backgrounded the *send*;
  it did not anticipate that supersession (Pass 2) and now the throttle/cleanup
  (Pass 5) would put **awaited DB work** on the known-account path. If
  `sendResetPassword` performs that DB work synchronously before returning, a
  known-account request again takes measurably longer than an unknown-email request
  (for which better-auth never calls `sendResetPassword` at all) — a residual timing
  oracle that partially re-opens the very enumeration Pass 2 closed, just with a
  smaller (local-DB rather than network) delta.
- **Mitigation**: make the Pass 2 background task the home for **all**
  account-conditional work, not just the send. `sendResetPassword` MUST return
  effectively immediately, scheduling the throttle check, the supersession decision,
  the row cleanup, **and** the send together into the fire-and-forget background
  task (each still inside the bounded timeout + redaction-aware `.catch`), so the
  synchronous request-handler path does identical, near-zero work regardless of
  whether the account exists. Extend the Pass 2 integration assertion (reset
  response time independent of account existence) to hold **with** the throttle and
  supersession logic active, not just with the bare send backgrounded.

### Mailgun open/click tracking leaks the live reset token to a third party (Pass 7)

- Every prior pass that reasoned about reset-token confidentiality scoped it to
  **our own** logs: Pass 1 redaction keeps the token out of *our* production
  failure logs, and the SPA `history.replaceState` (Pass 1) keeps it out of the
  address bar. No pass considered the **transport itself** as a place the token
  is retained. Mailgun domains can have **open tracking** and **click tracking**
  enabled, and when click tracking is on Mailgun **rewrites every link in the
  email** to route through its own redirector (`…mailgun.net/c/…`) and logs each
  click in its analytics. With tracking on, two distinct harms follow for the
  `/reset-password?token=` (and invitation) links:
  - **Live-credential leak to a third party**: the single-use reset token is
    embedded in the rewritten tracking URL and is therefore **stored in Mailgun's
    click-analytics** and passes through Mailgun's redirector — a live credential
    retained outside our trust boundary, exactly the confidentiality the Pass 1
    redaction work protects in our own logs but never extended to the provider.
  - **Link-integrity breakage**: click tracking rewrites the **HTML** link
    (default `htmlonly`) but not the `text` link, so the two bodies disagree, and
    the user's emailed link is no longer the verbatim app URL the design assumes
    (the `text`/`html` "link verbatim" rule in `data-model.md`). Open tracking
    additionally injects a tracking pixel into the `html` body.
  - (Note: this is **not** a token-consumption-by-prefetch problem — the reset and
    invitation links are SPA GET routes that consume nothing on load; the token is
    only spent by the subsequent POST. The harm here is third-party **retention**
    and link rewriting, not premature consumption.)
- **Mitigation**: `MailgunEmailTransport` MUST disable per-message tracking on
  **every** transactional auth send by setting the Mailgun form fields
  `o:tracking=no`, `o:tracking-clicks=no`, and `o:tracking-opens=no` (these
  per-message overrides win regardless of the domain's default tracking setting),
  so the emitted link is always the verbatim server-built URL and the live token
  never enters Mailgun's analytics. These are static fields set by the transport,
  not user-derived, so they compose cleanly with the Pass-1 `URLSearchParams`
  encoding. Add a unit test asserting the encoded body carries
  `o:tracking-clicks=no` (and friends) on every send. Documented in
  `data-model.md` (`MailgunEmailTransport` hardening).

### Redaction guard must bound the *provider error*, not just the body (Pass 7)

- The Pass 1 "reset-token confidentiality" mitigation says the production failure
  paths "log only `to` + `subject` + error — NEVER the `text`/`html` body or the
  action link." But it treats **`error` as inherently safe to log**, which has a
  blind spot: if `MailgunEmailTransport` builds its thrown error from the **raw
  Mailgun HTTP response body** (e.g. `throw new Error(\`Mailgun ${status}: ${await
  res.text()}\`)`), and that response echoes any submitted field, the redaction-
  aware logger faithfully logs an `error` that **transitively contains the body /
  the reset link** — re-introducing the very token-in-prod-logs leak Pass 1 closed,
  through the one value Pass 1 declared safe. This is a second-order gap in the
  Pass 1 mitigation itself.
- **Mitigation**: `MailgunEmailTransport` MUST construct its thrown/ logged error
  from a **bounded, structured** view of the provider response — the HTTP status
  plus Mailgun's own `message` field (which describes the validation error, e.g.
  "'to' is not a valid address") — and MUST NOT embed the raw response body or any
  echoed request field. The redaction-aware log helper therefore logs only the
  status + that bounded message + `to` + `subject`. Add a unit test that a Mailgun
  error response which **echoes the submitted `text`** (link included) produces a
  log line and a thrown error that do **not** contain the link/token. Documented in
  `data-model.md` (production error-log redaction).

### `fromAddress` must be validated to belong to the verified sending domain (Pass 7)

- FR-002/FR-004 fail-fast at startup if any `Secrets.email` field is missing,
  empty, or left at its placeholder default — but each field is validated **in
  isolation**. There is no **cross-field coherence** check that `fromAddress`
  actually belongs to the configured Mailgun `domain`. A real production footgun
  follows: an operator sets `domain=mg.example.org` (the verified, DKIM-signing
  domain) but `fromAddress=noreply@example.org` (the parent, or an unrelated
  domain). Every field passes the per-field guard, the server starts, and Mailgun
  accepts the send — but the message is **DKIM-signed for `mg.example.org` while
  the From: header is `example.org`**, so DMARC alignment fails at strict
  receivers and the reset/invitation email is **spam-foldered or rejected**. The
  user-facing flow still shows the generic "check your email" 200 (enumeration
  safety means we cannot tell them otherwise), so a locked-out user **silently
  never receives the reset email** — defeating SC-001 with no error anywhere. This
  is invisible today because validation is per-field only.
- **Mitigation**: extend the FR-002 startup validation in `secrets.ts` with a
  cross-field check that the domain part of `fromAddress` **equals, or is a
  subdomain of, the configured `domain`** (the standard DKIM/DMARC alignment
  rule), failing fast with a clear field-names-only error
  (e.g. "email.fromAddress domain does not match email.domain") if it does not.
  This stays within the existing fail-fast pattern (field names only, never
  values — FR-004). Documented in `data-model.md` (`EmailConfig` validation) and
  the `EmailConfig` contract.

### Per-address throttle key: normalization mismatch + at-rest enumeration oracle (Pass 8)

- This is a **second-order gap in the Pass-3 per-address throttle and the Pass-5
  supersession-coupling that depends on it.** Both pin the throttle on a synthetic
  key written as `reset-req:<normalizedEmail>`, but `normalizedEmail` is **never
  defined**, and the key embeds the **cleartext email**. Two distinct problems
  follow:
  - **Normalization mismatch defeats the throttle.** The per-address limit only
    bounds an attacker if its key collapses to the *same* value that better-auth
    uses to resolve the account inside `sendResetPassword`. If our key lowercases
    (or dot-folds) but better-auth's account lookup does not — or vice versa — then
    `Victim@x.org`, `victim@x.org`, `vic.tim@x.org` produce **different throttle
    keys for the same target**, so the Pass-3 flood limit and the Pass-5
    denial-of-reset coupling (which both *depend* on the throttle firing) are
    **bypassable by trivial case/dot variation**, re-opening the exact
    inbox-flooding and indefinite denial-of-reset the prior passes closed. The
    inverse (we normalize more aggressively than better-auth) **over-throttles** a
    legitimately distinct-cased account. The normalization is therefore
    **security-load-bearing** and must be a single defined function that provably
    matches better-auth's account-resolution normalization.
  - **The key is an at-rest account-existence oracle.** Because the per-address
    check runs **only inside `sendResetPassword`** — which by design runs **only
    for accounts that exist** (that is *why* it is enumeration-safe at the response
    layer) — a `reset-req:<email>` row materialises in the shared `rateLimit` table
    **only for real account holders**. Anyone who can read that table (a second
    admin, a DB backup leak, a future secondary SQLi) can then **enumerate which
    emails have accounts** by reading the keys — re-introducing at the persistence
    layer the very enumeration FR-007 / SC-004 close at the response layer.
- **Mitigation**: derive the throttle key as a **keyed hash** of the
  canonically-normalized email — `reset-req:<HMAC-SHA256(serverSecret,
  canonicalEmail)>` — never the cleartext address, so a table reader learns
  neither the address nor (without a brute-force of the address space against the
  secret) account existence. Define the canonical-normalization **once**, as a
  shared helper, and pin it to match better-auth's account-lookup normalization
  (verify against better-auth's behavior; if better-auth does not normalize case,
  neither may our key). Record both the keyed-hash construction and the
  normalization definition in `data-model.md` (rateLimit) and
  `contracts/auth-password-reset-api.yaml`. Add a test that two case/dot variants
  of one account's email hit the **same** throttle counter, and that the persisted
  key does not contain the cleartext address.

### Silent total email-delivery outage has no observability (Pass 8)

- The reset flow is engineered to be **deliberately silent on failure**, and the
  prior passes reinforced that silence from three directions at once: reset send
  failures are **swallowed** (FR-013), the request response is **enumeration-safe
  generic 200** (FR-007 + the Pass-2 timing work), and the confirmation-email
  failure is **self-caught** (Pass 4). The unintended aggregate is that a
  **systemic** email outage — a revoked/rotated Mailgun API key, a suspended
  account, an exhausted sending quota, or the unverified-domain / DMARC-misalignment
  case Pass 7 already showed is silently undeliverable — fails **every** password
  reset with **zero** signal to users and **no aggregate signal to operators**.
  SC-001 (self-service recovery) silently drops to **0%** and there is nothing
  defined to alert on; the only trace is the per-failure redaction-aware log line,
  which no requirement says anyone watches, and the per-invitation `emailSent:
  false` flag, which surfaces only to the one admin who happens to create an
  invitation during the outage. This is a **design-level requirement gap**, not an
  implementation detail: the design chose silence for security and never added the
  countervailing observability that a recovery feature needs.
- **Mitigation**: add a requirement that **every production email-send failure
  emits a distinct, structured, monitorable signal** — a dedicated log event /
  counter keyed by purpose (`reset` / `invitation` / `password-changed`) and outcome
  — that operations can alert on (e.g. "reset-email failure rate > 0 over N
  minutes"). This is the operability counterpart to the Pass-1 redaction guard:
  redaction governs *what* the failure line may contain (never the token/body); this
  governs *that* the failure is countable and alertable. Keep it a **seam + a
  requirement** at this stage (a structured failure event the email module always
  emits), not a specific alerting backend. Pairs naturally with the Pass-7 DKIM
  cross-field check as the two halves of "production cannot silently fail to
  deliver." (Caveat, red-team Pass 10: this "every failure is countable" guarantee
  covers *observed* send failures only — it cannot see a background send dropped by
  process death after the request returned; see the Pass-10 best-effort note below.)

### Reset-token confidentiality at rest in `verification` (Pass 8)

- Every prior confidentiality pass scoped the reset token to **transit and logs**:
  Pass 1 keeps it out of *our* production logs and the address bar, Pass 7 keeps it
  out of Mailgun's analytics. **No pass addressed the token at rest.**
  `data-model.md` models the token as `verification.identifier =
  reset-password:<token>` resolving (via `value`) to a `user.id`. If better-auth
  persists the **raw** token there, a DB-at-rest exposure (backup leak, read
  replica, a future secondary SQLi) yields **directly-usable account-takeover
  credentials** — each row hands an attacker a live reset token *and* the target
  `user.id`. That is a confidentiality **asymmetry** with feature-002, which
  deliberately stores invitation tokens **SHA-256-hashed for lookup + AES-256-GCM
  encrypted at rest** precisely so a DB leak yields nothing usable. The plan never
  states whether the reset token enjoys the same at-rest protection.
- **Mitigation (confirmed 2026-06-30)**: better-auth `^1.6.14` stores the **raw
  token** by default — `processIdentifier` with no `storeIdentifier` config returns
  the identifier unchanged, so `verification.identifier` holds
  `reset-password:<verificationToken>` in plaintext. **Decision**: enable
  `verification.storeIdentifier: "hashed"` in `getAuth()` in `auth.ts`. This
  SHA-256-hashes the identifier before storage; lookups and deletes hash the key
  transparently. A DB leak then yields `SHA-256("reset-password:<token>")` — not
  a usable credential. See `data-model.md` (verification, Token confidentiality at
  rest) for the supersession-delete implication (use `WHERE "value" = userId`, not
  a LIKE on the now-hashed identifier column).

### App-managed counters share better-auth's `rateLimit` table lifecycle (Pass 8)

- The Pass-2 (per-invitation) and Pass-3 (per-address) throttles both write
  **app-managed** synthetic-key rows into better-auth's **own** `rateLimit` table
  to honor "no new table." That table's schema, counting semantics, and
  cleanup/sweep are owned by better-auth, raising three coupling risks: (1) pruning
  of rateLimit rows could delete app counters mid-window; (2) the count/window
  semantics might not match; (3) key collision with better-auth's own
  `<ip>:<path>` scheme. **All three verified safe (2026-06-30)**:
- **Resolution**: (1) better-auth's DB adapter (`createDatabaseStorageWrapper`) never
  deletes rateLimit rows — no pruning concern; (2) `data-model.md` pins the exact
  schema (`key TEXT`, `count INTEGER`, `lastRequest BIGINT ms`) and the identical
  count/window UPSERT semantics (reset when window expired, increment otherwise),
  plus a TTL-cleanup DELETE the app issues itself; (3) better-auth's own keys are
  `<ip>:<path>` (e.g., `127.0.0.1:/sign-in/email`) — the `resend:` and `reset-req:`
  prefixes are collision-free since an IP address never begins with those strings.
  **The `rateLimit` table is authoritative**; the in-process `Map`/LRU fallback
  is retired. See `data-model.md` (rateLimit, Shared-table lifecycle coupling) for
  the complete pinned spec `/sp:05-tasks` implements against.

### The throttle-key HMAC secret must reuse a validated existing secret (Pass 9)

- This is the **second-order effect of the Pass-8 keyed-hash mitigation itself.**
  Pass 8 requires the per-address throttle key be
  `reset-req:<HMAC-SHA256(serverSecret, canonicalEmail)>` so the persisted key is
  not an at-rest account-existence oracle — but it never says **where
  `serverSecret` comes from**, and the entire oracle-protection rests on that secret
  being present and unpredictable. If `/sp:05-tasks` introduces a *new*
  `Secrets.email.hashKey` (or similar) it inherits the exact production footgun this
  feature exists to prevent: a missing / empty / placeholder-default HMAC key makes
  the throttle-key hash **predictable**, so a table reader could brute the small
  known-address space against a known/empty key and recover the at-rest enumeration
  oracle Pass 8 closed — and an *unvalidated* new secret would dodge the FR-002
  startup fail-fast entirely.
- **Mitigation**: do **not** add a new secret. Derive the HMAC key from an
  **existing already-validated secret** — reuse `cookieSecret` (already enforced
  ≥ 32 chars and startup-validated) via a **domain-separated** sub-key
  (e.g. `HMAC(cookieSecret, "reset-req-throttle")`), so the throttle key cannot be
  cross-used against session/cookie material. This keeps "no new secret," guarantees
  the key is present and strong because it rides the existing `cookieSecret` guard,
  and means a `cookieSecret` rotation merely resets throttle counters (a benign
  reset identical in effect to the Map/LRU restart caveat). Pin the source in
  `data-model.md` (rateLimit) so the implementing task wires the existing secret
  rather than inventing an unguarded one.

### App-managed `rateLimit` TTL cleanup must not clobber better-auth's own counters (Pass 10)

- This is the **second-order effect of the Pass-8 shared-table decision itself.**
  Pass 8 retired the in-process `Map`/LRU, made the auth-owned `rateLimit` table
  authoritative for both app throttles, and — because better-auth's DB adapter
  "never prunes the `rateLimit` table itself" — assigned the app a **TTL-cleanup
  DELETE** to stop indefinite row growth, pinned in `data-model.md` as
  `DELETE FROM "rateLimit" WHERE "lastRequest" < $windowStart`. That DELETE is
  **unscoped**: the same table also holds better-auth's **own** `<ip>:<path>`
  counters (the data-model itself notes the table is "already in use for
  `/sign-in/email`"). Pass 8 reasoned only about *whether* better-auth prunes
  (it does not) and about *key collision* (the prefixes don't collide) — it never
  considered that **the app's own cleanup would delete better-auth's rows**. Two
  harms follow, and the second is a security regression to an existing control:
  - **Premature reset of sign-in brute-force protection.** If the app runs the
    cleanup with a `$windowStart` derived from *its* short window (e.g. the 60 s
    `reset-req` window) on every reset/resend, it deletes **every** `rateLimit`
    row whose `lastRequest` is older than 60 s — including better-auth's
    `/sign-in/email` counter, whose lockout window is typically **longer**. A
    patient attacker who pauses just over the app's window between sign-in attempts
    would have better-auth's counter deleted out from under it on the next
    reset/resend traffic, effectively **neutering sign-in rate limiting** for a
    slow brute-force — a degradation of a pre-existing security control caused
    purely as a side effect of this feature's housekeeping.
  - **Cross-throttle premature deletion.** A single `$windowStart` shared by the
    `reset-req:` and `resend:` cleanups can also delete a still-active counter of
    the *other* app throttle when their windows differ.
- **Mitigation**: the TTL-cleanup DELETE MUST be **scoped to the app's own
  synthetic keys** and never touch better-auth's `<ip>:<path>` rows — e.g.
  `DELETE FROM "rateLimit" WHERE ("key" LIKE 'reset-req:%' OR "key" LIKE
  'resend:%') AND "lastRequest" < $windowStart` — and `$windowStart` MUST be
  computed from **the cleaned prefix's own window** (clean `reset-req:` rows
  against the reset window, `resend:` rows against the resend window), never a
  blanket cutoff. Better-auth owns the lifecycle of its own rows; the app prunes
  only what it created. Pin this in `data-model.md` (rateLimit) and add a test
  that an unrelated `<ip>:/sign-in/email` row survives the app's cleanup.

### `EmailMessage.to` recipient-list injection — comma fan-out survives `URLSearchParams` (Pass 10)

- This is a **blind spot in the Pass-1 Mailgun form-parameter mitigation.** Pass 1
  required `MailgunEmailTransport` to build the body with `URLSearchParams` so a
  value containing `&`/`=` cannot append a *new* Mailgun parameter (`bcc`, `cc`,
  `from` override). That reasoning closes **parameter injection** but overlooks a
  distinct vector that lives **inside a single field value**: Mailgun treats the
  `to` field as a recipient **list** and splits it on **commas**. A `to` value of
  `victim@x.org,attacker@evil.org` is percent-encoded by `URLSearchParams` to a
  single opaque `to=...%2C...` field — which Mailgun then decodes and **splits into
  two recipients**. Encoding therefore does **not** neutralize a comma; the email
  fans out to addresses the flow never intended. The exposure is bounded today
  because both `to` sources are upstream-validated single addresses (reset → the
  account's own email; invitation → feature-002's bound, validated invitee
  address), so this is **defense-in-depth** — but the Pass-1 finding explicitly
  claimed `URLSearchParams` fully closes Mailgun-field abuse, and the transport
  boundary that hands the value to Mailgun's comma-splitting `to` should not rely
  solely on upstream validators it does not own.
- **Mitigation**: validate `EmailMessage.to` at the transport/message boundary as
  **exactly one address** — reject any list separator (`,` and `;`) in addition to
  the existing CR/LF guard — so a multi-recipient value can never reach Mailgun's
  `to`. Documented in `data-model.md` (EmailMessage validation) and the
  `email-transport.contract.ts` `to` contract. Add a unit test that a `to`
  containing a comma is rejected (never sent).

### Backgrounded sends are best-effort and unobservable on process death (Pass 10)

- A residual limitation of the Pass-2/Pass-6 fire-and-forget design, surfaced now
  that Pass 8 added a "every send failure emits a monitorable signal" requirement.
  The reset-request send and the `onPasswordReset` confirmation send run as
  detached `void Promise…catch(logRedacted)` background chains after the request
  has already returned its 200. If the Node process is shut down (deploy, restart,
  crash) **after** the 200 but **before** the background send completes, the email
  is silently dropped — the user saw "check your email" but none arrives — and,
  unlike a transport failure, this produces **no** failure log and so the Pass-8
  observability signal never fires. There is no send queue or retry.
- **Mitigation (accepted limitation, plan-only)**: record this explicitly as an
  accepted best-effort boundary consistent with FR-013's swallow-on-failure
  posture — the user-facing remedy is simply to request another reset, and the tiny
  transactional volume makes a durable queue unwarranted (YAGNI). Note in the
  Pass-8 observability text that its "every failure is countable" guarantee covers
  *observed* send failures, **not** process-death drops of an in-flight background
  send. This is presentation/operations documentation only — no interface or
  data-shape impact.

## Accessibility Requirements

> Added by `/sp:04-red-team` (Pass 1). Extends the WCAG 2.2 AA target already
> stated under "Presentation Design".

### Autofill & password-manager support

- The three new/edited credential inputs must carry correct autocomplete tokens
  so password managers and assistive tech behave predictably and a freshly-reset
  user can save the new credential:
  - `ForgotPassword.tsx` email field → `autocomplete="email"` `inputmode="email"`.
  - `ResetPassword.tsx` new-password field → `autocomplete="new-password"`.
  - The sign-in password field (`PublicHome.tsx`, unchanged behaviour) →
    `autocomplete="current-password"` if not already set.
- Each field keeps an associated `<Label>` (not placeholder-only) and the
  policy-violation / invalid-token messages use the existing
  `role="alert"`/`aria-live` pattern already specified for these pages.

### Focus management & per-route titles on the new public routes (Pass 8)

- The Pass-1 a11y note covers `role="alert"`/`aria-live` for *messages*, but the
  two **new SPA routes** (`/forgot-password`, `/reset-password`) introduce
  client-side navigations and multi-state pages (loading → form → success /
  terminal-error) where a screen-reader user otherwise gets **no orientation**: SPA
  route changes do not move focus or update the document title the way a full page
  load would. Without explicit handling, focus stays on the link that was activated
  and the page identity is unannounced.
- **Mitigation**: on route entry **and** on each terminal state transition (success
  / invalid-or-expired-token), move focus to the result heading (the same treatment
  should be confirmed for the existing `RedeemInvitation` page the design mirrors),
  and set a **route-specific document `<title>`** (e.g. "Reset your password") so
  the page is identifiable in the tab list and to assistive tech. This is
  presentation-only (no interface or data-shape impact) and lives in
  `ForgotPassword.tsx` / `ResetPassword.tsx`.

## Complexity Tracking

> No constitution violations — section intentionally empty.
