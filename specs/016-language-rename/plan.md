# Implementation Plan: Language Project Rename

**Branch**: `016-language-rename` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-language-rename/spec.md`

## Summary

Give admins an inline rename control on the language project admin page (`LanguageView`). The
language name becomes mutable post-creation while `languageId` and `code` stay immutable.

Technical approach, smallest change that satisfies the spec:

1. **Server** — widen the `objFilter` whitelist on `POST /api/admin/languages/:languageId` to
   accept `name`, and validate it in the controller (type guard → trim → non-empty → duplicate
   check), mirroring the create endpoint's validation site and semantics. **No `Persistence`
   interface change and no storage-implementation change**: `updateLanguageChecked` already takes
   `Partial<Language>`, already sets `modified`, and already 404s for missing/archived targets.
2. **Contract** — widen the `POST /api/admin/languages/:languageId` request body type in
   `src/core/interfaces/Api.ts` with an optional `name?: string`.
3. **Client** — add a dedicated `pushLanguageRename(languageId, name)` thunk to `languageSlice`
   (not a widening of `pushLanguageUpdate`, which unconditionally ships `motherTongue` +
   `defaultSrcLang` on every toggle). It dispatches the existing `addLanguage` reducer, which is
   what makes the heading and the admin language list update without a reload.
4. **UI** — an "Edit" link-button beside the `Heading` in `LanguageView`, toggling to a
   `TextInput` + Save/Cancel + `Alert danger`, reusing the toggle-to-edit idiom already used by
   `LessonPage`, `LessonStringEditor`, and `DocStringsPage`.
5. **No database migration.** See the duplicate-enforcement decision below.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: React 16, Redux Toolkit, `react-router-dom` v6, Express, `postgres@1`
(domain driver, reached only via `Persistence`)
**Storage**: existing PostgreSQL `languages` table — **no schema change, no migration**
**Testing**: Jest (`*.test.ts(x)`, `--runInBand`) for unit/integration; Cypress for the web E2E flow
**Target Platform**: Web (Express + React admin UI). Desktop/Electron untouched.
**Project Type**: Web — isomorphic four-layer (`core` / `server` / `frontend` / `desktop`)
**Performance Goals**: N/A — one extra `storage.languages()` read per rename request, single-digit
admin concurrency
**Constraints**:

- Admin-only; no new access control (existing `/api/admin` gating + admin route gating suffice)
- No new icon system — text "Edit" link only (DESIGN.md: consistency over novelty)
- Rename must not change `languageId` or `code`
- Renames reach desktop clients through existing down-sync with **zero** desktop-side change

**Scale/Scope**: single-digit admins, tens of language projects; ~5 source files touched.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-31-language-rename-requirements.md](../brainstorms/2026-07-31-language-rename-requirements.md)

### Key Decisions Carried Forward

- **"Edit" link over pencil icon**: the codebase has no icon library; three screens already use the
  text-`Edit`-link → inline-input idiom, and the `Edit` i18n key already exists (`en.ts:41`). Do not
  re-litigate; a pencil icon is out of scope.
- **Enforce name uniqueness on rename**: the create path returns 409 on duplicates; rename must not
  become a bypass.
- **Scope boundaries (explicit non-goals)**: no rename of previously generated ODT artifacts; no
  rename history/audit trail; no desktop-side change; `code`/`languageId` immutable.

### Deferred Questions (resolved during planning)

- _Does a DB-level unique constraint exist on `languages.name`, and does rename need one?_ →
  **No constraint exists and none will be added.** `migrations/1582711758713-LoadSchema.js:13`
  declares `name text` (nullable, no `UNIQUE`), and no later migration alters it. Uniqueness stays
  **application-level**. Full rationale in [research.md](research.md#r-001); summary:
  1. Create-path uniqueness is **case-insensitive** (`languagesController.ts:29`), which a plain
     `UNIQUE(name)` would not express — it would need `UNIQUE (lower(name))`.
  2. Create-path uniqueness is scoped to **active rows only** (`storage.languages()` is
     `WHERE NOT archived`). A DB constraint spans archived rows and would _break_ currently-legal
     creation, i.e. reusing an archived language's name. This is the decisive argument.
  3. `name` is nullable and unconstrained today, so production rows may already hold NULLs or
     duplicates; a unique index would require a data-cleanup migration with no product driver.
  4. `LocalStorage` (desktop) has no equivalent constraint, so DB-level enforcement would be
     asymmetric across `Persistence` implementations.

  **Accepted consequence**: a rename may collide with an _archived_ language's name, exactly as
  creation may. **Accepted residual risk**: the check-then-write window is not transactional; the
  spec's Assumptions already elect last-write-wins at this scale.

## Presentation Design

**Component Framework**: React 16 + existing `src/frontend/common/base-components/` kit
(`Heading`, `Button link`, `TextInput`, `Alert`, `Div`)
**Interaction Patterns**: local `useState` toggle-to-edit; Redux Toolkit `addLanguage` for the
post-save propagation; no routing change
**Accessibility Target**: WCAG 2.2 AA — error feedback rendered in a `role="alert"`
`aria-live="assertive"` region (matching the existing `srcLangUpdateFailed` /
`archiveUpdateFailed` blocks in `LanguageView`); the input is labelled with the existing
`Language_name` key.

### UI Decisions

| Screen / Component                               | User Story | Approach                                                                                                                                       | Design Skills |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `LanguageView` name row — "Edit" link + heading  | US1        | `Heading level=3` + `Button link text={t("Edit")}`; existing toggle-to-edit idiom (`LessonPage.tsx:60`, `LessonStringEditor.tsx:53`)           | —             |
| `LanguageView` inline name editor (input + save) | US1        | `TextInput` pre-filled with current name + `Button Save` + `Button red Cancel`, styled after `AddLanguageForm`                                 | —             |
| Inline rename error feedback                     | US2        | `Alert danger` inside a `role="alert"` region; message cleared on keystroke, exactly as `AddLanguageForm` clears `nameError` in its `setValue` | —             |

**i18n decision (do not defer to the implementer)**: `Edit`, `Save`, `Cancel`, and `Language_name`
keys already exist in `en.ts`. `AddLanguageForm` _hardcodes_ its English duplicate message
("A language with that name already exists."). For FR-007 consistency, add proper keys to
`src/core/i18n/locales/en.ts` — `Language_name_duplicate` (same wording as the create form's
string, so the two read identically) and `Language_name_required` — and use `t()` in the new
editor. Do **not** refactor `AddLanguageForm` in this feature (out of scope; a follow-up may
adopt the keys). `fr.ts` is intentionally partial and already omits recently added keys such as
`Archive_update_failed`; no `fr.ts` change is required (i18n falls back to English).

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**: None planned — this is a three-control addition to an existing
screen using existing components; the constraint is consistency, not novelty.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                               | Status | Notes                                                                                                                                                                                           |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Fidelity to Reality                  | PASS   | The deferred migration question was answered by reading the migrations, not assumed. The 404-vs-409 ordering below exists because the spec's edge case demands a truthful not-found signal.     |
| I. Test-First Development               | PASS   | RED-first Jest tests in `languagesController.test.ts` (exists) and `LanguageView.test.tsx` (exists); user-facing flow additionally covered by a new Cypress spec. See Acceptance Test Strategy. |
| II. Type Safety and Static Analysis     | PASS   | `Api.ts` post-body type widened so the client thunk is typed end-to-end; `req.body.name` is `unknown` after `objFilter`, so an explicit `typeof === "string"` guard is required (no `any`).     |
| III. Code Quality Standards             | PASS   | Naming follows the glossary term **Language (project)**; JSDoc on the new thunk and the new controller validation helper.                                                                       |
| IV. Pre-commit Quality Gates            | PASS   | Standard `yarn typecheck` + lint-staged; conventional commits; never `--no-verify`.                                                                                                             |
| V. Warning and Deprecation Policy       | PASS   | No new deps, no deprecated APIs.                                                                                                                                                                |
| VI. Layered Architecture / Dual Targets | PASS   | Domain data still flows only through `Persistence`; **no `Persistence` signature change** (`updateLanguageChecked` already accepts `Partial<Language>`). Desktop untouched; see FR-010 below.   |
| VII. Simplicity and Maintainability     | PASS   | No migration, no new storage method, no new endpoint — one whitelist entry, one validation block, one thunk, one UI toggle. Rejecting the DB unique index is the YAGNI-consistent choice.       |

**Post-Phase-1 re-check**: PASS. The design added no new abstraction; the only contract change is
one optional field on an existing request-body type. Complexity Tracking is therefore empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-language-rename/
├── plan.md              # This file
├── research.md          # Phase 0 output — duplicate-enforcement decision
├── data-model.md        # Phase 1 output — Language.name mutability + validation rules
├── quickstart.md        # Phase 1 output — how to exercise the rename locally
└── contracts/
    └── language-rename.md   # POST /api/admin/languages/:languageId widened body + error precedence
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── interfaces/Api.ts                  # widen POST /api/admin/languages/:languageId body: name?: string
│   └── i18n/locales/en.ts                 # + Language_name_duplicate, Language_name_required
├── server/
│   └── controllers/
│       ├── languagesController.ts         # whitelist "name"; guard + trim + empty(422) + duplicate(409)
│       └── languagesController.test.ts    # RED-first server tests (file exists)
└── frontend/
    ├── common/state/languageSlice.ts      # + pushLanguageRename(languageId, name) thunk
    └── web/languages/
        ├── LanguageView.tsx               # Edit link → inline editor → Save/Cancel + Alert
        └── LanguageView.test.tsx          # RED-first component tests (file exists)

cypress/integration/
└── language-rename.US1.spec.ts           # E2E happy path + duplicate rejection

migrations/                                # UNCHANGED — no migration in this feature
```

**Structure Decision**: The existing four-layer web structure is used unchanged. The feature is a
vertical slice through `core` (contract + i18n), `server` (controller), and `frontend`
(state + view). The `desktop` layer is deliberately not touched, and `Persistence` /
`PGStorage` / `testStorage` / `LocalStorage` are deliberately not touched — see the validation-site
decision below.

## Design Decisions (binding on implementation)

### D-001 — Validate in the controller, not inside `updateLanguageChecked`

Duplicate and emptiness validation lives in `languagesController`, next to the identical create-path
check. Rationale:

- **Symmetry with create.** FR-007 asks for "the same duplicate-name response behavior as language
  creation"; putting the check at the same layer keeps the two literally the same code shape.
- **Zero `Persistence` blast radius.** Pushing the check into `updateLanguageChecked` would widen
  that method's contract with 409 semantics that must then be mirrored in `testStorage` and any
  other implementation, for no product gain.
- **The spec licenses the race.** Assumptions: "Concurrent rename conflicts are resolved
  last-write-wins … no locking is required at this scale (single-digit admin count)." The in-transaction
  variant buys atomicity the spec explicitly declines to require.

### D-002 — Error precedence: 404 before 409 (the trap D-001 creates)

Spec edge case: "A rename attempt against a language that was archived or removed in another session
fails with a **not-found** error surfaced to the admin, not a silent success." A naive
"duplicate-check first, then update" ordering would return **409** for an archived target whose new
name collides — a wrong and confusing signal.

Required implementation ordering in the controller:

0. Steps 2–4 run **only when `name` is present** in the filtered body. A `motherTongue`-only or
   `defaultSrcLang`-only update must not pay for an extra `storage.languages()` read, and must keep
   its current behavior byte-for-byte.
1. Reject a non-string / empty-after-trim `name` → **422** (shape/validation error, matching
   `isNewLanguage`'s 422 on the create path).
2. Read `const active = await storage.languages()` (active rows only — verified: `PGStorage`
   filters `WHERE NOT archived` at `PGStorage.ts:34`, and `testStorage.languages()` filters
   `!lang.archived` at `testStorage.ts:19`, so absence from this list is a reliable
   archived-or-deleted signal in both implementations).
3. Locate the target by `languageId` in `active`. **If absent, or present with `archived` true**
   (belt-and-braces, so the rule does not depend on the filter above), skip the duplicate check
   entirely and fall through to `updateLanguageChecked`, which throws `{ status: 404 }`.
4. **If present and active**, compare the trimmed, lower-cased name against the _other_ entries only
   (`lang.languageId !== id`). Any match → **409**. Renaming to the language's own current name is
   therefore always allowed (FR-007, US2 scenario 4).
5. Pass the **trimmed** name to `updateLanguageChecked` (FR-005, US2 scenario 3).

This precedence is normative and is restated as a table in
[contracts/language-rename.md](contracts/language-rename.md).

### D-003 — Trim on rename only; create's non-trimming behavior is unchanged

`AddLanguageForm`/the create endpoint do not trim today. Rename will trim (FR-005). Consequence: a
pre-existing untrimmed row such as `" Français"` can never be collided with by a rename of another
language, because the comparison trims only the incoming value while the stored value keeps its
padding. **Accepted residual**, not a defect to fix here: the brainstorm's Scope Boundaries keep the
create path out of scope, the condition requires an already-malformed row, and widening the change
to create would require its own tests and a data question about existing rows. The spec's
"duplicate comparison must not be bypassable by surrounding whitespace" requirement is satisfied for
the incoming value, which is the bypass vector the spec names. Record this as a known limitation for
red-team review rather than silently leaving it undocumented.

### D-004 — A separate `pushLanguageRename` thunk

`pushLanguageUpdate` always posts `{ motherTongue, defaultSrcLang }`. Widening it would make every
mother-tongue toggle also submit a name and subject it to rename validation. Add
`pushLanguageRename(languageId, name)` posting `{ name }` only; on success dispatch
`languageSlice.actions.addLanguage(updatedLanguage)`, which merges into `adminLanguages` and
therefore refreshes both the `LanguageView` heading (it renders `props.language`, selected from the
store by `LanguagesBox`) and the admin language list — no reload, satisfying FR-004.

Error handling uses the `usePush` error-handler channel exactly as `AddLanguageForm` does: handle
409 (duplicate) and 422 (empty) inline, return `true` to suppress the global error banner; let 404
and network failures fall through to the banner while the editor stays open with the typed value
(spec edge case).

### D-005 — FR-010 (desktop sync) is satisfied without change — verified, not assumed

`updateLanguageChecked` sets `modified: Date.now()` on every update, and `PGStorage.languages()`
already selects `name`. The existing `/api/sync/:timestamp/languages/...` down-sync therefore
carries a rename to desktop clients like any other language mutation. No `LocalStorage` or
`downSync` change; the desktop app has no rename UI and needs none.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec gets an acceptance spec
> file during `sp:05-tasks`, in `specs/acceptance-specs/` in GWT format.

Existing acceptance specs run to `US14-language-detail-url.txt`, so this feature continues at
**US15** / **US16**.

| User Story                                        | Acceptance Spec File                                    | Scenarios |
| ------------------------------------------------- | ------------------------------------------------------- | --------- |
| US1: Admin renames a language project             | `specs/acceptance-specs/US15-rename-language.txt`       | 4         |
| US2: Invalid rename attempts are rejected clearly | `specs/acceptance-specs/US16-reject-invalid-rename.txt` | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Tasking note for `sp:05-tasks`**: the tasks that _write_ these two `.txt` files must not carry a
`US`-prefixed title, or Ralph routes them into the ATDD cycle and blocks
(`.specify/solutions/tooling/ralph-atdd-routing-blocks-spec-only-tasks.md`).

**Unit/integration layer (Constitution I, RED first)**:

- `src/server/controllers/languagesController.test.ts` — name accepted and persisted trimmed;
  non-string rejected 422; empty/whitespace-only rejected 422; duplicate (case-insensitive)
  rejected 409; own unchanged name accepted; archived target → 404 even when the name collides
  (D-002); `motherTongue`/`defaultSrcLang` updates unaffected.
- `src/frontend/web/languages/LanguageView.test.tsx` — Edit link present; editor pre-filled;
  Cancel restores and posts nothing; Save updates the heading; 409/422 render inline feedback and
  keep the editor open with the typed value.
- `cypress/integration/language-rename.US1.spec.ts` — admin renames a language and sees the new
  name in the heading and the language list without a reload; a duplicate rename is rejected inline.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
