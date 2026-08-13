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
  knownBadVersions: number[]                        // pinned at first diagnosis
  expectedBumpCount: number                         // 1, +1 per tool-made bump
  candidateMasterDocuments: MasterDocumentCandidate[]
}
```

Validation: `bumpCount >= 1` (else abort). `mappingStrategy` is
`findTSubsBridge` when `bumpCount === 1`, else `snapshotAnchored` (research D3).

`expectedBumpCount` exists so the "stop and re-review" warning does not fire on
its own happy path. It is `1` for the first diagnosis, and
`1 + versions bumped by this tool` for any later one. Re-diagnosing after the
English restore legitimately yields `bumpCount === 2` and `snapshotAnchored`;
the warning fires only when `bumpCount !== expectedBumpCount`.

`knownBadVersions`, `expectedBumpCount`, **and the prior `englishRestore`
record** are carried forward through `diagnose --prior-report <path>`. The
`englishRestore` carry-forward is what keeps `apply`'s precondition 8
satisfiable after a drift recovery — the English master was restored under the
_earlier_ report, so without it `apply` aborts with 24 ("English master not yet
restored") on a lesson that has been correctly restored, and invites the
operator to bump production to v160 for nothing. The drift-recovery loop sends the second
diagnosis to a **new** report path so it cannot clobber the audit artifact,
which means it has no other way to reach any of these facts — omit the flag and the
re-diagnosis silently loses the cover-file denial and mis-warns on `bumpCount`,
on precisely the path they were written for. When `--prior-report` is omitted
and a report already exists in the same directory, the tool says so rather than
proceeding blind. The prior `diagnosisId` is recorded as provenance.

### `LanguageIdentityCheck`

Cross-database evidence that a `languageId` denotes the same language on both
sides (invariant I22). One entry per language seen in either database.

```
LanguageIdentityCheck {
  matchedBy: "code" | "name"            // the key chosen at runtime
  key: string                           // its value
  snapshotLanguageId: number | null     // null = production-only language
  productionLanguageId: number | null   // null = snapshot-only language
  snapshotCode: string | null
  productionCode: string | null
  snapshotName: string | null
  productionName: string | null
  agrees: boolean                       // ids equal, or production-only
}
```

**The join key is chosen at runtime, not assumed.**
`migrations/1582711758713-LoadSchema.js` declares `languages.code` as bare
`text` — **nullable and not unique** (`code text`, no constraint). Joining on it
unconditionally would rest this guard on exactly the kind of unchecked
assumption it exists to remove: NULL codes collapse into one group and duplicate
codes make the pairing arbitrary, so a real divergence could pass the check
written to catch it. `diagnose` therefore tests `code` on **both** databases for
non-null and unique, falls back to testing `name` the same way, and aborts (15)
naming the offending rows when neither qualifies. `name` is the same bare `text`
type, so it gets the same test rather than being trusted as a backstop.

A matched pair whose `name` differs across databases is recorded as evidence,
not treated as fatal — languages get renamed. That tolerance exists only under a
`code` join: when `matchedBy === "name"`, a language renamed since the snapshot
is indistinguishable from one absent in production, so the abort message must
name the fallback and tell the operator to populate `languages.code` uniquely
and re-run, rather than leave them concluding the snapshot is wrong.

`languages.languageId` is a **serial**, exactly like `lessonId` (which the
design refuses to assume equal across databases) and `masterId` (which gets a
whole mapping layer). Yet `TranslationFinding`, `RestoreWrite`, `DriftSkip`, and
`LanguageCounts` each carry one bare `languageId` used on both sides. If the
snapshot's id 7 is Fulfulde and production's id 7 is Hausa, the tool writes
Fulfulde's pre-incident translations into Hausa's rows — and every other guard
passes, because each write still looks like a legitimate `restore` of an absent
row. It is the one corruption in this design that no downstream check catches.

Validation — `diagnose` aborts with exit 15 when any of these hold:

- Neither `code` nor `name` qualifies as a key (non-null and unique) on both
  databases — identity cannot be established from the data at all.
- A matched pair has `snapshotLanguageId !== productionLanguageId`.
- Two snapshot languages map to one production language (or vice versa).
- A snapshot language with translations of the affected lesson has no
  production counterpart under the chosen key.

Production-only languages are recorded with `agrees: true` — they are
post-snapshot additions with nothing to restore.

This is **verify-and-abort, never remap**. Divergent ids mean the operator has
the wrong snapshot, and the tool stops on surprises rather than adapting to
them; a remapping layer would add machinery to survive a state that should end
the run.

### `MasterDocumentCandidate`

A historical ODT under `docs/` considered for the English restore (research D5).

```
MasterDocumentCandidate {
  filepath: string
  version: number | null            // parsed from the versioned filename
  sha256: string                    // pinned at diagnose; re-checked at use (I23)
  sizeBytes: number
  englishTextSetMatchesSnapshot: boolean
  isKnownBadUpload: boolean         // version ∈ AffectedLesson.knownBadVersions
  missingFromDocument: string[]     // snapshot English texts absent from the ODT
  extraInDocument: string[]         // ODT texts absent from the snapshot lesson
}
```

**Filename grammar** (from `docStorage.docFilepath`):
`{book}-{series}-{zeroPad(lesson,2)}v{zeroPad(version,2)}.odt`. `zeroPad` pads
to a **minimum** width and never truncates, so the version segment is variable
width — `v03` and `v157` are both valid. The scanner MUST anchor on
`^{book}-{series}-{lesson:2}v(\d+)\.odt$` (a fixed two-digit pattern parses
`Luke-1-01v157.odt` as version 15) and MUST skip the `*_odt` extraction
directories that sit alongside the documents in `docs/`.

For this incident the expected candidates are `docs/Luke-1-01v157.odt`
(correct, `englishTextSetMatchesSnapshot === true`) and
`docs/Luke-1-01v158.odt` (the cover file, `isKnownBadUpload === true`).

Validation:

- The upload path (research D5 primary) may only use a candidate with
  `englishTextSetMatchesSnapshot === true`.
- A candidate whose `version` is in `knownBadVersions` is **hard-denied** with
  no override flag — it is the document that caused the incident. The list is
  **pinned in the report at first diagnosis**, never derived from the live
  production version: after `restore-english` bumps production to 159, a
  live-derived rule would stop flagging v158 (the actual cover file) and start
  flagging v159 (the file just correctly restored).
- **`restore-english` re-hashes the file and aborts (22) unless `sha256` and
  `sizeBytes` still match the report, and unless the resolved real path lies
  inside the `docs/` root** (I23). The verification is done at diagnose time,
  possibly hours before use; the report is checksum-gated but the ODT on disk is
  not. Anything that replaces the file in the interval — a helpful operator, a
  `docs/` restore-from-backup, a swapped symlink — otherwise passes every gate
  and gets uploaded as the master. The design pins facts at diagnosis and
  re-verifies them at use everywhere except the one physical file it consumes.
- The tool aborts unless `resolve(candidate.filepath) !== resolve(destination)`,
  where destination is the new version's path, so the source document can never
  be unlinked by `saveDoc`'s destination cleanup.
- The `UploadedFile` shim handed to `uploadEnglishDoc` MUST implement `mv` as a
  **copy**. A renaming shim consumes the only recovery source.
- After the upload, the newly written ODT and web preview MUST have the same
  mode and owner as their pre-existing siblings in `docs/`. These files are read
  by the **web server**, so a restrictive umask applied process-wide would leave
  Lesson 1 unreadable — worse than the incident. The restrictive umask is scoped
  to dump and report writes only. Because this check runs **after** production
  has been modified, the tool attempts repair (`chmod`/`chown` to match the
  siblings) and re-checks before aborting; the abort message states that Lesson
  1 may currently be unreadable, names the files with actual vs expected modes,
  and prints the exact fix command.

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
- **Re-validated at apply time.** A `RestoreWrite` is a _proposal_, not an
  authorisation. Immediately before each per-language batch, apply re-fetches
  the live production rows for that batch's `(languageId, masterId)` pairs and
  re-runs the D7 classification. Only writes still classifying as `restore` are
  submitted (invariant I11).

### `DriftSkip`

A planned write withheld at apply time because production changed after the
diagnosis. Produced only by `apply`.

```
DriftSkip {
  languageId: number
  masterId: number
  plannedText: string                     // the snapshot value we would have written
  liveProductionText: string | null       // what production holds now
  reclassifiedAs: TranslationClassification  // "conflict" | "newerWork" | "lost" | "intact"
  benign: boolean                         // true iff reclassifiedAs === "intact"
  detectedAt: string                      // ISO 8601
}
```

`apply` exits 27 when any **non-benign** drift is recorded: the restore is
incomplete by design and the operator must re-diagnose rather than assume
completeness. `intact` drift (someone re-typed the exact text we were going to
write) is recorded for the audit trail but does **not** trigger 27 — making a
benign case alarm is how operators learn to ignore the alarm.

### `DuplicateRow`

Produced by `verify`. The apply-time re-check narrows but cannot close the
window between re-reading a row and writing it — `tstrings` has no unique
constraint, so an absent row cannot be locked, and adding one is outside this
feature's scope. Detection is the honest compensation for a guarantee the
design cannot make.

```
DuplicateRow {
  languageId: number
  masterId: number
  lessonStringId: number | null
  rowCount: number
  texts: string[]                   // the distinct values found
}
```

The sweep is `SELECT languageid, masterid, lessonstringid, count(*) … HAVING
count(*) > 1` over the affected lesson's master strings, and it runs **twice**:

- `diagnose` records `duplicateRowsBaseline` — `tstrings` has had no unique
  constraint for the life of the database, so pre-existing duplicates are
  plausible. Without the baseline, `verify` cannot distinguish a duplicate this
  tool created from one that was already there, and would default to blaming the
  restore in a document the client reads.
- `verify` records `duplicateRows` and reports the **delta** against the
  baseline. Baseline entries are listed separately as pre-existing.

Any duplicate is surfaced prominently in both the JSON report and the
client-facing Markdown; a non-empty delta makes `verify` exit 30. A duplicate is
a data defect a human must resolve.

### `ApplyState`

Batch-level journal, flushed to the report after **every** per-language batch
(write temp file → `fsync` → rename) so a crash mid-apply cannot lose the
record of what was written (SC-004, invariant I12).

Two constraints the atomicity claim depends on:

- The temp file MUST live in the **same directory** as the report. `rename(2)`
  is atomic only within a filesystem; a temp file elsewhere degrades to a copy
  and can leave a truncated report.
- The report is fully rewritten on each flush. The per-write log is therefore
  **also** appended line-by-line to a sibling journal, which is never rewritten.
  `appliedWrites` is reconciled from the journal at the end; if the two
  disagree, the journal wins.
- **The journal's path is derived from the report's**
  (`<report-basename>.journal.jsonl`), never a fixed `report.journal.jsonl`.
  The drift-recovery loop puts a second report in the same directory; a fixed
  name would have two runs appending to one file, so "the journal wins" would
  reconcile one run's writes into the other's report, and `--force-report`'s
  journal check would refuse to create the second report at all. Each line
  carries its `diagnosisId` as a second line of defence.

```
ApplyState {
  startedAt: string
  scopedLanguageIds: number[] | null   // --languages; null = whole corpus
  languageBatches: {
    languageId: number
    status: "pending" | "completed" | "failed"
    writesAttempted: number
    writesApplied: number
    driftSkipped: number
    failureMessage: string | null
    completedAt: string | null
  }[]
  completedAt: string | null
}
```

`status: "failed"` is reachable, and its policy is defined: a throwing
`saveTStrings` call (dropped connection, disk full, unexpected constraint error)
marks the batch `failed`, flushes `applyState` and the journal, prints the
pre-apply dump and journal paths, and **stops the run at exit 32** without
attempting further languages. Continuing would keep writing under a fault whose
cause is unknown. Partial application is already a handled state — the journal
records how far it got and `diagnose --prior-report` re-plans from live
production.

`scopedLanguageIds` exists so `verify` can tell a deliberately scoped apply from
a run that covered everything and restored nothing in eleven languages. It also
bounds `apply`'s computed `--max-writes` default: the cap is derived over the
scoped languages only, since a whole-corpus cap is no cap at all for a
one-language run.

### `EnglishRestore`

Recorded by `restore-english`; its presence is `apply`'s precondition 8 and the
source of the expected-version rule.

```
EnglishRestore {
  method: "upload" | "relink"
  masterDocumentPath: string | null
  masterDocumentSha256: string | null   // the bytes actually consumed (I23)
  newLessonVersion: number
  dumpPath: string                      // this step's own rollback route
  restoredAt: string                    // ISO 8601
  carriedFromDiagnosisId: string | null // set when carried via --prior-report (I26)
}
```

`carriedFromDiagnosisId` distinguishes an entry this report's own
`restore-english` produced from one `diagnose --prior-report` carried forward
after a drift recovery. Two things key on the distinction:

- `verify` must not present an earlier run's English restore as this run's work
  in the client-facing artifact.
- `--force-report`'s refusal to clobber an audit artifact keys on a
  **self-produced** entry only. Keyed on presence alone, the drift-recovery
  report becomes unoverwritable the moment it is created — while recording no
  writes of its own, which is the entire thing the refusal exists to protect.

`dumpPath` is not redundant with the report's `preApplyDumpPath`, which `apply`
writes. Two full dumps are taken during a recovery, and the English restore's is
the **only** way back during the window between a successful English restore and
`apply`. Recording one path and not the other leaves the operator reconstructing
a filename from shell scrollback at the worst possible moment — and leaves a
credential-bearing dump un-enumerated in the runbook's destruction step.

### `Verification`

Recorded by `verify`.

```
Verification {
  mode: "snapshot" | "offline"
  coverage: "complete" | "partial"      // partial when apply was --languages-scoped
  unappliedLanguageIds: number[]        // languages with planned writes not yet applied
  verifiedAt: string                    // ISO 8601
  clientReportPath: string
  clientReportWithheld: boolean         // true when the duplicate delta is non-empty
}
```

`mode` must be durable, not just a console label: a later reader of
`report.json` otherwise cannot tell whether the after-figures came from a live
snapshot comparison or from the report's stored `perLanguageCounts`.

`coverage` is computed over **this report's** plan. On a drift-recovery report
(`priorDiagnosisId` set) the label states that it describes the remainder this
run planned; the earlier report's applied languages live in that earlier report.
Per-language counts are unaffected — they come from live production.

`coverage` exists because a `--languages`-scoped apply **does not satisfy
SC-002**, which is stated over every active language. When it is `"partial"` the
client Markdown is headed `INTERIM` and names the outstanding languages, so the
artifact cannot be mistaken for a completed recovery — the same reasoning as
exit 27 and the `DRAFT — DO NOT SEND` banner.

`clientReportWithheld` pairs with exit 30. The Markdown is **always** written —
withholding it invites a hand-written substitute — but on a non-empty duplicate
delta its first heading is a `DRAFT — DO NOT SEND` banner naming the duplicate
count and affected languages. The artifact states what is wrong with itself
rather than relying on the operator having remembered an exit code.

### `DiagnosisReport`

The durable artifact (`report.json`) that gates apply. See
`contracts/report.schema.json`.

```
DiagnosisReport {
  diagnosisId: string              // uuid; apply must be given this explicitly
  diagnosisChecksum: string        // frozen at diagnose; the human-review gate
  reportChecksum: string           // SHA-256 over the canonical body, excluding this field
  generatedAt: string              // ISO 8601
  toolVersion: string
  mode: "diagnose" | "restore-english" | "apply" | "verify"
  identity: ServerIdentity
  productionFingerprint: ProductionFingerprint
  affectedLessons: AffectedLesson[]
  languageIdentityChecks: LanguageIdentityCheck[]  // I22; diagnose, required
  mappings: MasterStringMapping[]
  findings: TranslationFinding[]
  perLanguageCounts: LanguageCounts[]
  legacyLessonStringRowCounts: { production: number; snapshot: number }
  nullModifiedCounts?: { production: number; snapshot: number }
  blastRadius: { sharedMasterIds: number; lessons: LessonRef[] }
  plannedWrites: RestoreWrite[]    // dry run: what WOULD be written
  englishRestore?: EnglishRestore  // restore-english, or carried via --prior-report
  applyState?: ApplyState          // apply only; flushed after every batch
  appliedWrites?: AppliedWrite[]   // apply only; reconciled from the journal
  driftSkips?: DriftSkip[]         // apply only
  duplicateRowsBaseline: DuplicateRow[]  // diagnose; pre-existing, not caused here
  duplicateRows?: DuplicateRow[]   // verify only; residual-race detection
  verification?: Verification      // verify only
  priorDiagnosisId?: string        // set when --prior-report carried facts forward
  preApplyDumpPath?: string        // apply only (restore-english's is englishRestore.dumpPath)
  conflicts: TranslationFinding[]  // classification === "conflict" | "newerWork"
}
```

**The report never stores credentials.** No connection URL, password, SSH host,
or `secrets.json` content appears in it. Connection strings echoed anywhere are
redacted to `postgres://user:***@host:port/db`. The file is written mode `0600`
into a `0700` directory, as is the sibling `report.journal.jsonl` — the journal
carries the same translation text and is an operator artifact, never sent to the
client.

### `ProductionFingerprint`

Identity evidence re-checked by every write subcommand, so the `diagnosisId`
gate cannot be satisfied by a report from a different database or a hand-edited
file (invariant I13).

```
ProductionFingerprint {
  databaseName: string
  lessonCount: number
  maxMasterId: number
  maxLessonStringId: number
}
```

Validation: `restore-english`, `apply`, `verify`, **and
`diagnose --prior-report`** re-verify `diagnosisChecksum` **and**
`reportChecksum`, and re-read `databaseName`; a mismatch on any of the three
aborts with exit 20 before anything else runs. `verify` is included because it
mutates the report and produces the artifact the client reads.
`diagnose --prior-report` is included because the prior report is a **trust
input**: it supplies `knownBadVersions`, which is the entire foundation of I16,
so a hand-edited prior report with an empty list would silently disarm the
cover-file denial on exactly the path the flag exists for. The
count/max fields are recorded as evidence and reported on change rather than
hard-gating, since legitimate translator activity moves them.

The two checksums are not redundant. `reportChecksum` covers the whole file and
is recomputed on every append, so it only detects tampering since the last tool
write. `diagnosisChecksum` covers **only the diagnosis-produced fields**
(`identity`, `affectedLessons`, `mappings`, `findings`, `perLanguageCounts`,
`blastRadius`, `plannedWrites`, `conflicts`) and is frozen at `diagnose` time —
it is the one that proves the diagnosis being applied is the diagnosis a human
reviewed at the runbook's step-4 gate.

### `LanguageCounts`

Feeds SC-002 and FR-013.

```
LanguageCounts {
  languageId: number; languageName: string; archived: boolean
  snapshotReachable: number        // pre-incident reachable translations
  productionReachableBefore: number
  productionReachableAfter: number | null   // apply/verify only
  restored: number; conflicts: number; newerWork: number; lost: number
  driftSkipped: number             // apply only; planned but withheld (I11)
}
```

`restored` counts writes **actually applied**, so
`restored + driftSkipped === plannedWrites` for that language. The two must not
be conflated: the client report's "restored" figure has to be the real one.
`driftSkipped` counts benign (`intact`) drift too, so it can be non-zero while
apply still exits 0.

A language outside `applyState.scopedLanguageIds` has
`productionReachableAfter === null` and is reported by `verify` as **not yet
applied**, not as a zero-restore outcome.

---

## Part C — Invariants the implementation must uphold

| #   | Invariant                                                                                                                                          | Enforced by                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | The snapshot database receives zero writes, ever.                                                                                                  | `PGSnapshotStorage` overrides + read-only session                                                                                                                                                                       |
| I2  | Dry run performs zero writes to either database.                                                                                                   | No write call reachable from `diagnose`                                                                                                                                                                                 |
| I3  | A production value differing from the snapshot is never overwritten.                                                                               | D7 table; `RestoreWrite` emission rule                                                                                                                                                                                  |
| I4  | Every write goes through `saveTStrings` (never a bare INSERT).                                                                                     | `restoreWrite` wrapper is the only writer                                                                                                                                                                               |
| I5  | Re-running apply produces zero writes and zero new rows.                                                                                           | `saveTStrings` equal-text short-circuit                                                                                                                                                                                 |
| I6  | Overwritten production values are retained in `history`.                                                                                           | `saveTStrings` history append                                                                                                                                                                                           |
| I7  | Archived languages are enumerated in the diagnosis (not silently dropped).                                                                         | Raw SQL reads, bypassing `NOT archived`                                                                                                                                                                                 |
| I8  | Nothing outside the affected lesson's master strings is written.                                                                                   | Write plan derived only from `mappings`                                                                                                                                                                                 |
| I9  | Apply cannot run without a matching prior diagnosis report and a fresh production dump.                                                            | Apply preconditions (research D9)                                                                                                                                                                                       |
| I10 | Language progress is recomputed with `await` before the process exits.                                                                             | `awaitProgress: true` + terminal `await`                                                                                                                                                                                |
| I11 | No planned write is submitted without re-validating it against **live** production first.                                                          | Apply-time re-classification per batch; `DriftSkip` + exit 27                                                                                                                                                           |
| I12 | An interrupted apply still leaves a complete record of what was written.                                                                           | `ApplyState` flushed after every batch + append-only `report.journal.jsonl`; temp file in the same directory                                                                                                            |
| I13 | The report being applied is provably the report that was reviewed.                                                                                 | Frozen `diagnosisChecksum` + `reportChecksum` + `productionFingerprint.databaseName` re-verified                                                                                                                        |
| I14 | Two runs that write production or the report cannot overlap — **including `verify`**, which writes `languages.progress` and appends to the report. | `pg_try_advisory_lock` on a **reserved** (non-pooled) connection held for the whole run, taken by `restore-english`, `apply`, **and `verify`**; exit 28                                                                 |
| I15 | The historical master document survives being used as the restore source.                                                                          | Copying `mv` shim; source ≠ destination assertion                                                                                                                                                                       |
| I16 | The cover file can never be re-uploaded.                                                                                                           | `knownBadVersions` pinned at first diagnosis; hard denial, no override                                                                                                                                                  |
| I17 | Credentials never reach the report, stdout, logs, or the client-facing Markdown.                                                                   | URL redaction; report/dump `0600` in a `0700` dir                                                                                                                                                                       |
| I18 | Files the web server reads keep app-readable modes.                                                                                                | Umask scoped to dump/report writes; post-upload mode/owner assertion on the new ODT and preview                                                                                                                         |
| I19 | Rows duplicated through the residual write race are detected, not hidden, and not confused with pre-existing ones.                                 | Duplicate sweep at **both** `diagnose` (`duplicateRowsBaseline`) and `verify` (`duplicateRows`); non-empty delta → exit 30                                                                                              |
| I20 | The pinned facts survive a drift-recovery re-diagnosis.                                                                                            | `diagnose --prior-report` carries `knownBadVersions` + bump accounting forward; warns when omitted beside an existing report                                                                                            |
| I21 | No abort leaves production mid-change without a recovery instruction.                                                                              | Post-upload check repairs, re-checks, then aborts naming files, actual vs expected modes, and the fix command                                                                                                           |
| I22 | A `languageId` denotes the same language in both databases, or the run stops.                                                                      | Cross-database `code` join asserting id equality at `diagnose`; `languageIdentityChecks`; exit 15, never remap                                                                                                          |
| I23 | The document uploaded is byte-for-byte the document that was verified.                                                                             | `sha256`/`sizeBytes` pinned per candidate at diagnose, re-hashed at `restore-english`; real path confined to `docs/`; exit 22                                                                                           |
| I24 | A failed batch stops the run and is recorded, never swallowed.                                                                                     | Batch failure → `status: "failed"` + `failureMessage`, flush, print dump and journal paths, exit 32                                                                                                                     |
| I25 | Every precondition a subcommand states is one it can actually execute.                                                                             | Host-local checks re-run everywhere; snapshot-dependent checks asserted from the checksum-gated report (`snapshotIsOlder`, all `languageIdentityChecks.agrees`); `restore-english` and `apply` take no `--snapshot-url` |
| I26 | The drift-recovery loop can complete without re-restoring English.                                                                                 | `diagnose --prior-report` carries `englishRestore` forward marked `carriedFromDiagnosisId`; `apply` precondition 8 accepts it; `--force-report` refuses only on a **self-produced** entry                               |
| I27 | Two artifacts of one recovery never share a journal.                                                                                               | Journal path derived from the report basename; every line carries its `diagnosisId`                                                                                                                                     |
