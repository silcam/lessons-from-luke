# Phase 1 Data Model: Language Project Archiving and Detail-View Routing

## Entities

### Language (modified)

The existing domain entity (`src/core/models/Language.ts`). This feature adds one
field.

| Field            | Type               | Notes                                                                              |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `languageId`     | `number`           | PK (unchanged).                                                                    |
| `name`           | `string`           | Display name (unchanged).                                                          |
| `code`           | `string`           | Opaque translate code; stripped for `PublicLanguage` (unchanged).                  |
| `motherTongue`   | `boolean`          | Unchanged.                                                                         |
| `progress`       | `LessonProgress[]` | Unchanged.                                                                         |
| `defaultSrcLang` | `number`           | The `languageId` this language translates **from** (source). Basis for FR-007/008. |
| `archived`       | `boolean`          | **NEW.** `true` = soft-deleted. Default `false`. Required (see research D8).       |

**Type touch-points** (all in `src/core/models/Language.ts`):

- `Language` interface: add `archived: boolean` (required).
- `isLanguage` guard: leave as-is by default — it is deliberately partial (3 of
  6 fields) and tightening it could reject pre-migration desktop-stored data;
  only add `["archived", "boolean"]` after a caller audit shows it safe
  (research D8).
- `sqlizeLang`: appears to have no callers in `src/`; verify before treating it
  as a touch-point (research D8).
- `PublicLanguage = Omit<Language, "code">` now includes `archived`; always
  `false` in practice (archived rows are filtered server-side). No shape change.

### Source-language dependency (relationship, not a table)

Derived, not stored: language B **depends on** language A when
`B.archived === false` and `B.defaultSrcLang === A.languageId` and
`B.languageId !== A.languageId`. Computed over the active list returned by
`Persistence.languages()`. A with ≥1 such B cannot be archived (FR-007/008).

## Storage schema change

**Migration** (`migrations/<timestamp>-addArchivedColumnToLanguages.js`),
patterned on `1583306702630-addDefaultSrcLangColumnToLanguages.js`:

```sql
ALTER TABLE languages ADD archived boolean NOT NULL DEFAULT false;
```

`NOT NULL` is required: a NULL `archived` would silently vanish under
`WHERE NOT archived` (NULL is neither true nor false). `DEFAULT false`
backfills existing rows at ALTER time.

`down` is a no-op (consistent with the existing add-column migration in this repo).

## Read-path filtering (research D2)

Both reads exclude archived rows uniformly:

- `PGStorage.languages()` → `SELECT ... FROM languages WHERE NOT archived`.
- `PGStorage.language({code}|{languageId})` → add `AND NOT archived` (or fold into
  the `WHERE` alongside the param match).
- `testStorage.languages()` → `testDb.languages.filter(l => !l.archived)`.
- `testStorage.language(...)` → return `null` when the matched row is archived.
- Both explicit `SELECT` column lists in `PGStorage` (in `languages()` and
  `language()`) MUST add `archived` to the projection, or the field never returns.
- `testStorage.createLanguage` MUST set `archived: false` on the new row.

## Write path (archive)

New `Persistence.archiveLanguage(languageId)` (research D3), invoked only by the
archive endpoint. In `PGStorage`, one `this.sql.begin(...)` transaction: lock the
target row (`SELECT ... WHERE languageId = :id AND NOT archived FOR UPDATE` — no
row → 404), compute active dependents (→ blocked result if any), else
`UPDATE ... SET archived = true`; commit. Returns success or the dependent list;
never re-reads the archived row via `language()` (which would return null).
`updateLanguage` is NOT used for archiving — it cannot join a transaction and
its trailing re-read would violate its return type post-filter (research D3/D4).

## Write path (defaultSrcLang re-point)

The generic update path gains validation: a new `defaultSrcLang` must resolve to
an **active** language, checked in a transaction that locks the target
source-language row (research D4). This closes both the archive/re-point race
(common lock on the language row) and the sequential dangling-reference hole
(pointing at an already-archived or nonexistent language).

## State transition

```
active (archived=false) ──archive (admin, no active dependents, confirmed)──▶ archived (archived=true)
                                                                                   │
                                                       (no in-product restore — FR-006)
```

- One-way from the product's perspective; reversible only via direct DB access.
- Blocked transition: archive attempted while ≥1 active dependent exists (FR-008)
  → no state change; response lists dependents.

## Invariants

- INV-1: An archived language never appears in any value returned by
  `languages()` or `language()` (hence absent from every web picker — FR-003).
- INV-2: A language with ≥1 active dependent cannot become archived (FR-007/008),
  enforced atomically server-side (research D4).
- INV-3: `archived` can only be set `true`, and only via the archive endpoint;
  it is never accepted by the generic update endpoint (FR-006).
- INV-4: An active language's `defaultSrcLang` always references an active
  language — enforced on both sides: archive blocks while active dependents
  exist, and re-point rejects inactive/nonexistent targets, both under a common
  row lock (research D4).
  </content>
