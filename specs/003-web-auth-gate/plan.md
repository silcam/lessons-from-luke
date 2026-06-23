# Implementation Plan: Require Authentication on Web Content Routes

**Branch**: `003-web-auth-gate` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-web-auth-gate/spec.md`

## Summary

Gate every web route behind a logged-in user **on the web client only**, with a small,
default-deny route guard (`AuthGate`) inside the web-only `MainRouter`. A signed-out visitor
who requests a gated route is shown the existing sign-in page and, after authenticating, is
returned to the in-app route they originally requested (deep-link return-to), guarded against
open-redirect. The sign-in page and the invitation-redemption route (`/invitation/:token`) stay
on a public allowlist. The Electron desktop client (which renders `MainPage`, never
`MainRouter`) and the shared server `/api/*` data API are **untouched** — the guard is
structurally incapable of affecting them. This feature introduces **no new persisted data** and
**no server API changes**.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
React 16, React Router DOM `^6.30.0`, Redux Toolkit.
**Primary Dependencies**: Existing better-auth client (`authClient`), `currentUserSlice`
(`{ user: User | null, loaded: boolean, error }`), `loadCurrentUser` thunk, React Router v6
(`Navigate`, `useLocation`, `useNavigate`, `Outlet`), `react-redux`.
**Storage**: N/A — no new persisted data. Builds entirely on the in-memory Redux session state
already populated on mount by `loadCurrentUser()`.
**Testing**: Jest + React Testing Library (`renderWithProviders` with `MemoryRouter` from
`src/frontend/common/testHelpers.tsx`); Cypress E2E for the user-facing web flow. TDD is
mandatory (constitution Principle I): red-green-refactor for every unit.
**Target Platform**: Web frontend only (`src/frontend/web/`). Desktop and server explicitly
excluded.
**Project Type**: Web (isomorphic four-layer architecture). Change is confined to the
`frontend/web` layer.
**Performance Goals**: No measurable runtime cost; guard is a synchronous render-time decision
on top of already-loaded Redux state. No new network calls (session already fetched on mount).
**Constraints**:
- MUST NOT redirect an already-authenticated user during initial session load — wait for
  `currentUserSlice.loaded` before deciding (FR-010, SC-006; no redirect flicker).
- Return-to destination MUST be restricted to same-app relative paths; absolute/external URLs
  ignored, fall back to home (FR-008).
- MUST NOT add platform branching: the guard lives only in `MainRouter`, which desktop never
  imports (verified — see research.md R5).
- Default-deny: structurally protect the route subtree so new routes are gated automatically
  (FR-003).
**Scale/Scope**: Single guard component + one allowlist constant + one pure return-to
sanitizer + small edits to `MainRouter`, `PublicHome`, and the sign-in thunk path. ~5 source
files touched/created plus their co-located tests.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-22-web-route-authentication-requirements.md](../brainstorms/2026-06-22-web-route-authentication-requirements.md)

### Key Decisions Carried Forward

- **Web route guard, not server-side gating**: web and desktop are indistinguishable at the
  shared `/api/*` API, so honest server gating requires a desktop credential = future work. The
  client-side guard is the right-sized, honest step now.
- **Guard lives in `MainRouter` (web-only)**: desktop renders `MainPage` instead, so the gate
  is structurally incapable of affecting desktop — no platform flag needed.
- **Default-deny allowlist**: public = sign-in page + `/invitation/:token`; everything else is
  gated, and new routes are protected automatically.
- **Deep-link return-to**: shared `/translate/<code>` links and invite-then-translate flows
  depend on landing the user back where they intended after sign-in.

### Deferred Questions (resolved during planning)

- *Wait for `loaded` before deciding* → The guard reads `currentUserSlice.loaded`; while
  `false` it renders the existing `LoadingSnake` (the same loading affordance `MainRouter`
  already shows) and makes no redirect decision. Resolved (research.md R1).
- *Preserve/restore intended destination — router state vs. query param* → Use a `?returnTo=`
  query param on the sign-in redirect, sanitized to same-app relative paths. Chosen over
  React Router location-state because it survives a full page reload and is inspectable.
  Resolved (research.md R2).
- *Logout / mid-session expiry: active ejection vs. next-navigation* → Next-navigation only;
  no API 401 interceptor in this feature (the data API stays open). Resolved (research.md R3).
- *Confirm the shared non-admin home is acceptable* → Yes; differentiating the standard-user
  home is explicitly out of scope (spec Assumptions + Out of Scope). No follow-up filed here.
  Resolved (research.md R4).
- *Confirm desktop never imports `MainRouter`/the guard* → Confirmed by grep: only
  `webApp.tsx` imports `MainRouter`; desktop entry is `desktopApp.tsx` → `MainPage`. A guard
  test will additionally assert the allowlist/guard module is web-only. Resolved (research.md
  R5).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Test-First Development (NON-NEGOTIABLE) | PASS (planned) | Pure return-to sanitizer, allowlist membership, and `AuthGate` decision logic are all unit-testable with `renderWithProviders` + `MemoryRouter`. Cypress E2E covers the deep-link return-to flow. Red-green-refactor for every unit; aim for the standing 100% coverage aspiration (≥95% enforced). |
| II. Type Safety and Static Analysis | PASS (planned) | No `any`; explicit return types on every function; `type`-only imports for types; strict-boolean expressions (e.g. `loaded === false`, `user !== null`, not truthy checks). Allowlist is a typed `readonly` tuple. |
| III. Code Quality Standards | PASS (planned) | JSDoc on the exported `AuthGate`, the allowlist constant, and the `safeReturnTo` helper. PascalCase component, kebab-case domain concepts mirrored from the glossary. Import order preserved. |
| IV. Pre-commit Quality Gates | PASS (planned) | `yarn typecheck` + lint-staged (eslint --fix, prettier, jest --findRelatedTests) run on commit; never bypassed. Conventional commits. |
| V. Warning and Deprecation Policy | PASS (planned) | Zero new warnings; no deprecated APIs introduced (React Router v6 `Navigate`/`Outlet` are current). |
| VI. Layered Architecture and Dual Deployment Targets | PASS | Change confined to `src/frontend/web/`. `core` untouched (stays isomorphic). No `Persistence` involvement (no domain data). Desktop offline path and the shared API untouched (FR-012, FR-013). The guard's web-only placement *is* the architectural enforcement. |
| VII. Simplicity and Maintainability | PASS | YAGNI: no 401 interceptor, no new login UI, no new state source. KISS: one guard + one allowlist + one sanitizer. DRY: reuses existing `currentUserSlice`, `LoadingSnake`, `PublicHome`. |

**Initial gate**: PASS. No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-web-auth-gate/
├── plan.md          # This file
├── research.md      # Phase 0 output (decisions R1–R5)
├── quickstart.md    # Phase 1 output (verification walkthrough)
└── spec.md          # Feature specification (input)
# data-model.md and contracts/ intentionally OMITTED:
#   no new persisted data (spec Key Entities) and no server API changes (FR-013).
```

### Source Code (repository root)

```text
src/frontend/web/
├── MainRouter.tsx                    # EDIT: wrap gated routes in <AuthGate>; keep public routes outside
├── auth/
│   ├── AuthGate.tsx                  # NEW: web-only route guard (loaded-gate + redirect + return-to)
│   ├── AuthGate.test.tsx             # NEW: unit tests for the guard's decision logic
│   ├── publicAllowlist.ts            # NEW: named, typed public allowlist + isPublicPath() (default-deny)
│   ├── publicAllowlist.test.ts       # NEW: allowlist membership + default-deny tests
│   ├── safeReturnTo.ts               # NEW: pure same-app-path sanitizer (open-redirect guard)
│   ├── safeReturnTo.test.ts          # NEW: exhaustive sanitizer tests (absolute/protocol-relative/external)
│   └── authThunks.ts                 # EDIT: sign-in success navigates to sanitized returnTo (or "/")
└── home/
    ├── PublicHome.tsx                # EDIT: show contextual "Please sign in to continue" prompt when redirected
    └── PublicHome.test.tsx           # NEW/EDIT: prompt-rendering tests

cypress/integration/
└── web-auth-gate.spec.ts             # NEW (or extend existing): E2E deep-link return-to + allowlist
```

**Structure Decision**: All changes live in the web frontend layer (`src/frontend/web/`), the
only layer that renders `MainRouter`. The guard, allowlist, and sanitizer are co-located under
`src/frontend/web/auth/` alongside the existing `authClient.ts` / `authThunks.ts`, keeping the
authentication concern in one place. No `core`, `server`, or `desktop` files are touched, which
is what makes desktop and the shared API provably unaffected (constitution Principle VI).

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec gets a
> corresponding acceptance spec file created during `sp:05-tasks` under
> `specs/acceptance-specs/`. The files below are documented here; `sp:05-tasks` creates them.

| User Story | Acceptance Spec File | Scenarios |
| ---------- | -------------------- | --------- |
| US1: Sign-in required to use the web app | `specs/acceptance-specs/US01-sign-in-required.txt` | 3 |
| US2: Return to the requested page after signing in | `specs/acceptance-specs/US02-return-to-after-sign-in.txt` | 3 |
| US3: Public pages stay reachable without an account | `specs/acceptance-specs/US03-public-pages-reachable.txt` | 2 |
| US4: Desktop translators keep working without sign-in | `specs/acceptance-specs/US04-desktop-unchanged.txt` | 2 |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Notes on layer mapping** (for `sp:05-tasks`):
- US1, US2, US3 are verified primarily by component/integration tests
  (`renderWithProviders` + `MemoryRouter`) plus a Cypress E2E for the real deep-link reload of
  US2.
- US4 is a **non-regression assertion**, not new code: verified by a guard-module import-graph
  test (the allowlist/guard is web-only) plus the unchanged desktop suite
  (`MainPage.test.tsx`) and the unchanged server `/api/*` suites continuing to pass (SC-004,
  SC-005). There is no desktop code to write.

## Presentation Design

**Component Framework**: React 16 + the existing `base-components/` kit
(`MiddleOfPage`, `Heading`, `PDiv`, `Alert`, `Button`, `TextInput`), Redux Toolkit state,
React Router v6 navigation.
**Interaction Patterns**: Render-time route guard (`<AuthGate>` wrapping an `<Outlet/>` or the
gated element subtree); declarative `<Navigate to="/?returnTo=…" replace />` redirect;
post-sign-in `navigate(returnTo)` from the thunk-completion path.
**Accessibility Target**: WCAG 2.2 AA — consistent with `PRODUCT.md` accessibility goals. The
contextual prompt must be a real visible text element (not color-only), reusing the existing
`Alert`/`Heading` components.

### UI Decisions

| Screen / Component | User Story | Approach | Design Skills |
| ------------------ | ---------- | -------- | ------------- |
| Sign-in page "Please sign in to continue" contextual prompt | US1 | Reuse `PublicHome`; add a conditional `Alert`/sub-heading shown only when arriving via redirect (detected from the presence of a sanitized `returnTo`). No new screen. | `/design-clarify` (microcopy) |
| Loading affordance during session-load window | US1 | Reuse the existing `LoadingSnake` that `MainRouter` already shows while `loaded === false`; no new component. | — |

No genuinely new screens are introduced. The only user-visible change is one line of contextual
copy on the existing sign-in page (DESIGN.md / "Field Manual" register: clear, utilitarian).
The invitation and sign-in screens noted as "unfinished" in `CLAUDE.md` are **not** in scope to
restyle here.

### Quality Pass

**Design quality target**: MVP (this is a guardrail feature; one line of copy + reuse of the
existing kit, no new surface).
**Post-implementation refinement**: `/design-clarify` for the contextual prompt wording (ensure
it reads as "Field Manual" voice and is i18n-keyed like the rest of `PublicHome`). No
`/design-polish` pass planned — there is no new visual surface to polish.

## Applied Learnings

No entries in `.specify/solutions/` are relevant: the only catalogued solutions are in the
`tooling/` category (ralph/spec-kit harness issues), none touching React routing, auth guards,
or open-redirect handling. Section retained empty intentionally.

## Complexity Tracking

> No constitutional violations. This section is intentionally empty.
