# Implementation Plan: Invitation System

**Branch**: `002-invitation-system` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-invitation-system/spec.md`

## Summary

Give administrators a self-service way to onboard people via **admin-issued, single-use,
email-bound sign-up links**. An admin creates an invitation (bound email + role), copies its link,
and pastes it into an email they send out-of-band (the system sends no email). The recipient opens
the link, sets a password and display name, and an account is created with the invitation's role —
**even though public sign-up is globally disabled** — then is directed to sign in. A second
admin-only screen lists, re-copies, and retracts invitations.

**Technical approach** (resolving the spec's "Deferred to Planning" items, detailed in
[research.md](./research.md)):

1. **Account creation despite `disableSignUp: true`** — a custom anonymous server endpoint inserts
   `user`+credential `account` rows directly on the isolated `pg.Pool`, mirroring the
   `SeedAdminUser` migration and `auth.integration.test.ts`'s `insertNonAdminUser` helper, hashing
   the password with the existing `passwordHasher.hash` (Argon2id). `auth.ts` is **not** modified.
2. **Token/link design** — 256-bit `randomBytes` token; store only its **SHA-256 hash**
   (`tokenHash`, unique) for lookup plus an **AES-256-GCM-encrypted** copy (`tokenEnc`, keyed off
   `cookieSecret`) so the admin can re-copy the *same* link without storing plaintext. Single-use +
   expiry enforced at lookup (`status='pending' AND expiresAt > now()`).
3. **Test isolation** — `DELETE FROM "invitation"` added to the `afterEach` in
   `jestSetupAfterEnv.ts` (it is written outside the porsager test transaction).
4. **Account fields** — recipient supplies the display name → `user.name` (NOT NULL); role → `user.admin`.
5. **Duplicate-pending rule** — a **partial unique index** on `LOWER(email) WHERE status='pending'`
   makes "one active invite per email" a DB invariant (concurrency-safe) while letting re-invite
   succeed once a prior invite is terminal.

All invitation storage is **server-only auth infrastructure** on the isolated connection
(constitution Principle VI); the domain `postgres@1` driver, `PGStorage`, `core`, and the desktop
app are untouched.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-17-invitation-system-requirements.md](../brainstorms/2026-06-17-invitation-system-requirements.md)

### Key Decisions Carried Forward

- **Bound-to-email invites (not generic links)**: strongest accountability; each invite has a known
  recipient and creator → meaningful management screen. (Constraint: `invitation.email` +
  `invitation.invitedBy`.)
- **Role chosen per invite**: an invite grants `admin` or `standard`; role is set on the invitation
  row and applied to `user.admin` at accept time, via direct SQL (the only way to set `admin`,
  since `auth.ts` sets the `admin` field `input: false`).
- **14-day fixed default expiry**: stored as an absolute `expiresAt`; system-wide constant, not
  per-invite (spec assumption).
- **Soft-retain Retracted/Expired**: terminal states are kept for audit (FR-019); no hard delete.
- **Re-copyable pending link returns the ORIGINAL link**: drives the `tokenEnc` encrypted-at-rest
  column (research Decision 2) rather than rotating the token.
- **Branch stacked on `001-better-auth-migration`** (unmerged): build on its `requireAdmin`,
  `user.admin` boolean, isolated `pg.Pool`, and Argon2id `passwordHasher`.

### Deferred Questions (resolved during planning)

- Account creation while sign-up disabled → **direct SQL insert** on the isolated pool
  (research Decision 1).
- Token design / hash-not-plaintext / table schema → **SHA-256 `tokenHash` + AES-GCM `tokenEnc`**,
  partial-unique-pending index (research Decision 2).
- Test isolation → **`DELETE FROM "invitation"` in `jestSetupAfterEnv.ts` afterEach** (research Decision 3).
- Account-creation fields / display name → **recipient-supplied `name` → `user.name`** (research Decision 4).
- Duplicate-pending mechanics & re-invite → **partial unique index scoped to `pending`** (research Decision 5).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
**Primary Dependencies**: better-auth 1.6.14 (server-only, isolated `pg` Pool), Express, `pg`
(node-postgres) for the auth pool, Node built-in `crypto` (randomBytes / sha256 / AES-256-GCM /
Argon2id via `passwordHasher`), React 16 + Redux Toolkit + React Router (web frontend),
`migrate` CLI with `migrations/_helpers.js`.
**Storage**: PostgreSQL. New auth-owned `invitation` table on the **isolated `pg.Pool`** (the same
connection better-auth uses). Domain data via porsager `postgres@1` through `Persistence` is
**untouched**.
**Testing**: Jest (`*.test.ts`, TDD) for controller/unit; `*.integration.test.ts` via
`yarn test:integration` (real compiled server, because better-auth is ESM-only); Cypress for web
E2E. Desktop Playwright suite unchanged.
**Target Platform**: Linux server (Express, Capistrano + Passenger). Web frontend only — desktop
Electron app is explicitly out of scope (FR-021).
**Project Type**: web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`).
**Performance Goals**: SC-001 create+copy < 1 min; SC-002 open→account < 2 min (human-paced, not
throughput-bound). Token lookup is a single indexed query.
**Constraints**:
- Server-only isolation (Principle VI): no invitation code in `src/core/` or the desktop path.
- `auth.ts` / better-auth config NOT modified; `disableSignUp: true` stays global (SC-008).
- Argon2id password hashing reused from `passwordHasher.ts` (consistent with seed + sign-in).
- Reuse existing `requireAdmin` gate (`/api/admin/*`) — no new authorization code (FR-020/SC-007).
- Store token hash, never plaintext (encrypted `tokenEnc` only for re-copy, keyed off `cookieSecret`).
- Link origin from `BETTER_AUTH_URL` (https-required in production by `secrets.ts`).
- New strings added as i18n keys; French may lag (spec Assumption).
**Scale/Scope**: small admin tool — a handful of admins, low invitation volume. 2 new admin
endpoints group (create/list/retract/re-copy), 2 anonymous endpoints (lookup/accept), 1 migration,
1 cleanup edit, ~2 web screens.

## Presentation Design

**Component Framework**: React 16 + the repo's `base-components` (Button, TextInput, Alert,
MiddleOfPage, Heading, PDiv, HandleKey, HeaderBar) + Redux Toolkit slices + React Router (same
stack as `PublicHome`/`AdminHome`). No DaisyUI in this codebase.
**Interaction Patterns**: Redux thunks calling the API (mirroring `authThunks.ts`); React Router
routes added to `MainRouter.tsx`; admin screen reached from the admin area, recipient screen at a
public `/invitation/:token` route.
**Accessibility Target**: match existing app conventions (labeled inputs, keyboard submit via
`HandleKey`); no formal WCAG level is tracked in this repo.

### UI Decisions

| Screen / Component                       | User Story | Approach                                                                                                   | Design Skills      |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Create-invitation form (email + role + copy-link result) | US1        | React form using `base-components` (TextInput, role select, Button); shows the generated link with a copy affordance; inline validation/error via `Alert` | `/design-clarify`  |
| Invitations management list (admin)      | US3        | Table/list of invitations with status, dates, creator; per-row Re-copy / Retract for Pending; empty state when none | `/design-onboard` (empty state), `/design-clarify` |
| Recipient redemption form (`/invitation/:token`) | US2        | Public page: pre-filled, locked email + password + display-name fields; submit → success → redirect to sign-in; generic non-leaky error for invalid links | `/design-clarify`, `/design-onboard` (first-run feel) |

### Quality Pass

**Design quality target**: MVP (internal admin tool; correctness and clarity over polish).
**Post-implementation refinement**: `/design-clarify` for the invalid-link and validation
microcopy (must be non-leaky, FR-010), and the empty-state copy on the management list. No
flagship polish pass planned.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Gate | Assessment |
| --- | --- | --- |
| **0. Fidelity to Reality** | No simulated progress; behavior matches spec | PASS — single-use/expiry/dup-pending enforced as real DB invariants + transactional accept, not just UI affordances. |
| **I. Test-First (TDD)** | Tests before implementation; 95%+ coverage; integration + E2E for cross-layer/UI | PASS (planned) — controller/helper unit tests (red-green-refactor), integration tests for the full ESM better-auth flow, Cypress E2E for both screens. See Acceptance Test Strategy. |
| **II. Type Safety** | strict + all flags, explicit return types, no `any`, `type` imports, 0 warnings | PASS (planned) — new server/frontend code is TS strict; role/status as string-literal unions; no `any`. The isolated pool follows the existing `pg.Pool` remap pattern. |
| **III. Code Quality** | JSDoc on public APIs; naming; import order; prettier | PASS (planned) — JSDoc on controller/helpers; PascalCase types; conventional structure. |
| **IV. Pre-commit Gates** | typecheck + lint-staged + related tests; conventional commits | PASS — standard pipeline; `/commit` skill used at end. |
| **V. Warnings** | zero tolerance | PASS (planned). |
| **VI. Layered Architecture / Server-only exemption** | domain data via `Persistence`; server-only auth infra may own its storage; isomorphic `core` & desktop untouched | PASS — `invitation` is auth infrastructure on the isolated `pg.Pool` (exemption explicitly covers this); **nothing** added to `src/core/` or the desktop path; domain driver untouched (FR-022, SC-009). |
| **VII. Simplicity** | YAGNI/KISS/DRY | PASS — reuses existing `requireAdmin`, `passwordHasher`, migration helper, and direct-insert pattern; rejects the heavier better-auth admin plugin and any cron job (research). |

**Result**: PASS — no violations. Complexity Tracking section omitted (nothing to justify).

One deliberate, justified nuance recorded for red-team: the `tokenEnc` (encrypted-at-rest token for
re-copy) is slightly more than the bare "store only a hash" instruction, but it is the minimum
needed to satisfy the product requirement that re-copy returns the *same* link (FR-016 +
spec assumption) without storing plaintext. The rotate-on-recopy alternative (drop `tokenEnc`) is
documented in research.md Decision 2 as the fallback if red-team prefers strictly-hash-only storage.

## Project Structure

### Documentation (this feature)

```text
specs/002-invitation-system/
├── plan.md              # This file
├── research.md          # Phase 0 — the 5 deferred decisions resolved
├── data-model.md        # Phase 1 — invitation table + user/account at accept
├── quickstart.md        # Phase 1 — end-to-end walkthrough + test commands
├── contracts/
│   └── invitation-api.yaml  # Phase 1 — OpenAPI for the 4 endpoint groups
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
migrations/
└── <timestamp>-AddInvitationTable.js     # NEW — invitation table + indexes (mirrors AddBetterAuthTables.js)

src/server/
├── auth/
│   ├── invitationTokens.ts               # NEW — generate token, sha256 hash, AES-GCM encrypt/decrypt
│   ├── invitationTokens.test.ts          # NEW — pure helper unit tests
│   ├── invitationStore.ts                # NEW — auth-pool data access (create/list/lookup/retract/accept)
│   ├── invitationStore.test.ts           # NEW
│   └── invitation.integration.test.ts    # NEW — full create→redeem→reuse/retract/expire on real server
├── controllers/
│   ├── invitationController.ts           # NEW — /api/admin/invitations* + /api/auth/invitation/*
│   └── invitationController.test.ts      # NEW — 401/403/201/409/410 controller tests
├── serverApp.ts                          # EDIT — mount invitationController (anon routes BEFORE /api/auth/* catch-all)
└── jestSetupAfterEnv.ts                  # EDIT — add DELETE FROM "invitation" to afterEach

src/frontend/web/
├── invitations/                          # NEW — admin create form + management list
│   ├── CreateInvitation.tsx (+ .test.tsx)
│   ├── InvitationsList.tsx  (+ .test.tsx)
│   └── invitationThunks.ts  (+ .test.ts)  # mirrors auth/authThunks.ts
├── auth/
│   └── RedeemInvitation.tsx (+ .test.tsx) # NEW — recipient /invitation/:token form
└── MainRouter.tsx                        # EDIT — add /invitation/:token (public) + admin invitations route

src/core/i18n/locales/
├── en.ts                                 # EDIT — new keyed strings (invitation UI)
└── fr.ts                                 # EDIT (optional) — French overrides may lag

cypress/integration/                      # NEW — E2E for issue + redeem + manage flows
```

**Structure Decision**: Web application within the existing isomorphic four-layer monorepo. Server
invitation logic lives under `src/server/auth/` and `src/server/controllers/` (server-only,
isolated pool — Principle VI). Frontend screens live under `src/frontend/web/` only (no `common/`,
no desktop). Migration follows the existing `migrations/` convention. **No files are added to
`src/core/` except i18n string keys**, and none to `src/desktop/` (FR-021/FR-022/SC-009).

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios will get an acceptance spec file
> created during `sp:05-tasks`, in `specs/acceptance-specs/`, in the GWT format consumed by the
> pipeline. Listed here for that phase to create.

| User Story                          | Acceptance Spec File                                       | Scenarios |
| ----------------------------------- | --------------------------------------------------------- | --------- |
| US1: Issue an invitation            | `specs/acceptance-specs/US06-issue-invitation.txt`        | 5         |
| US2: Redeem an invitation           | `specs/acceptance-specs/US07-redeem-invitation.txt`       | 5         |
| US3: Manage outstanding invitations | `specs/acceptance-specs/US08-manage-invitations.txt`      | 4         |

> Note: `specs/acceptance-specs/` already contains `US01`–`US05` from `001-better-auth-migration`.
> This feature's stories are numbered `US06`–`US08` to avoid filename collisions in the shared
> acceptance-specs directory. Scenario counts come from the spec's Acceptance Scenarios per story.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Applied Learnings

_Reviewed `.specify/solutions/`; its only entries are `tooling/` workflow-harness learnings (ralph,
spec-kit phases, Claude CLI) with no relevance to this feature's auth/postgres/migration/React
stack. The `security/`, `test-coverage/`, `clean-architecture/`, and `type-safety/` categories have
no solution files. No applicable preventions — section retained empty intentionally._

## Complexity Tracking

> No constitution violations — section intentionally empty.
