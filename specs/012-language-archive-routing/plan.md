# Implementation Plan: Language Project Archiving and Detail-View Routing

**Branch**: `012-language-archive-routing` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-language-archive-routing/spec.md`

## Summary

Give admins a way to soft-delete ("archive") a language project — retaining all
translation data — but block archiving whenever another **active** language still
uses it as its source (`defaultSrcLang`), naming the dependents so the admin can
re-point them first. Independently, give the admin language **detail view** a real
routable URL (`/languages/:languageId`) so refresh, back/forward, and shared links
work.

Technical approach: add a single `archived boolean NOT NULL` column to
`languages` (default `false`); filter archived rows uniformly in both
`Persistence.languages()` and `Persistence.language()` so archived languages
vanish from every web picker, translating into them is rejected for free
(`TranslateHome` → `CodeError`), and mid-session tString saves are rejected for
free (`invalidCode` → 401); add a new `Persistence.archiveLanguage(languageId)`
method that locks the language row and runs the dependency check + flag-set in
one transaction, exposed via a new admin-only endpoint
`POST /api/admin/languages/:languageId/archive`; symmetrically validate
`defaultSrcLang` re-points against active languages (closes the archive/re-point
race and the dangling-reference hole — research D4); and drive `LanguagesBox`'s
selection from a new `/languages/:languageId` route (rendering `AdminHome`),
gating the archived/bogus redirect (a `replace` navigation) on the
load-completion flag. A reusable confirmation dialog is added to
`base-components`.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-22-language-project-deletion-and-url-management-requirements.md](../brainstorms/2026-07-22-language-project-deletion-and-url-management-requirements.md)

### Key Decisions Carried Forward

- **Soft delete (archive), not hard delete**: translation work (tStrings,
  progress, documents) is preserved in the DB; archived rows are hidden from active
  use. → constrains the storage model (D1) and read-path filtering (D2).
- **One-way from the UI (no restore)**: no un-archive endpoint/UI; the generic
  update endpoint's field allow-list prevents clearing `archived` (D3, INV-3).
- **Dependency block (not warning-and-allow)**: a dangling `defaultSrcLang` is a
  worse failure than a blocked action → server enforces the block atomically (D4/D5).
- **Route shape `/languages/:languageId`** matching the flat `/lessons/:id`
  pattern, not nested under `/admin/*` (D7).
- **Any language can be a source** (not just English); English gets no
  special-casing — it is blocked naturally whenever active languages depend on it.

### Scope Boundaries (explicit non-goals)

- No restore/un-archive UI.
- No route/state change for the Languages **list** page — only the **detail** view
  gains a route.
- No bulk archive.
- No new re-pointing UX — dependents are re-pointed via the existing per-language
  source-language picker; this feature only blocks and surfaces the dependent list.
- **Desktop sync propagation of archival is a non-goal** (research D9).

### Deferred Questions (resolved during planning)

- Storage representation of "archived" → boolean column, NOT NULL default false (D1).
- Where the dependency check lives → server-side, inside a transaction holding a
  lock on the target language row, mirrored by active-target validation on the
  `defaultSrcLang` re-point path; client pre-flight is UX-only (D4/D5).
- Confirmation UX → reusable yes/no confirm dialog in base-components, per
  DESIGN.md; typed-name confirmation not required (D10).
- List folded/selected state sync with the route → `LanguagesBox` reads the route
  param and auto-unfolds; redirect gated on load-completion (D6/D7).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: React 16 + Redux Toolkit, `react-router-dom` v6, Express, `postgres@1` (domain driver via `Persistence`)
**Storage**: PostgreSQL `languages` table (domain data → through `Persistence`, Principle VI); new `archived boolean` column via a `migrations/` file
**Testing**: Jest (unit/integration, TDD), Cypress (web E2E) — Principle I
**Target Platform**: Web (Express + React); admin-only surface. Desktop/Electron unaffected (non-goal D9)
**Project Type**: Web application — isomorphic four-layer (`core`/`server`/`frontend`/`desktop`)
**Performance Goals**: Interactive admin action; archive completes < 30s start-to-finish without engineering help (SC-001)
**Constraints**: Server is source of truth for the dependency check — check + archive MUST be atomic via a transaction locking the target language row, with the `defaultSrcLang` re-point path validating against active languages under the same lock discipline (spec line 116, D4). Archived rows invisible to every web picker (INV-1). Strict type safety, zero ESLint warnings, 95% jest coverage gate
**Scale/Scope**: Small admin dataset (tens of languages). Changes span `core` model, `server` controller/storage + migration, `frontend` router/box/base-component

## Presentation Design

**Component Framework**: React 16 + the repo's `src/frontend/common/base-components/` kit (`Button`, `Div`, `Heading`, `Foldable`, `List`, `LinkButtonRow`), styled per `DESIGN.md` (flat / no-shadow elevation, `Colors.ts` palette, Helvetica scale)
**Interaction Patterns**: Redux Toolkit state (`languageSlice`), `react-router-dom` v6 navigation (`useParams` / `useNavigate`), `useLoad`/`usePush` request hooks
**Accessibility Target**: WCAG 2.2 AA — dialog is keyboard-operable (focusable confirm/cancel, Esc to cancel), archive action reachable by keyboard, dependent-list message is readable text (not color-only)

### UI Decisions

| Screen / Component                   | User Story | Approach                                                                                                                                 | Design Skills                                                                               |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Confirmation dialog (base-component) | US1        | New reusable `ConfirmDialog` in `base-components`, flat modal per DESIGN.md; states the action cannot be undone from within the product  | `/design-language-to-daisyui` n/a → `/design-clarify` (microcopy: warning + undone message) |
| Archive action + blocked message     | US2        | `Archive` button in `LanguageView`; blocked path renders an inline message listing dependent language names (from the 409 response)      | `/design-clarify` (blocked-reason copy), `/design-onboard` n/a                              |
| Language detail view (routed)        | US3        | `LanguagesBox` selection driven by `/languages/:languageId`; renders existing `LanguageView`; loading snake before redirect on cold load | `/design-adapt` (works on refresh/direct load)                                              |

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**: `/design-clarify` (confirm + blocked-dependents copy), `/design-audit` (dialog focus/keyboard/contrast against DESIGN.md)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                  | Assessment                                                                                                                                                                                                                                                                                                                                                  | Status |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Test-First (TDD; E2E for user flows)    | All new logic (model guard, storage filter, dependency check, archive endpoint, route/box selection, confirm dialog) is unit-testable and will be written test-first; the three user flows get Cypress E2E + acceptance specs. Meets the mandate.                                                                                                           | PASS   |
| II. Type Safety & Static Analysis          | `archived: boolean` is a required, concrete field (D8); new `ArchiveLanguageResult`/blocked-response types are explicit; no `any`. Strict-boolean-safe (`WHERE NOT archived`, `!l.archived`). Ripple across `Language` literals resolved to keep types honest.                                                                                              | PASS   |
| III. Code Quality (JSDoc, naming, imports) | New public functions/components (archive helper, `ConfirmDialog`) carry JSDoc; PascalCase types; import order preserved.                                                                                                                                                                                                                                    | PASS   |
| IV. Pre-commit Quality Gates               | `yarn typecheck` + lint-staged + related jest must pass; conventional commit via `/commit`. No `--no-verify`.                                                                                                                                                                                                                                               | PASS   |
| V. Warning/Deprecation Policy              | The `archived`-field ripple will surface typecheck errors across fixtures/tests; these are fixed in-phase, not deferred (D8).                                                                                                                                                                                                                               | PASS   |
| VI. Layered Architecture & Persistence     | `archived` is **domain** data → all access routes through `Persistence` (`languages()`, `language()`, new `archiveLanguage()`). Transactions are a storage concern, so the atomic check-and-set lives behind the interface (D3/D4). No new server-only exemption invoked. `core` stays isomorphic (model-only change). Desktop path untouched (D9).         | PASS   |
| VII. Simplicity & Maintainability          | One boolean column; one new `Persistence` method (`archiveLanguage`) — required because `updateLanguage` can neither join a transaction nor return an archived row under the D2 filter (D3); reuse `AdminHome` for the routed detail view (D7); uniform filter gives FR-004 **and** the mid-session-save rejection for free (D2). No speculative machinery. | PASS   |

**Result**: PASS — no violations; Complexity Tracking left empty.

**Post-Phase-1 re-check**: Design artifacts (data-model, contracts, quickstart)
introduce no new interfaces beyond one endpoint and one route, one model field,
and one base-component. No principle regresses. Gate remains **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/012-language-archive-routing/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D10
├── data-model.md        # Phase 1 — Language.archived + filtering + transitions
├── quickstart.md        # Phase 1 — manual + automated verification
├── contracts/           # Phase 1 — endpoint & route contracts
│   ├── archive-language.md
│   └── language-detail-route.md
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── models/
│   │   ├── Language.ts            # + archived: boolean (required); guard/sqlizeLang only after caller audit (D8)
│   │   └── Language.test.ts       # type tests
│   └── interfaces/
│       ├── Persistence.ts         # + archiveLanguage(languageId) => ArchiveLanguageResult (D3)
│       └── Api.ts                 # + POST /api/admin/languages/:languageId/archive typing
├── server/
│   ├── controllers/
│   │   ├── languagesController.ts       # + archive endpoint (calls storage.archiveLanguage); re-point path validates defaultSrcLang is active (D4)
│   │   ├── languagesController.test.ts  # archive: ok / blocked-with-dependents / 404 / non-admin; re-point to archived/bogus rejected
│   │   └── tStringsController.test.ts   # tString save with archived language's code rejected (mid-session edge case, D2)
│   └── storage/
│       ├── PGStorage.ts           # languages()/language() add "AND NOT archived" + archived in projection; archiveLanguage: this.sql.begin — lock row FOR UPDATE, check deps, set flag
│       ├── testStorage.ts         # filter archived; archiveLanguage; createLanguage sets archived:false
│       └── storage.test.ts        # archive/filter behavior incl. blocked-with-dependents + already-archived
├── frontend/
│   ├── common/
│   │   ├── base-components/
│   │   │   ├── ConfirmDialog.tsx        # NEW reusable confirm (DESIGN.md)
│   │   │   └── ConfirmDialog.test.tsx
│   │   ├── state/
│   │   │   └── languageSlice.ts         # archive thunk/pusher + remove-from-adminLanguages reducer
│   │   └── testHelpers.tsx              # default archived:false in language builders
│   └── web/
│       ├── MainRouter.tsx               # + admin-only /languages/:languageId route
│       └── languages/
│           ├── LanguagesBox.tsx         # selection driven by route param; navigate on click; redirect gated on load
│           ├── LanguagesBox.test.tsx
│           └── LanguageView.tsx         # + Archive button, confirm flow, blocked-dependents message
└── (desktop/ — UNCHANGED; propagation is a non-goal, D9)

migrations/
└── <timestamp>-addArchivedColumnToLanguages.js   # ALTER TABLE languages ADD archived boolean NOT NULL DEFAULT false

cypress/integration/
└── language-archive-routing.*           # US1/US2/US3 E2E

specs/acceptance-specs/
├── US01-archive-language.txt
├── US02-prevent-archive-with-dependents.txt
└── US03-language-detail-url.txt
```

**Structure Decision**: Web application on the existing isomorphic four-layer
architecture. Domain change (`archived`) lives in `core/models` and flows through
`Persistence`; the archive gate lives in `server/controllers` + `server/storage`;
routing/UI in `frontend/web` + a reusable `frontend/common/base-components` dialog.
Desktop is deliberately untouched (D9).

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets a spec file
> created during `sp:05-tasks`, in `specs/acceptance-specs/` (GWT format).

| User Story                                              | Acceptance Spec File                                              | Scenarios |
| ------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| US1: Archive a language project that's no longer needed | `specs/acceptance-specs/US01-archive-language.txt`                | 3         |
| US2: Prevent archiving a language others depend on      | `specs/acceptance-specs/US02-prevent-archive-with-dependents.txt` | 3         |
| US3: Language detail view has a real, shareable URL     | `specs/acceptance-specs/US03-language-detail-url.txt`             | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Complexity Tracking

> No Constitution Check violations — no entries.
> </content>
