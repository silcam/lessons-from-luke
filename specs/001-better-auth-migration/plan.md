# Implementation Plan: Better-Auth Migration

**Branch**: `001-better-auth-migration` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-better-auth-migration/spec.md`

## Summary

Replace the placeholder authentication (a single hardcoded admin `chris`/`yo` compared in
**plaintext** with a `cookie-session` cookie, no `users` table, no hashing) with **better-auth**
email + password using **Argon2id** hashing, invitation-only (no public sign-up), a real boolean
`admin` capability gating `/api/admin/*` (401 anon / 403 non-admin / 200 admin), server-side
sessions, sign-out, and an idempotent migration that seeds the single admin from deployment
secrets. The auth backend owns its four tables (`user`/`session`/`account`/`verification`) through
its **own isolated `pg` (node-postgres) connection pool**, leaving the domain porsager
`postgres@1.0.2` driver and the `Persistence` data-access path completely untouched (constitution
Principle VI v1.1.0 server-only-infrastructure exemption). `User.id` becomes an opaque `string`;
that ripple lands in one cohesive commit so the whole-project typecheck stays green. The Electron
desktop client (per-translation access codes) is untouched.

**Technical approach** (validated against published packages — see [research.md](./research.md)):
pass a `pg.Pool` directly to better-auth's `database` option (it accepts a `PostgresPool`), using
better-auth's built-in Kysely adapter — **no Drizzle, no `drizzle-orm`, no `authSchema.ts`**
(supersedes the reference plan). Argon2id via `@noble/hashes@2` with the corrected v2
`.js`-suffixed import paths.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags); Node 24 (nvm,
`.nvmrc`). Migration runner files are plain CommonJS.
**Primary Dependencies**:

- **Add**: `better-auth@^1.6.14`, `pg@^8.21.0`, `@types/pg@^8.20.0`, `@noble/hashes@^2.2.0`.
- **Remove**: `cookie-session@^2.1.0`, `@types/cookie-session@^2.0.37`.
- **Unchanged (constraint)**: `postgres@^1.0.2` (porsager, domain driver — DO NOT bump),
  Express, body-parser, React 16, Redux Toolkit, `migrate` (npm runner).

**Storage**: PostgreSQL. **Two isolated drivers** post-migration:

- Domain data → porsager `postgres@1.0.2` via `Persistence`/`PGStorage` (unchanged).
- Auth tables → better-auth's own `pg.Pool` (new, isolated). Three runtime DBs unchanged
  (`lessons-from-luke` / `-dev` / `-test`).

**Testing**: Jest (unit, `--runInBand`, 95% coverage gate), `*.integration.test.ts` (real test DB,
CI `integration` job), Cypress (web `e2e`), Playwright+Electron (`desktop-e2e`).
**Target Platform**: Linux/macOS Node 24 server (Express, Capistrano+Passenger); auth is
**server-only** and never enters the isomorphic `core` runtime path or the desktop offline path.
**Project Type**: web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`).
**Performance Goals**: admin sign-in → admin functions in < 5s under normal conditions (SC-001).
**Constraints** (from spec + brainstorm Key Decisions, carried forward):

- Auth MUST own its storage through its **own isolated DB connection/driver**; MUST NOT alter or
  share the domain storage driver or its data-access path (FR-012, SC-007).
- Do NOT upgrade the domain `postgres@1` driver (Out of Scope).
- The `User.id: number → string` ripple MUST land cohesively in one commit (whole-project typecheck
  green — Principle IV gate).
- `cookieSecret` ≥ 32 chars; fail-fast on weak/missing config (FR-011); current default is 26 chars
  (must be replaced).
- No public sign-up; no OAuth; no password reset; no legacy `/api/users/*` shims; desktop untouched.
- 95% coverage threshold on new code (100% aspirational); zero ESLint warnings; conventional commits.

**Scale/Scope**: single admin account in this cut; ~25 files touched (2 new migrations, ~3 new
server files, ~6 server modifications, 1 core type, ~7 frontend files, ~4 cypress/config files).
No NEEDS CLARIFICATION remain.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-05-better-auth-migration-requirements.md](../brainstorms/2026-06-05-better-auth-migration-requirements.md)

### Key Decisions Carried Forward

- **Re-apply the existing plan, refreshed**: follow the reference implementation plan for product
  behavior, but refresh for drift and the pre-commit/CI/constitution gates; do not re-open product
  decisions.
- **Reconcile via the Principle VI amendment** (already DONE, v1.1.0, commit `a3dd2ca`): domain-scope
  the `Persistence` mandate; permit server-only auth infra to own its tables.
- **Isolate better-auth's DB driver**: use better-auth's own `pg`/Kysely path rather than Drizzle +
  postgres-js, because the domain layer is pinned to porsager `postgres@1.0.2` while
  `drizzle-orm/postgres-js` targets `postgres@3`. **This supersedes the reference plan's Drizzle
  adapter and likely drops `drizzle-orm` and `authSchema.ts`.** (Confirmed in research: pass a
  `pg.Pool` to better-auth's `database` option; no Drizzle at all.)

### Scope Boundaries (explicit non-goals, carried into plan)

OAuth/social login; email password-reset and email-verification flows; multi-role/RBAC beyond the
boolean `admin`; self-service invitation or user-management UI; any desktop auth change; legacy
`/api/users/*` compatibility shims; upgrading the domain PostgreSQL driver.

### Deferred Questions (resolved during planning — full detail in research.md)

- Exact isolated adapter → **native `pg.Pool` passed to better-auth `database`** (no Drizzle, no
  Kysely package; better-auth's built-in Kysely adapter handles it). Supports the `admin`
  `additionalField`. (research D1)
- `@noble/hashes` import drift → v2 requires **`.js`-suffixed** subpaths
  (`@noble/hashes/argon2.js`, `@noble/hashes/utils.js`); v1 paths fail. (research D2)
- Test session-row leakage → `afterEach` `DELETE FROM "session"`/`"verification"` on the auth pool;
  spare the seeded admin. (research D5)
- Coverage strategy for glue files → real unit/integration tests for behavior; justified
  `collectCoverageFrom` exclusions only for `auth.ts` config glue + web `authClient.ts`. (research D6)
- `BETTER_AUTH_URL`/cookie-origin → `baseURL` env-driven, defaults `:8081`; webpack proxies `/api`;
  fallback to `:8080` if cookies misalign. (research D8)
- `cookieSecret` minimum length → **verified current default is 26 chars**; add fail-fast ≥ 32 +
  update default/sample. (research D7)
- `User.id` ripple inventory → contained; `id: 1` literal exists in exactly one test file; desktop
  has zero references. (research D9)

## Presentation Design

**Component Framework**: React 16 + the repo's `base-components` (`TextInput`, `Button`, `Alert`).
**Interaction Patterns**: Redux Toolkit `currentUser` slice; form-submit sign-in on the public home.
**Accessibility Target**: maintain existing behavior (no regression); inputs keep placeholder labels.

This feature has **one** small user-facing change: the web sign-in form switches its first field from
**Username** to **Email** (FR-007). No new screens. The `AdminHome` log-out button already exists;
only its dispatch wiring changes. All other work is backend/auth infrastructure.

### UI Decisions

| Screen / Component                | User Story | Approach                                                                                          | Design Skills |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------- |
| Public sign-in form (`PublicHome`) | US1        | Rename `username` state → `email`; placeholder `t("Username")` → `t("Email")`; keep `Login failed` alert and failure handling (no enumeration) | —             |
| Admin log-out button (`AdminHome`) | US3        | Existing button; switch `usePush(pushLogout)` → plain thunk dispatch (no visual change)            | —             |

No DaisyUI, onboarding, or adaptive-layout work applies — this repo uses styled base-components and
the change is a single field rename plus a new `Email` i18n key (`en.ts`, `fr.ts`).

### Quality Pass

**Design quality target**: MVP (non-regression; preserve existing look and error UX).
**Post-implementation refinement**: None planned.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Evaluated against constitution **v1.1.0**.

| Principle                                         | Status   | Notes                                                                                                                                                                                                              |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Fidelity to Reality**                        | ✅ PASS  | Research verified every decision against actually-published packages and the real codebase, not the older reference plan. Drift (noble v2 paths, missing kysely export, 26-char secret) caught and corrected.       |
| **I. Test-First (TDD)**                           | ✅ PASS  | Unit tests precede impl for `passwordHasher`, `requireUser`/`requireAdmin`, `secrets` fail-fast, slice thunks, `PublicHome`. Integration test (`auth.integration.test.ts`) covers the DB-touching auth flows; Cypress covers the login flow. |
| **II. Type Safety & Static Analysis**             | ✅ PASS  | Explicit return types, no `any` (cast on better-auth handler only where the existing pattern already casts middleware — minimize, justify). Whole-project strict typecheck is the cohesion gate for the id change. |
| **III. Code Quality Standards**                   | ✅ PASS  | JSDoc on new public functions/types; import ordering; Prettier; conventional commits.                                                                                                                              |
| **IV. Pre-commit Quality Gates**                  | ✅ PASS  | `yarn typecheck` (whole project) + `lint-staged` (eslint/prettier/jest related). The `User.id` ripple is sequenced to land in one commit so typecheck never goes red. Never `--no-verify`.                          |
| **V. Warning & Deprecation Policy**               | ✅ PASS  | Removing `cookie-session` removes its surface; new deps resolved clean; address any deprecation/audit immediately.                                                                                                  |
| **VI. Layered Architecture & Dual Targets**       | ✅ PASS  | **Direct application of the v1.1.0 exemption**: auth is server-only, owns its tables via its own `pg.Pool`, never enters `core`/desktop, stores no domain data. Domain `Persistence`/`PGStorage`/porsager driver untouched. Desktop unchanged (US5). |
| **VII. Simplicity & Maintainability**             | ✅ PASS  | Dropping Drizzle (vs. reference plan) and using a bare `pg.Pool` is the simpler path (KISS/YAGNI). No speculative roles/UI.                                                                                          |

**Initial gate: PASS — no violations. Complexity Tracking is empty (omitted).**

**Post-Design re-check (after Phase 1): PASS — no new violations.** The Phase 0/1 design
_strengthens_ compliance rather than introducing complexity: choosing a bare `pg.Pool` over Drizzle
removes a dependency and a schema file (Principle VII), and routing auth through its own pool keeps
the domain `Persistence`/porsager path byte-for-byte unchanged (Principle VI exemption applied
exactly as written). The only `core` addition is the platform-agnostic `User` type. The 95%
coverage gate (Principle I) is met by real unit + integration tests, with only thin config glue
(`auth.ts`, web `authClient.ts`) excluded via justified `collectCoverageFrom` negations consistent
with the existing pattern — no `istanbul ignore` on real code paths.

## Project Structure

### Documentation (this feature)

```text
specs/001-better-auth-migration/
├── plan.md              # This file
├── research.md          # Phase 0 — all deferred questions resolved
├── data-model.md        # Phase 1 — auth tables + shared User type
├── quickstart.md        # Phase 1 — verification path
├── contracts/
│   └── auth-api.yaml    # Phase 1 — /api/auth/* + admin-gating contract
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
migrations/
├── _helpers.js                                  # UNCHANGED (porsager helper; reused for DDL only)
├── <unix-ms>-AddBetterAuthTables.js             # NEW  — DDL for user/session/account/verification (+indexes)
└── <unix-ms+1>-SeedAdminUser.js                 # NEW  — idempotent Argon2id admin seed from secrets

src/core/
├── models/User.ts                               # MODIFY — id: number→string; LoginAttempt username→email
└── i18n/locales/{en,fr}.ts                       # MODIFY — add "Email" key

src/server/
├── auth/
│   ├── passwordHasher.ts                         # NEW  — Argon2id hash/verify (@noble/hashes/argon2.js)
│   ├── passwordHasher.test.ts                    # NEW  — round-trip + format unit tests
│   ├── auth.ts                                   # NEW  — getAuth() factory (pg.Pool) + resetAuth()
│   └── auth.integration.test.ts                  # NEW  — sign-in/get-session/sign-out/401/403/200
├── middle/
│   ├── requireUser.ts                            # REWRITE — loadSession + requireUser/requireAdmin
│   └── requireUser.test.ts                       # REWRITE — 401/403/next via mocked getAuth
├── util/
│   ├── secrets.ts                                # MODIFY — adminEmail field; fail-fast (email/secret len)
│   ├── secrets.test.ts                           # NEW  — fail-fast branch coverage
│   └── sampleSecrets.ts                          # MODIFY — adminEmail + ≥32-char cookieSecret
├── controllers/usersController.ts                # DELETE (+ usersController.test.ts)
├── serverApp.ts                                  # MODIFY — toNodeHandler before bodyParser; requireAdmin; drop cookie-session/usersController
├── testHelper.ts                                 # MODIFY — loggedInAgent() POSTs /api/auth/sign-in/email
└── jestSetupAfterEnv.ts                          # MODIFY — afterEach cleanup of session/verification rows

src/frontend/
├── web/auth/authClient.ts                        # NEW  — better-auth/react client + inferAdditionalFields<admin>
├── common/state/currentUserSlice.ts              # REWRITE — thunks → authClient (getSession/signIn.email/signOut)
├── common/state/currentUserSlice.test.ts         # REWRITE — mock authClient; id: "u1"
├── web/home/PublicHome.tsx (+ .test.tsx)          # MODIFY — email field; pushLogin({email,password})
├── web/home/AdminHome.tsx                         # MODIFY — pushLogout via plain dispatch
└── web/MainRouter.tsx                             # MODIFY — loadCurrentUser via adapted load/useEffect

src/desktop/**                                     # UNCHANGED (verified zero auth references — US5)

cypress/
├── integration/login.spec.js                     # MODIFY — Email field; correct creds
└── support/commands.js                            # MODIFY — cy.login → POST /api/auth/sign-in/email

package.json                                       # MODIFY — add/remove deps (see Technical Context)
jest.config.js                                     # MODIFY — collectCoverageFrom exclusions for auth glue
CLAUDE.md                                          # MODIFY — adminEmail, BETTER_AUTH_URL, cookieSecret≥32, /api/auth/*
```

**Structure Decision**: Existing isomorphic four-layer web structure (`src/core` / `src/server` /
`src/frontend` / `src/desktop`) is retained. The new auth infrastructure lives entirely under
`src/server/auth/` and `migrations/`, honoring the server-only exemption — nothing auth-related is
added to `src/core` except the platform-agnostic `User` type (which carries no Node/DB concerns),
and `src/desktop` is untouched.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec gets an acceptance spec
> file created during `sp:05-tasks`, in `specs/acceptance-specs/`, in the GWT format consumed by the
> acceptance pipeline.

| User Story                                  | Acceptance Spec File                                     | Scenarios |
| ------------------------------------------- | -------------------------------------------------------- | --------- |
| US1: Administrator signs in securely        | `specs/acceptance-specs/US01-admin-signs-in.txt`         | 3         |
| US2: Admin-only areas are protected         | `specs/acceptance-specs/US02-admin-areas-protected.txt`  | 3         |
| US3: Administrator signs out                | `specs/acceptance-specs/US03-admin-signs-out.txt`        | 2         |
| US4: Invitation-only provisioning           | `specs/acceptance-specs/US04-invitation-provisioning.txt`| 4         |
| US5: Desktop translation is unaffected      | `specs/acceptance-specs/US05-desktop-unaffected.txt`     | 2         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`.

## Applied Learnings

No prior `.specify/solutions/` entries are relevant to this auth-migration design (the existing
entries are `tooling/` ralph/spec-kit workflow learnings and there is no `security/` solution yet).
Section omitted by design — nothing to apply.

## Complexity Tracking

> No constitution violations — table intentionally empty.
