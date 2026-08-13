# Phase 1 Data Model: Luke Lesson 1 Translation Restoration

**Branch**: `018-lesson1-translation-restore` | **Date**: 2026-08-13

**No schema changes.** This feature adds no tables, columns, indexes, or
constraints (spec Scope Boundaries). Everything below is either (a) existing
persisted structure the tool reads, or (b) in-memory types the tool computes
and serialises to report files.

---

## Part A — Existing persisted structure (read-only reference)

Source: `migrations/1582711758713-LoadSchema.js`,
`migrations/1594220343825-addTimestampsColumns.js`,
`migrations/1611678806893-AddLessonDiffs.js`,
`migrations/1784766630014-addArchivedColumnToLanguages.js`.

### `lessons`

| Column     | Type   | Notes                                 |
| ---------- | ------ | ------------------------------------- |
| `lessonId` | serial | PK                                    |
| `book`     | text   | `Luke` / `Acts`                       |
| `series`   | int    | quarter/series number                 |
| `lesson`   | int    | lesson number within series           |
| `version`  | int    | **increments on every master upload** |
| `created`  | bigint | epoch ms                              |
| `modified` | bigint | epoch ms; bumped by `updateLesson`    |

Identity across the two databases is `(book, series, lesson)` — `lessonId` is a
serial and MUST NOT be assumed equal across production and the snapshot.

### `lessonstrings` / `oldlessonstrings`

| Column           | Type    | Notes                                                      |
| ---------------- | ------- | ---------------------------------------------------------- |
| `lessonStringId` | serial  | PK; **not stable across a re-upload** (rows are recreated) |
| `masterId`       | int     | → `tstrings.masterId` of the English master string         |
| `lessonId`       | int     |                                                            |
| `lessonVersion`  | int     | generation marker                                          |
| `type`           | text    | `content` / `styles` / `meta`                              |
| `xpath`          | text    | position in the ODT XML                                    |
| `motherTongue`   | boolean |                                                            |

`updateLesson` deletes the live generation into `oldlessonstrings` and inserts
a fresh one. `oldlessonstrings` therefore holds prior generations keyed by
`(lessonId, lessonVersion)`.

### `tstrings`

| Column             | Type   | Notes                                                         |
| ------------------ | ------ | ------------------------------------------------------------- |
| `masterId`         | serial | the master-string identity; **shared across languages**       |
| `languageId`       | int    | `1` = English (`ENGLISH_ID`)                                  |
| `sourceLanguageId` | int    | nullable                                                      |
| `source`           | text   | nullable                                                      |
| `text`             | text   | the translation                                               |
| `history`          | jsonb  | array of prior texts, appended on overwrite                   |
| `lessonStringId`   | int    | **nullable; legacy** — no current write path sets it non-null |
| `created`          | bigint | epoch ms; may be NULL/backfilled on old rows                  |
| `modified`         | bigint | epoch ms; may be NULL/stale; drives desktop sync selection    |

**No PK, no unique constraint.** Logical identity is the triple
`(languageId, masterId, lessonStringId)` (`equal()` in
`src/core/models/TString.ts`). A bare INSERT silently duplicates.

### `languages`

| Column           | Type    | Notes                                     |
| ---------------- | ------- | ----------------------------------------- |
| `languageId`     | serial  | PK                                        |
| `name`, `code`   | text    |                                           |
| `motherTongue`   | boolean |                                           |
| `progress`       | jsonb   | derived; recomputed by `updateProgress()` |
| `defaultSrcLang` | int     |                                           |
| `archived`       | boolean | **filtered out of `Persistence` reads**   |

---

## Part B — In-memory model (new types)

All types live under `src/server/tasks/restoreLesson/` and are exported from
`types.ts`. They are plain data — no methods, no I/O — so the pure diagnosis
core (research D11) is unit-testable from fixtures.

### `ServerIdentity`

Result of FR-001 verification.

```
ServerIdentity {
  productionMarkerPresent: boolean   // THIS_IS_THE_PRODUCTION_SERVER
  snapshotConfirmationToken: string  // operator-supplied, recorded in report
  productionLessonVersion: number
  snapshotLessonVersion: number
  snapshotIsOlder: boolean           // hard gate
}
```

Validation: the tool aborts unless `productionMarkerPresent === true` and
`snapshotIsOlder === true`.

### `AffectedLesson`

Output of FR-002 detection.

```
AffectedLesson {
  book: string; series: number; lesson: number     // cross-DB identity
  productionLessonId: number
  snapshotLessonId: number
  productionVersion: number
  snapshotVersion: number
  bumpCount: number                                 // prod − snapshot
  mappingStrategy: "findTSubsBridge" | "snapshotAnchored"
  candidateMasterDocuments: MasterDocumentCandidate[]
}
```

Validation: `bumpCount >= 1` (else abort). `mappingStrategy` is
`findTSubsBridge` when `bumpCount === 1`, else `snapshotAnchored` (research D3).

### `MasterDocumentCandidate`

A historical ODT under `docs/` considered for the English restore (research D5).

```
MasterDocumentCandidate {
  filepath: string
  version: number | null            // parsed from the versioned filename
  englishTextSetMatchesSnapshot: boolean
  missingFromDocument: string[]     // snapshot English texts absent from the ODT
  extraInDocument: string[]         // ODT texts absent from the snapshot lesson
}
```

Validation: the upload path (research D5 primary) may only use a candidate
with `englishTextSetMatchesSnapshot === true`.

### `MasterStringMapping`

One entry per pre-incident master string of the affected lesson.

```
MasterStringMapping {
  snapshotMasterId: number
  productionMasterId: number | null      // null = no counterpart in production
  englishText: string
  type: string; xpath: string; position: number
  matchMethod: "identicalText" | "findTSubs" | "typeXpath" | "position" | "unmatched"
  reachableInProduction: boolean         // referenced by current lessonstrings
  sharedWithLessons: LessonRef[]         // blast radius (FR-004)
}
```

Validation: every mapping records how it was matched; `unmatched` entries are
reported and never written.

### `TranslationClassification`

The FR-008 decision for one (language, master string) pair. Exactly one of:

```
"restore" | "intact" | "conflict" | "newerWork" | "lost"
```

Decision table (research D7):

| production row | snapshot row | texts  | classification |
| -------------- | ------------ | ------ | -------------- |
| absent         | present      | —      | `restore`      |
| present        | present      | equal  | `intact`       |
| present        | present      | differ | `conflict`     |
| present        | absent       | —      | `newerWork`    |
| absent         | absent       | —      | `lost`         |

State transition: only `restore` produces a write. `intact` is a verified
no-op (and is what a second apply run turns every prior `restore` into —
this is the idempotency invariant, FR-011).

### `TranslationFinding`

```
TranslationFinding {
  languageId: number; languageName: string; languageArchived: boolean
  snapshotMasterId: number; productionMasterId: number | null
  classification: TranslationClassification
  snapshotText: string | null
  productionText: string | null
  productionModified: number | null      // may be NULL — evidence only
  legacyLessonStringId: number | null    // second orphan vector, counted
  sampleEnglishText: string
}
```

### `RestoreWrite`

The write plan. One per row to be written; produced only from `restore`
findings.

```
RestoreWrite {
  languageId: number
  masterId: number          // production-side masterId
  lessonStringId: null      // always null (research D6)
  text: string              // snapshot value
  history: []               // always empty on insert (research D6 defect 2)
  sourceLanguageId: number | null
  source: string | null
}
```

Invariants:

- Writes are grouped and submitted **one language at a time**
  (`saveTStrings` dedupes by `masterId` ignoring `languageId`).
- No two writes in a batch share a `masterId`.
- A write is emitted only when the target row is absent in production, or
  present with identical text (no-op). Never when texts differ.

### `DiagnosisReport`

The durable artifact (`report.json`) that gates apply. See
`contracts/report.schema.json`.

```
DiagnosisReport {
  diagnosisId: string              // uuid; apply must be given this explicitly
  generatedAt: string              // ISO 8601
  toolVersion: string
  mode: "diagnose" | "apply" | "verify"
  identity: ServerIdentity
  affectedLessons: AffectedLesson[]
  mappings: MasterStringMapping[]
  findings: TranslationFinding[]
  perLanguageCounts: LanguageCounts[]
  legacyLessonStringRowCounts: { production: number; snapshot: number }
  blastRadius: { sharedMasterIds: number; lessons: LessonRef[] }
  plannedWrites: RestoreWrite[]    // dry run: what WOULD be written
  appliedWrites?: AppliedWrite[]   // apply only
  preApplyDumpPath?: string        // apply only
  conflicts: TranslationFinding[]  // classification === "conflict" | "newerWork"
}
```

### `LanguageCounts`

Feeds SC-002 and FR-013.

```
LanguageCounts {
  languageId: number; languageName: string; archived: boolean
  snapshotReachable: number        // pre-incident reachable translations
  productionReachableBefore: number
  productionReachableAfter: number | null   // apply/verify only
  restored: number; conflicts: number; newerWork: number; lost: number
}
```

---

## Part C — Invariants the implementation must uphold

| #   | Invariant                                                                               | Enforced by                                       |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| I1  | The snapshot database receives zero writes, ever.                                       | `PGSnapshotStorage` overrides + read-only session |
| I2  | Dry run performs zero writes to either database.                                        | No write call reachable from `diagnose`           |
| I3  | A production value differing from the snapshot is never overwritten.                    | D7 table; `RestoreWrite` emission rule            |
| I4  | Every write goes through `saveTStrings` (never a bare INSERT).                          | `restoreWrite` wrapper is the only writer         |
| I5  | Re-running apply produces zero writes and zero new rows.                                | `saveTStrings` equal-text short-circuit           |
| I6  | Overwritten production values are retained in `history`.                                | `saveTStrings` history append                     |
| I7  | Archived languages are enumerated in the diagnosis (not silently dropped).              | Raw SQL reads, bypassing `NOT archived`           |
| I8  | Nothing outside the affected lesson's master strings is written.                        | Write plan derived only from `mappings`           |
| I9  | Apply cannot run without a matching prior diagnosis report and a fresh production dump. | Apply preconditions (research D9)                 |
| I10 | Language progress is recomputed with `await` before the process exits.                  | `awaitProgress: true` + terminal `await`          |
