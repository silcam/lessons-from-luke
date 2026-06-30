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

## Complexity Tracking

> No constitution violations — section intentionally empty.
