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
- `isLanguage` guard: leave as-is — it validates only 3 of 6 `Language` fields
  today (`name`/`code`/`languageId`, `Language.ts:25-32`) and no caller passes
  pre-migration desktop-stored data through it that this feature would newly
  reject; tightening it is out of scope (research D8).
- `sqlizeLang` (`Language.ts:80`): has one caller,
  `src/server/storage/pgLoadFixtures.ts:12`, which spreads
  `fixtures.languages.map(sqlizeLang)` into the fixture-load
  `INSERT INTO languages` statement. Verified: `test/fixtures-0.json` language
  entries already omit `defaultSrcLang` today, even though it's a required TS
  field on `Language` — that column carries `DEFAULT 1` from
  `migrations/1583306702630-addDefaultSrcLangColumnToLanguages.js`, and
  porsager's `sql(...)` builds each row's column list from that row's own
  object keys, so an omitted key is simply left out of that row's INSERT and
  the DB column default fills it in. The new `archived` migration follows the
  identical pattern (`ADD archived boolean NOT NULL DEFAULT false`, per
  Storage schema change below), so no `sqlizeLang` or `fixtures-0.json` edit
  is required: omitted fixture rows get `archived = false` from the column
  default, exactly like `defaultSrcLang` does today. `sqlizeLang` itself needs
  no change — it only JSON-stringifies `progress`.
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

### tString read filtering (added post-review)

Added after a PR reviewer found that `GET /api/languages/:archivedId/lessons/:lessonId/tStrings`
still returned real translations: `tStrings()` queries only `tStrings`/`lessonstrings`
and never touched `languages`, so the D2 filter never reached it. The spec's FRs are
silent on this (FR-002 retains the data; FR-003/FR-004 speak only to pickers and
translation targets), so this is a deliberate widening of the read barrier, not a
correction of a stated requirement.

- `PGStorage.tStrings({languageId, lessonId?, masterIds?})` appends
  `AND EXISTS (SELECT 1 FROM languages lang WHERE lang.languageId = :languageId AND NOT lang.archived)`
  to **all three** branches. Repeated inline because postgres@1 has no query-fragment
  composition (a nested `` sql`…` `` is bound as a _value_, not spliced), and because a
  preliminary guard `SELECT` would add a round-trip per call — `updateProgress` calls
  `tStrings` once per active language on every save. The subquery is uncorrelated, so
  it is evaluated once against the `languages` PK.
- `testStorage.tStrings` returns `[]` when the language is missing or archived.
- API contract: **200 + `[]`**, identical to a nonexistent languageId (the behavior
  already asserted at `tStringsController.test.ts` "Get TStrings - invalid ids").
  No 404 is introduced on any tStrings route.
- No `ENGLISH_ID` bypass: the guard applies to `englishScriptureTStrings` and
  `addOrFindMasterStrings` too. See research D2 for the accepted residual risk.

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

A new dedicated transactional method `updateLanguageChecked(languageId,
{ motherTongue?, defaultSrcLang? }) => Language` (red-team RT-B, signature
finalized by RT-F) — **not** `updateLanguage` — performs the generic update. It
persists **both** filtered fields, because the client always posts both
(`languageSlice.ts:116-125`; there is no `motherTongue`-only request — RT-F).
Inside one `this.sql.begin(...)` it locks the target language row `FOR UPDATE`
**with `AND NOT archived`** — an archived (or nonexistent) target rejects with
404, closing the post-review hole where `POST /api/admin/languages/:archivedId`
mutated a hidden row and returned a `200 null` body. Note the deliberate
asymmetry: `updateLanguage` keeps **no** archived filter, because flipping
`archived` through it is how the test suite manufactures archived state.
Then, **only when `defaultSrcLang` is present and differs from the current value**, it
requires the new source to resolve to an **active** language
(`SELECT ... WHERE languageId = :defaultSrcLang AND NOT archived FOR UPDATE`),
rejecting (422) when missing/archived; otherwise it applies the update and
**re-reads/returns the `Language`** (safe — the locked `AND NOT archived`
predicate proves the target was active and this method never sets `archived`,
so it is not hidden by the D2 filter; the "must not re-read" rule is
`archiveLanguage`-only).
This closes both the archive/re-point race (common lock on the language row) and
the sequential dangling-reference hole (pointing at an already-archived or
nonexistent language). `updateLanguage` cannot host this — it runs on `this.sql`
with no transaction parameter (research D3), the same reason `archiveLanguage`
was split out; the generic update endpoint routes **all** updates through
`updateLanguageChecked` and retires the direct `updateLanguage` call from that
endpoint.

## Write path (create)

`Persistence.createLanguage(newLanguage)` (`NewLanguage = { name, defaultSrcLang }`)
must also uphold INV-4 (red-team RT-H) — the same integrity guard RT-B/RT-F applied
to the re-point path, on the previously-unexamined create path. Today the endpoint
guards only the **shape** (`isNewLanguage` checks `defaultSrcLang` is a number) and
`PGStorage.createLanguage` inserts the client-supplied `defaultSrcLang` verbatim, so
an admin can create an **active** language pointing at an **archived or nonexistent**
source. In `PGStorage`, wrap the insert in one `this.sql.begin(...)`: lock the source
row (`SELECT ... WHERE languageId = :defaultSrcLang AND NOT archived FOR UPDATE`),
reject (**422**) when missing/archived, then `INSERT`. The lock gives create the same
common-lock serialization against a concurrent archive of the source that
`archiveLanguage`/`updateLanguageChecked` use (research D4); the plain `AND NOT
archived` predicate alone closes the sequential dangling case. `testStorage.createLanguage`
mirrors this synchronously (reject inactive/nonexistent `defaultSrcLang`, in addition
to defaulting `archived: false`). `isNewLanguage` is unchanged — the active-language
check is a storage-integrity concern, not a shape guard. Signature unchanged
(`NewLanguage => Promise<Language>`); it may now reject with 422.

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
  `languages()`, `language()`, or `tStrings()` (hence absent from every web
  picker — FR-003 — and unreadable through the tString read routes). Two
  deliberate carve-outs: `sync()` stays unfiltered (it only echoes languageIds
  the client itself named, and desktop propagation is a non-goal —
  `spec.md` "desktop offline picker"), and `saveTStrings` is gated upstream at
  the controller by `invalidCode` → `language({code})` → 401, not by its own
  predicate.
- INV-2: A language with ≥1 active dependent cannot become archived (FR-007/008),
  enforced atomically server-side (research D4).
- INV-3: `archived` can only be set `true`, and only via the archive endpoint;
  it is never accepted by the generic update endpoint (FR-006).
- INV-4: An active language's `defaultSrcLang` always references an active
  language — enforced on **three** write paths, all under a common row lock
  (research D4): archive blocks while active dependents exist (`archiveLanguage`);
  re-point rejects inactive/nonexistent targets (`updateLanguageChecked` — red-team
  RT-B/RT-F); and **create** rejects an inactive/nonexistent `defaultSrcLang`
  (`createLanguage` — red-team RT-H). Neither the re-point nor the archive path may
  go through `updateLanguage`, which cannot participate in the transaction (research
  D3); `createLanguage` gains its own `this.sql.begin` for the same reason.
  </content>
