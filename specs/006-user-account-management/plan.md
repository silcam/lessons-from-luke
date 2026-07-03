# Implementation Plan: User Account Management

**Branch**: `006-user-account-management` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-user-account-management/spec.md`

## Summary

Give administrators an admin-only web screen — the **Roster** — that lists every account and, from
it, changes a user's **Role** (promote/demote) and controls access (**Deactivate**/**Reactivate**,
**Force Sign-out**). Offboarding is a reversible `deactivatedAt` timestamp, never a hard delete, so
the `invitation.invitedBy` audit chain is preserved.

Technical approach: **hand-roll** endpoints under the existing `/api/admin/users*` namespace
(reusing `requireAdmin` + `requireSameOrigin`), backed by a pure DB-access `userStore.ts` and a
sibling `userValidation.ts` on the isolated `getAuthPool()` `pg.Pool` — the exact shape `002`
established for invitations. Add one nullable `user.deactivatedAt` column; derive Account Status from
it. Enforce deactivation at two points: a `databaseHooks.session.create.before` hook (blocks
sign-in) and an explicit `loadSession()` check (blocks in-flight sessions), with immediate
`DELETE FROM "session"` on deactivate. The last-admin invariant is enforced transactionally with
`SELECT … FOR UPDATE` over the active-admin set. Role changes need no session revocation because
better-auth's default-off `cookieCache` makes `getSession` re-read `user.admin` fresh each request.
The frontend mirrors `InvitationsList` (`createAsyncThunk` + `fetch` + local state). Desktop and the
isomorphic `core` are untouched.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-02-user-account-management-requirements.md](../brainstorms/2026-07-02-user-account-management-requirements.md)

### Key Decisions Carried Forward

- **Offboard by reversible Deactivate, not hard delete**: preserves the `invitedBy` RESTRICT FK,
  mirrors invitation soft-retain, is reversible, and still fully cuts access → constraint on
  Decision 1 (`deactivatedAt` column, no `DELETE FROM "user"`).
- **Keep the `admin` boolean as the Role model**: do not adopt the better-auth admin plugin's `role`
  string / `banned` columns → Decision 3 (hand-roll).
- **Separate sibling screen** at `/admin/users`, gated by `user?.admin`, a nav entry beside
  "Invitations" in `AdminHome`, built from the base-components kit + `Colors.ts` → Presentation
  Design below.
- **Two structural guardrails baked in**: never zero admins; never self-lockout → FR-004/FR-008,
  Decision 4.

### Deferred Questions (resolved during planning)

All six of the spec's "Deferred to Planning" items are resolved in
[research.md](./research.md) (Decisions 1–6). Alternatives already rejected in the brainstorm (admin
plugin, `disabled` boolean, hard delete) are recorded there so planning does not re-explore them.

### Scope Boundaries (explicit non-goals)

Hard delete; admin-initiated password reset; editing another user's name/email; a unified "People"
area; bulk actions/CSV/email notifications/OAuth/impersonation; any desktop-auth or domain-driver
change.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
**Primary Dependencies**: Express, better-auth 1.6.14 (isolated `pg`/node-postgres `Pool` via
`getAuthPool()`), React 16 + Redux Toolkit + styled-components, `pg`. Domain `postgres@1.0.2` driver
untouched.
**Storage**: Auth-owned `"user"`/`"session"` tables on the isolated `getAuthPool()` pool. One new
nullable column `user.deactivatedAt timestamptz`. No new tables. Domain data (`PGStorage`) untouched.
**Testing**: Jest unit (`*.test.ts`, real test DB via `loggedInAgent()`/`plainAgent()` + better-auth
CJS mock), Jest integration (`*.integration.test.ts`, real better-auth child server), Cypress web
E2E; ATDD acceptance specs in `specs/acceptance-specs/`.
**Target Platform**: Web/server only (Express + SPA). Desktop Electron path explicitly excluded.
**Project Type**: Web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`).
**Performance Goals**: Tens of accounts (spec Assumptions) — no pagination/search/sort. One extra PK
lookup per authenticated request for the deactivation check; negligible.
**Constraints**: Constitution Principle VI server-only exemption — auth infra MUST NOT leak into
`core` or the desktop path; domain `postgres@1` driver untouched. Guardrails enforced server-side and
race-safe under concurrency (FR-012). Same-origin on mutations; 401/403 admin gating (FR-010).
**Scale/Scope**: 1 migration, 3 new server modules (`userStore`, `userValidation`,
`usersController`), 2 auth touch-points (`auth.ts` hook, `requireUser.ts` check), 1 shared contract
type, 2 new frontend modules (`UsersList`, `usersListThunks`), + nav/route wiring, + test-isolation
delta. 4 user stories (P1×2, P2, P3).

## Presentation Design

**Component Framework**: React 16 + styled-components, from `src/frontend/common/base-components/`
(the same kit `InvitationsList` uses: `StdHeaderBarPage`, `Table`, `Button`, `Alert`,
`LoadingSnake`, `HelpText`, `FlexRow`/`FlexCol`, `Div`). Tokens from `Colors.ts`; Helvetica scale;
flat/no-shadow elevation.
**Interaction Patterns**: `createAsyncThunk` + `fetch` thunks with local component `useState` (mirror
`InvitationsList`); React Router route gated by `user?.admin`; inline two-step confirm for
consequential actions (mirror the invitation "Retract" confirm — FR-011).
**Accessibility Target**: WCAG 2.2 AA — consistent with `InvitationsList` (visually-hidden action
column header, `role="status"`/`aria-live` announcements, `role="alert"` on load errors, keyboard
-reachable confirm/cancel).

### UI Decisions

| Screen / Component                  | User Story | Approach                                                                                                                         | Design Skills     |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Users roster page (`UsersList.tsx`) | US1        | `StdHeaderBarPage` + kit `Table`: name, email, role, status, created; own row marked "You". Loading / load-error / empty states. | `/design-clarify` |
| Deactivate / Reactivate row action  | US2        | Row `Button` (red for deactivate); inline two-step confirm; disabled with reason on self-row and last-admin.                     | `/design-clarify` |
| Role promote/demote row action      | US3        | Row `Button`; inline two-step confirm on demote; disabled with reason for last-admin demote.                                     | `/design-clarify` |
| Force sign-out row action           | US4        | Row `Button`; inline two-step confirm; account stays Active.                                                                     | `/design-clarify` |
| "Users" nav entry (`AdminHome.tsx`) | US1        | `Link` + `Button` beside "Invitations", gated by `user?.admin`.                                                                  | —                 |

Copy (labels, confirm prompts, guardrail-refusal messages) goes through `useTranslation` i18n keys
(new `Users_*` keys), matching the `Invitations_*` key convention — hence `/design-clarify` for
microcopy on the refusal/confirm messaging.

### Quality Pass

**Design quality target**: Production (a utilitarian internal admin tool; consistency with the
existing invitation screens is the bar, per PRODUCT.md "The Field Manual").
**Post-implementation refinement**: `/design-audit` (verify parity with `DESIGN.md` and the
invitation screens), `/design-adapt` (roster table on narrow widths).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                  | Status | Notes                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-First (TDD, red-green-refactor)    | PASS   | Store/validation/controller/middleware and frontend thunks/components are unit-TDD'd; sign-in rejection + concurrency via the integration suite; user flows via Cypress + ATDD acceptance specs.                                                                                                                                   |
| II. Type Safety & Static Analysis          | PASS   | Explicit return types, no `any` (cast-with-comment only where `002` already does for body-parser/helmet types), `type` imports, shared `UserAccountRow` in `core/interfaces/Api.ts`.                                                                                                                                               |
| III. Code Quality (JSDoc, naming, imports) | PASS   | JSDoc on public store/validation/controller fns; names follow the Glossary (`Roster`, `Deactivate`, `Last-admin Guard`, …). Mirrors `invitation*` module layout.                                                                                                                                                                   |
| IV. Pre-commit Quality Gates               | PASS   | `yarn typecheck` + lint-staged (eslint/prettier/jest related) enforced; conventional commits; never `--no-verify`.                                                                                                                                                                                                                 |
| V. Warning/Deprecation Policy              | PASS   | Zero new warnings; no deprecated APIs introduced.                                                                                                                                                                                                                                                                                  |
| VI. Layered Architecture / Dual Targets    | PASS   | **Server-only exemption**: all new storage/logic lives in `src/server/auth/*` + `controllers/*` on `getAuthPool()`; only `UserAccountRow` (a plain response type) enters `core/interfaces/Api.ts` — no auth logic, no `pg`, no session handling in `core`. Desktop path and domain `postgres@1` driver untouched (FR-014, SC-008). |
| VII. Simplicity & Maintainability          | PASS   | Reuses `002` patterns verbatim; no new tables; role change needs no revoke (YAGNI); one nullable column; local component state, no new slice.                                                                                                                                                                                      |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/006-user-account-management/
├── plan.md              # This file
├── research.md          # Phase 0 — Decisions 1–6 (all "Deferred to Planning" resolved)
├── data-model.md        # Phase 1 — user.deactivatedAt, store ops, state model
├── quickstart.md        # Phase 1 — walkthrough + test entry points
├── contracts/
│   └── user-admin-api.yaml   # Phase 1 — OpenAPI for /api/admin/users*
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
migrations/
└── <Date.now()>-AddUserDeactivatedAt.js        # NEW: ALTER TABLE "user" ADD COLUMN "deactivatedAt" timestamptz

src/core/interfaces/
└── Api.ts                                        # EDIT: add UserAccountRow + /api/admin/users* route entries

src/server/auth/
├── auth.ts                                       # EDIT: databaseHooks.session.create.before (sign-in rejection)
├── userStore.ts                                  # NEW: listAccounts / changeRole / deactivateAccount / reactivateAccount / revokeSessions
├── userStore.test.ts                             # NEW: unit tests (RED first)
├── userValidation.ts                             # NEW: AccountRole/AccountStatus types + error classes (mirrors invitationValidation)
└── userValidation.test.ts                        # NEW
src/server/auth/
└── userAccounts.integration.test.ts             # NEW: sign-in rejection, live-session revoke, concurrent last-admin

src/server/middle/
├── requireUser.ts                                # EDIT: loadSession() deactivatedAt check
└── requireUser.test.ts                           # EDIT: deactivated session-load rejection cases

src/server/controllers/
├── usersController.ts                            # NEW: GET /users; POST /users/:id/{role,deactivate,reactivate,revoke-sessions}
└── usersController.test.ts                       # NEW
src/server/serverApp.ts                           # EDIT: mount usersController(app, getAuthPool()) after app.use("/api/admin", requireAdmin)
src/server/jestSetupAfterEnv.ts                   # EDIT: afterEach resets spared rows' deactivatedAt/admin (Decision 5)

src/frontend/web/users/
├── UsersList.tsx                                 # NEW: roster screen (mirrors InvitationsList)
├── UsersList.test.tsx                            # NEW
├── usersListThunks.ts                            # NEW: createAsyncThunk + fetch
└── usersListThunks.test.ts                       # NEW
src/frontend/web/home/AdminHome.tsx               # EDIT: "Users" nav link (user?.admin gated)
src/frontend/web/MainRouter.tsx                   # EDIT: user?.admin && <Route path="/admin/users" …>
src/frontend/common/i18n (locale files)           # EDIT: new Users_* keys
```

**Structure Decision**: Web application within the existing isomorphic four-layer tree. New auth
infrastructure lands in `src/server/auth/` and `src/server/controllers/` (server-only, on
`getAuthPool()`), mirroring the `invitation*` modules one-for-one. The only `core` touch is the plain
`UserAccountRow` response type in `interfaces/Api.ts` (no logic), preserving Principle VI. Frontend
lives in a new `src/frontend/web/users/` sibling to `web/invitations/`.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets an acceptance spec file created
> during `sp:05-tasks` under `specs/acceptance-specs/`, in the GWT format the acceptance pipeline
> consumes. Ralph's ATDD cycle depends on these existing before `US<N>` tasks run.

| User Story                                    | Acceptance Spec File                                    | Scenarios |
| --------------------------------------------- | ------------------------------------------------------- | --------- |
| US1: View the account roster                  | `specs/acceptance-specs/US01-view-account-roster.txt`   | 3         |
| US2: Deactivate and reactivate account access | `specs/acceptance-specs/US02-deactivate-reactivate.txt` | 5         |
| US3: Change a user's role                     | `specs/acceptance-specs/US03-change-role.txt`           | 4         |
| US4: Force sign-out without deactivating      | `specs/acceptance-specs/US04-force-sign-out.txt`        | 3         |

Scenario counts match the spec's Acceptance Scenarios per story (US1=3, US2=5, US3=4, US4=3).

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`.

## Security Considerations

_Added by `/sp:04-red-team` — adversarial hardening of the design._

### Fail-closed enforcement of deactivation (High)

Both deactivation enforcement points (data-model "Enforcement points") MUST fail **closed** — deny
access — when their `deactivatedAt` lookup **errors**, and never fail open:

- `auth.ts` `databaseHooks.session.create.before`: if the `SELECT "deactivatedAt"` throws (pool/DB
  error), let the error propagate so **no session is minted** and sign-in fails. Do **not**
  `try/catch`-and-continue; a swallowed error would let a deactivated user sign in and silently
  defeat FR-005.
- `requireUser.ts` `loadSession()`: the extra `SELECT "deactivatedAt"` MUST be written so that **any**
  failure (not just a non-NULL result) returns `null` / leaves `req.user` unset — an unresolvable
  deactivation check is treated as unauthenticated. A caught-and-ignored error here would let a
  deactivated user's in-flight session keep working.

Unit + integration tests MUST exercise the **error branch** (inject a query failure) and assert the
request is denied, so the fail-closed contract is regression-guarded — not only the non-NULL branch.

### Administrative action audit trail (Medium)

The feature exists to offboard **compromised or shared** accounts, yet the design records only
`deactivatedAt` (when, not by whom) and **nothing** for role changes or force-sign-out. After an
incident there is no way to answer "which admin deactivated / demoted / force-signed-out whom, and
when" — precisely the question this feature is meant to serve.

Mitigation (kept lightweight for a tens-of-accounts tool, consistent with Simplicity VII): each
mutating controller action emits a **structured server-side log line** — `action`, acting `adminId`,
target `userId`, outcome (`applied` / `refused-last-admin` / `refused-self`), timestamp. **No new
table or column** (stays within "no new tables"; durable audit-log persistence is explicitly deferred
as future work). The decision to log-only MUST be explicit rather than silently omitted.

### Compromised-admin blast radius (informational)

An attacker holding a single admin session can deactivate/demote every **other** admin — the
guardrails only prevent reaching **zero** admins and self-deactivation — concentrating control on the
compromised account. This is inherent to the admin role and not separately mitigable here, but it is
the strongest argument for the audit trail above and for keeping force-sign-out available to a
recovering operator.

### Reactivation restores the prior credential — "deactivate + re-invite" does NOT recover a compromised account (Medium)

The feature exists partly to offboard **compromised or shared** accounts (spec Overview / US2), and
the spec's Out-of-Scope defers admin password reset because "the practical need is covered by
deactivate + re-invite." Verified against `002`, that recovery path **does not hold** for the
compromised case:

- **Reactivation restores the _same_ credential.** `reactivateAccount` only sets
  `deactivatedAt = NULL`; the `account` credential row is untouched (data-model "Relationships").
  So the operator's natural mental model — "deactivate now, reactivate when cleared" — **re-exposes
  the compromised password** the instant the account is reactivated. An attacker who knew the
  password can sign in again.
- **Same-email re-invite is _blocked_.** `createInvitation` runs
  `SELECT 1 FROM "user" WHERE LOWER(email) = $1` and throws `AccountAlreadyRegisteredError`
  (`invitationStore.ts`). A reversibly-deactivated account still occupies its `"user"` row (that is
  the whole point of never hard-deleting — it preserves `invitedBy`). So re-inviting the **same
  email** to mint a fresh credential is refused. With hard delete and password reset both out of
  scope, there is **no in-scope path to rotate a compromised credential** for a returning user.

Mitigation (documentation only — no schema/interface change; does not reopen scope):

- The Deactivate confirm copy and/or roster helptext MUST distinguish the two offboarding intents.
  For a **departing** user, deactivate↔reactivate is the correct reversible flow. For a
  **compromised** credential, deactivation MUST be treated as effectively **permanent** — the
  account should **not** be reactivated (that restores the bad password), and re-onboarding the
  person requires a **different email** (same-email re-invite is blocked) until admin password reset
  ships. Use a distinct `Users_*` i18n note so the operator is not lulled into a false "reactivate
  later" recovery.
- Record explicitly that the spec's "deactivate + re-invite" rationale for deferring password reset
  covers only the **departed-user** case, not credential rotation for a compromised-but-returning
  user; that gap is the concrete driver for the deferred admin-password-reset work.

## Edge Cases & Error Handling

_Added by `/sp:04-red-team`._

### Self-demotion evicts the acting admin from the admin surface (Medium)

Self-**demotion** is permitted while another active admin remains, and a role change takes effect on
the affected account's **next request** (Decision 2). So the instant an admin demotes themselves,
their very next `/api/admin/*` call returns **403** and the roster screen they are standing on breaks.
Correct server behavior, jarring client experience.

Mitigation:

- The demote **confirm** copy on the self row MUST warn explicitly ("You will immediately lose
  administrator access") — a distinct `Users_*` i18n key from the generic demote confirm.
- On a successful self-demotion the client MUST navigate the operator to the non-admin home rather
  than re-fetching the roster into a 403/error state. `UsersList` detects `isSelf && role` now
  `'standard'` on the mutation response and redirects.

### Force-sign-out on one's own row evicts the acting admin (Low)

`revokeSessions(pool, targetId)` deletes **all** of the target's sessions with no self-exclusion, and
force-sign-out is **not** disabled on the self row (Presentation Design table). So an admin who
force-signs-out their **own** row deletes their current session — their very next request is
unauthenticated and they are bounced to sign-in mid-task. This is the force-sign-out analogue of the
self-demotion eviction above, which the prior pass covered only for demote.

Mitigation (client-side, mirrors the self-demotion handling; no server change):

- On the self row the force-sign-out **confirm** copy MUST warn that it signs the operator out here
  ("This will sign you out on this device") — a distinct `Users_*` i18n key from the generic
  force-sign-out confirm.
- On a successful self-targeted force-sign-out the client MUST redirect to the sign-in screen
  gracefully rather than re-fetching the roster into a 401/error state (mirror the self-demote
  redirect). Force-signing yourself out is a legitimate action (sign out all devices), so it is
  **not** disabled — only handled so focus/navigation is never dropped into an error state.

### Unexpected server / DB failures (Medium)

Guarded mutations run in a transaction; **any** error (lock timeout, connection drop, constraint
violation) MUST `ROLLBACK` and surface a generic **500** with no SQL, stack, or driver text in the
body (mirror `invitationController` error handling). The contract now documents a shared
`500 ServerError`. A **partial** mutation MUST be impossible: `UPDATE "deactivatedAt"` and
`DELETE FROM "session"` share one transaction, so a mid-op failure leaves the account fully Active
with its sessions intact — never a half-deactivated account.

### No-op guard refusals stay non-confusing

Idempotent no-ops (deactivate-already-deactivated, reactivate-already-active, revoke with zero
sessions) return **200** with the current row and MUST NOT error; guard refusals (`409 LAST_ADMIN`,
`409 SELF_DEACTIVATION`) leave the row **unchanged**. Tests MUST assert the no-ops return success, not
a 4xx (already specified in the state model; called out here so it is not lost in task generation).

## Accessibility Requirements

_Added by `/sp:04-red-team` — extends the Presentation Design "Accessibility Target"._

### Guardrail-disabled actions must convey _why_, accessibly (Medium)

Row actions disabled by a guardrail (Deactivate on the self row and on the last admin; Demote on the
last admin) MUST convey the **reason** programmatically, not via the `disabled` attribute alone (many
screen readers skip a bare disabled control silently). Use visible helptext / `aria-describedby` (or
an enabled control that explains the refusal) so a keyboard/screen-reader admin learns _why_ the
action is unavailable — e.g. "Cannot deactivate your own account", "Cannot demote the last
administrator". These reasons are `Users_*` i18n keys.

### Focus management across row-state changes

Deactivate↔Reactivate and Promote↔Demote swap a row's action control, and the inline two-step confirm
mounts/unmounts Confirm/Cancel. After a confirm resolves or is cancelled, focus MUST move
deterministically (to the resulting row action, or back to the trigger on cancel) so keyboard focus is
never dropped to `<body>`. The `role="status"`/`aria-live` region announces the outcome (already
planned).

### Status and role must not rely on color alone (WCAG 1.4.1)

Active/Deactivated status and the red Deactivate button MUST carry a **text** label, not color only.
Deactivated rows need a textual "Deactivated" marker in addition to any color treatment.

## Applied Learnings

Searched `.specify/solutions/`; its entries are all tooling/workflow solutions (ralph, acceptance
-spec routing, harness schemas) with no overlap to auth/security implementation. No applicable
learnings — section retained empty intentionally.

## Complexity Tracking

No Constitution Check violations — this section is intentionally empty.
</content>
