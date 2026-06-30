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
  and consider FR-012 satisfied, silently shipping half the requirement.
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
- **Mitigation**: confirm whether better-auth invalidates prior
  `reset-password` verification rows for a user on a new
  `request-password-reset`. If it does **not** (the likely default), enforce it
  in `sendResetPassword`: before/while issuing the new token, invalidate any
  existing un-consumed `reset-password:*` rows for that `user.id` so only the most
  recent link is live. Add a SUPERSEDED transition to the `data-model.md` state
  machine and an integration test that a first link returns `INVALID_TOKEN` once a
  second reset has been requested. (If better-auth genuinely cannot supersede,
  that is a spec deviation that must be raised, not silently accepted.)

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

## Complexity Tracking

> No constitution violations — section intentionally empty.
