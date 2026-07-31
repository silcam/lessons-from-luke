# Phase 1 Data Model: Language Project Rename

Feature: `016-language-rename` | Date: 2026-07-31

**No schema change. No migration.** This document records the change in _mutability rules_ for an
existing entity, and the validation invariants the rename path must uphold.

## Entity: Language (project)

Domain type: `src/core/models/Language.ts`. Table: `languages` (created in
`migrations/1582711758713-LoadSchema.js`, extended by `addDefaultSrcLangColumnToLanguages`,
`addTimestampsColumns`, and `addArchivedColumnToLanguages`).

| Field            | Column           | Type          | Mutable before this feature | Mutable after this feature | Notes                                                     |
| ---------------- | ---------------- | ------------- | --------------------------- | -------------------------- | --------------------------------------------------------- |
| `languageId`     | `languageid`     | serial PK     | no                          | **no**                     | Identity. FR-009 — a rename never changes it.             |
| `name`           | `name`           | `text` (null) | no (create-only)            | **yes — admin rename**     | The whole feature. Display-only; nothing keys off it.     |
| `code`           | `code`           | `text`        | no                          | **no**                     | Public identifier used in `/translate/:code`. FR-009.     |
| `motherTongue`   | `mothertongue`   | boolean       | yes                         | yes                        | Unchanged.                                                |
| `defaultSrcLang` | `defaultsrclang` | int           | yes                         | yes                        | Unchanged.                                                |
| `progress`       | `progress`       | jsonb         | derived                     | derived                    | Recomputed by `updateProgress()`; untouched by rename.    |
| `archived`       | `archived`       | boolean       | via archive endpoint        | via archive endpoint       | An archived language is **not** renameable — see below.   |
| `modified`       | `modified`       | bigint        | yes                         | yes                        | Set by `updateLanguageChecked`; drives desktop down-sync. |

### Field: `name`

**Storage constraint**: none at the database level (`name text`, nullable, no unique index). See
[research.md R-001](research.md#r-001--duplicate-name-enforcement-application-level-no-database-constraint)
for why none is being added.

**Application invariants** (enforced in `src/server/controllers/languagesController.ts`):

| ID  | Invariant                                                                                                              | Violation response |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| N-1 | The submitted value MUST be a string.                                                                                  | `422`              |
| N-2 | The value is **trimmed** of leading/trailing whitespace before validation and before persistence (FR-005).             | —                  |
| N-3 | The trimmed value MUST be non-empty (FR-006).                                                                          | `422`              |
| N-4 | The trimmed value MUST NOT case-insensitively equal the name of any **other active** language (FR-007).                | `409`              |
| N-5 | Re-saving the language's **own** current name (with or without surrounding whitespace) is valid and is a no-op change. | —                  |
| N-6 | The target language MUST itself be active; renaming an archived or deleted language is a not-found condition.          | `404`              |

**Invariant ordering is normative**: N-1 → N-3 → N-6 → N-4. The 404 condition is evaluated _before_
the duplicate condition so that an archived target with a colliding name reports not-found rather
than conflict (spec edge case; plan.md D-002).

**Uniqueness scope**: active languages only. Archived languages do not participate, which mirrors
the create path (`storage.languages()` is `WHERE NOT archived`). Consequence: a rename may reuse an
archived language's name — accepted, and identical to creation.

**Known limitation (accepted)**: only the _incoming_ value is trimmed. A pre-existing stored name
with surrounding whitespace (creation does not trim) will not be detected as a collision. See
plan.md D-003.

## Relationships touched

None. `defaultSrcLang` references (`languages.defaultsrclang`), `lessonStrings`, `tStrings`, and
document generation all key off `languageId` / `code`, never `name`. A rename therefore cannot
orphan or break any relationship (SC-003).

The one name-derived artifact is the **filename of generated lesson documents**, which is composed
at generation time. Documents generated before a rename keep their old filenames; documents
generated after use the new name. Accepted (spec Assumptions).

## State transitions

`name` has no state machine. The single new transition is:

```text
Language(active, name = A)  --admin rename, valid B-->  Language(active, name = B)
                            --admin rename, invalid B-> unchanged (422 | 409)
Language(archived, name = A) --admin rename, any B-->   unchanged (404)
```

`modified` advances on every successful transition, which is what propagates the rename to desktop
clients through the existing down-sync (FR-010) with no desktop-side change.
