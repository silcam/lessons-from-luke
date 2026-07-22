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

- `Language` interface: add `archived: boolean`.
- `isLanguage` guard: add `["archived", "boolean"]` to the validated fields.
- `sqlizeLang`: unchanged shape but now carries `archived` through
  (`{ ...lang, progress: JSON.stringify(lang.progress) }` already spreads it).
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
ALTER TABLE languages ADD archived boolean DEFAULT false;
```

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

`updateLanguage(id, { archived: true })`, invoked only by the archive endpoint,
inside a single transaction that also re-runs the dependency check (research D4).
No new `Persistence` method (research D3).

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
  </content>
