# Phase 0 Research: Language Project Rename

Feature: `016-language-rename` | Date: 2026-07-31

The spec carried exactly one open technical question into planning (Assumptions, and the
brainstorm's "Deferred to Planning" item). It is resolved below as R-001. R-002…R-005 record the
supporting decisions that the design depends on. There are no remaining NEEDS CLARIFICATION items.

---

## R-001 — Duplicate-name enforcement: application level, no database constraint

**Question**: Does `languages.name` have a database-level unique constraint, and should rename add
one, or is application-level enforcement correct?

**Findings (primary sources)**:

- `migrations/1582711758713-LoadSchema.js:13` creates the table with `name text` — nullable, no
  `UNIQUE`, no index.
- No subsequent migration alters `languages.name`. The full migration set was inspected; the only
  other `name` occurrences are in better-auth's `user` table
  (`1780760814404-AddBetterAuthTables.js:14`) and the admin seed
  (`1780760814405-SeedAdminUser.js:93`) — unrelated tables.
- `1784766630014-addArchivedColumnToLanguages.js` added `archived` and did not touch `name`.
- The create endpoint (`src/server/controllers/languagesController.ts:27-31`) enforces uniqueness in
  application code, case-insensitively, against `storage.languages()`.
- `PGStorage.languages()` (`src/server/storage/PGStorage.ts:30-34`) filters `WHERE NOT archived`, so
  the create-path uniqueness scope is **active languages only**.

**Decision**: Keep enforcement at the application level, in the controller. **Add no migration and
no unique index.** The rename check mirrors create exactly: case-insensitive, over active languages
only, excluding the language being renamed.

**Rationale**:

1. **Case-insensitivity.** The established semantic is `a.toLowerCase() === b.toLowerCase()`. A
   plain `UNIQUE(name)` does not express that; it would have to be a functional index
   `UNIQUE (lower(name))`, i.e. a schema-level restatement of an app rule that already exists.
2. **Archived rows (decisive).** A DB constraint necessarily spans archived rows. Today, archiving a
   language named "Français" and creating a new "Français" is legal and intentional. A unique index
   would silently break that existing, working behavior — a regression introduced by a feature that
   has nothing to do with archiving.
3. **Existing data.** `name` is nullable and has never been constrained, so production rows may hold
   NULLs or duplicates. A unique index would require a data-cleanup migration on live data with no
   product driver for the cleanup.
4. **Cross-implementation symmetry.** `Persistence` is implemented by `PGStorage`,
   `PGTestStorage`/`TransactionalTestStorage`, `PGDevStorage`, and the desktop `LocalStorage`. Only
   the Postgres implementations could carry a DB constraint, so DB-level enforcement would make the
   rule asymmetric across implementations while the app-level rule holds everywhere.
5. **Constitution VII (YAGNI/KISS).** The simplest change that satisfies FR-007 is one comparison in
   one controller. A migration is the larger, riskier, less reversible option.

**Accepted consequences (documented, not hidden)**:

- A rename may collide with an **archived** language's name. This matches creation and is consistent
  with the archive design: archived languages are invisible to the admin surface.
- The check-then-write sequence is **not** transactional. Two admins renaming simultaneously to the
  same new name could both pass the check. The spec's Assumptions elect last-write-wins at this
  scale ("single-digit admin count"), so no locking is introduced.

**Alternatives considered**:

| Alternative                                                         | Rejected because                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `UNIQUE (lower(name))` migration                                | Breaks legal name reuse after archiving; requires prod data cleanup; duplicates an app rule in schema; asymmetric with `LocalStorage`.                               |
| Add a partial index `UNIQUE (lower(name)) WHERE NOT archived`       | Same data-cleanup burden and asymmetry; buys only the concurrency guarantee the spec explicitly declines to require.                                                 |
| Move the duplicate check into `updateLanguageChecked`'s transaction | Tightens the race the spec does not ask to close, at the cost of widening the `Persistence` contract and mirroring 409 semantics in every implementation. See R-002. |

---

## R-002 — Where the validation lives

**Decision**: In `languagesController`, at the same layer as the create-path check.

**Rationale**: FR-007 asks for behavior identical to creation, and the identical layer makes that
literal. `updateLanguageChecked` already accepts `Partial<Language>`, so accepting `name` requires
**no `Persistence` interface change at all** — the storage layer needs zero edits, zero new mirrored
semantics in `testStorage`, and zero desktop impact.

**Consequence that must be handled** (see plan.md D-002): the spec requires a **404** when the
target is archived or removed, "not a silent success". A controller that checks duplicates first
would answer 409 for an archived target with a colliding name. The controller must therefore locate
the target within the active-language list first; if it is absent, skip the duplicate check and let
`updateLanguageChecked` raise 404.

**Alternatives considered**: in-transaction check inside `updateLanguageChecked` (see R-001 table);
a new dedicated `renameLanguage` storage method (rejected — a new `Persistence` method for a field
the generic update already handles violates Constitution VII).

---

## R-003 — Rename affordance: "Edit" link, not a pencil icon

**Decision**: Text `Edit` link-button toggling to an inline input, per the spec's Clarifications and
the brainstorm's Key Decisions. **Settled; do not re-explore in red-team.**

**Rationale**: the repo has no icon library; `LessonPage.tsx:60`, `LessonStringEditor.tsx:53`, and
`DocStringsPage.tsx:193` already use this idiom; the `Edit` i18n key exists (`en.ts:41`); DESIGN.md
mandates consistency over novelty. The user explicitly confirmed the change from their original
pencil-icon phrasing.

**Alternatives considered**: pencil icon (rejected — would require introducing an icon system);
always-editable input (rejected — no affordance boundary, and accidental edits on a page that also
carries destructive actions); a modal dialog (rejected — heavier than the established pattern and
inconsistent with the other three edit surfaces).

---

## R-004 — Client thunk shape

**Decision**: a new `pushLanguageRename(languageId, name)` rather than widening
`pushLanguageUpdate`.

**Rationale**: `pushLanguageUpdate` (`languageSlice.ts:122-132`) unconditionally posts
`{ motherTongue, defaultSrcLang }`. Widening it would make every mother-tongue or source-language
toggle also submit a name and run it through rename validation — coupling unrelated operations and
creating a path where a toggle could fail with a duplicate-name error. A separate thunk posting
`{ name }` alone keeps each operation's failure modes independent.

Immediate propagation (FR-004) comes free: both thunks dispatch `languageSlice.actions.addLanguage`,
and `LanguagesBox` selects the rendered language out of `adminLanguages`, so the heading and the list
re-render from one store update.

---

## R-005 — i18n and error-message consistency

**Findings**: `Edit`, `Save`, `Cancel`, and `Language_name` keys exist in
`src/core/i18n/locales/en.ts`. `AddLanguageForm.tsx:32` **hardcodes** its duplicate message rather
than using `t()`. `fr.ts` is partial and already lacks recently added keys (e.g.
`Archive_update_failed`), relying on English fallback.

**Decision**: add `Language_name_duplicate` (identical wording to the create form's string) and
`Language_name_required` to `en.ts`, and use `t()` in the new editor. Do not refactor
`AddLanguageForm` in this feature, and do not add `fr.ts` entries (consistent with the 012 feature's
precedent).

**Rationale**: FR-007 requires user-visible consistency with the create form, which identical wording
delivers; doing it through `t()` avoids adding a second hardcoded string. Refactoring the create form
is unrelated scope.
