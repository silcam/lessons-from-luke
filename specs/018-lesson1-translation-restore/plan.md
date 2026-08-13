# Implementation Plan: Luke Lesson 1 Translation Restoration

**Branch**: `018-lesson1-translation-restore` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-lesson1-translation-restore/spec.md`

## Summary

A client's accidental upload of a cover file as Luke Lesson 1's master document
replaced the English content and orphaned every language's translations of the
real Lesson 1 strings. Translation work has continued since, so a database
rollback is off the table.

The approach: a **four-subcommand operational CLI** (`diagnose`,
`restore-english`, `apply`, `verify`) living at
`src/server/tasks/restoreLesson/`, run on the production host, reading a
pre-incident snapshot database over an SSH tunnel through a read-only
`PGStorage` subclass. Diagnosis is pure computation over fetched rows and
writes nothing but a report file; that report is the machine-checked gate for
apply. English is restored by re-uploading the historical master document
through the app's own upload pathway **after** the report is durable — which
reuses the original master-string ids and re-attaches most translations for
free. Remaining orphans are copied through `saveTStrings` one language at a
time, and any production value that differs from the snapshot is left untouched
and reported as a conflict.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: `postgres@1` (domain driver via `Persistence`), existing `PGStorage`/`uploadEnglishDoc`/`webifyLesson`/`findTSubs`; no new runtime dependencies
**Storage**: PostgreSQL. Production via the deployed `secrets.json` (`db`, Unix socket). Snapshot via `SNAPSHOT_DATABASE_URL`/`--snapshot-url` over an SSH tunnel — **never** from `secrets.json`. **No schema changes, no migrations.**
**Testing**: Jest unit tests (TDD, red-green-refactor) over the pure diagnosis core; one integration test (`jest.integration.config.js`) recreating the incident in the test environment
**Target Platform**: Linux production server (`lukeproduction`), CLI invoked over SSH; built by the existing `tsc -b ./src/server`
**Project Type**: Server-side operational task within the existing four-layer web/desktop codebase
**Performance Goals**: Not latency-sensitive. Diagnosis over the full corpus must complete in minutes, not hours; reads are bulk-fetched per language rather than per string
**Constraints**: Zero writes in dry-run mode (SC-005); zero overwrites of post-snapshot edits (SC-003); every write reversible individually (history) and wholesale (pre-apply dump); recovery targeted within ~2 business days (SC-006)
**Scale/Scope**: One affected lesson, ~10²–10³ master strings, ~10–30 languages; one-shot operational run, not a recurring job

**Constraints carried from the brainstorm** (see Brainstorm Context below):
never overwrite newer work; targeted re-link/copy rather than rollback; a
human-reviewed dry-run gate before any write; `cleanDB.ts` must not run.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-08-13-lesson1-translation-restoration-requirements.md](../brainstorms/2026-08-13-lesson1-translation-restoration-requirements.md)

### Key Decisions Carried Forward

- **Never overwrite newer work** (David's decision over "backup wins" and "ask
  per conflict"): any post-snapshot production value wins; conflicts are
  reported, never auto-resolved. Implemented as the classification table in
  research D7, with **value comparison primary** and timestamps as evidence only.
- **Targeted re-link/copy, not rollback**: work continued in other languages;
  a full restore would destroy it. The write plan is derived solely from the
  affected lesson's master strings (invariant I8).
- **Dry-run gate**: writes happen only after a human reviews the diagnosis
  report. Made machine-checkable — apply requires the report file plus an
  explicitly-passed `diagnosisId` that still matches live production.
- **Snapshot is strictly read-only**, identified by marker file plus a data
  check; the tool refuses to run if it cannot tell the servers apart.

### Deferred Questions (resolved during planning)

| Deferred question                                          | Resolution                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How many version bumps since the snapshot?                 | **Measured at runtime, not assumed.** Both mapping strategies are built; `bumpCount` selects one (research D3). The snapshot's own `lessonstrings` generation is the primary source of pre-incident linkage, which makes the one-bump `findTSubs` limit non-binding. |
| Do legacy `lessonStringId`-scoped rows exist?              | **Counted, not assumed inert.** The diagnosis reports `count(*) FROM tstrings WHERE lessonstringid IS NOT NULL` on both sides and per finding (research D4).                                                                                                         |
| Conflict detection when `modified` is NULL                 | Value comparison is primary; a difference is a conflict regardless of timestamps. NULL-`modified` counts are reported (research D7).                                                                                                                                 |
| Write via `saveTStrings` or hand-rolled SQL?               | `saveTStrings`, wrapped — **one language per batch** (it dedupes by `masterId` ignoring `languageId`) and **`history: []` on inserts** (it routes non-empty-history rows to an UPDATE that no-ops for absent rows). Research D6.                                     |
| Should restored rows propagate to desktop clients?         | **Yes, deliberately** — `saveTStrings` stamps `modified = now`; back-dating would also corrupt future conflict evidence (research D8).                                                                                                                               |
| Connection topology                                        | Tool runs on production (socket-only DB); snapshot reached over `ssh -L 5433` (research D1, quickstart step 2).                                                                                                                                                      |
| Where to store the pre-apply dump                          | Operator-supplied `--dump <dir>`; the tool checks writability and ≥3× free space and aborts otherwise (research D9).                                                                                                                                                 |
| Restore English via the upload pathway, or direct re-link? | **Upload pathway, after diagnosis is durable** — resolving the spec/brainstorm tension by ordering. Preflight verifies the candidate ODT's English text set against the snapshot before use; direct re-link is the fallback (research D5).                           |

### Known incident version facts (supplied by the operator, 2026-08-13)

These are **facts, not assumptions** — but the tool still measures each one at
runtime and aborts on mismatch rather than trusting them (Principle Zeroth).

| Fact                                                       | Value                                   | How the tool re-derives it                                       |
| ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Affected lesson                                            | Luke, series 1, lesson 1                | `(book, series, lesson)` join across both databases (FR-002)     |
| Mistaken cover-file upload                                 | lesson **version 158**                  | live `lessons.version` on production                             |
| Correct pre-incident master                                | lesson **version 157**                  | `lessons.version` in the snapshot                                |
| Expected `bumpCount`                                       | **1** (158 − 157)                       | computed; drives strategy selection                              |
| Expected mapping strategy                                  | **`findTSubsBridge`** (bumpCount === 1) | selected from the measured `bumpCount` (research D3)             |
| Expected restore-source document, still on the prod server | `docs/Luke-1-01v157.odt`                | `docStorage.docFilepath` naming; verified against snapshot text  |
| Known-bad document (the cover file)                        | `docs/Luke-1-01v158.odt`                | version equals live production version → hard-denied (see below) |
| Version after a successful `restore-english`               | **159** (`docs/Luke-1-01v159.odt`)      | `uploadEnglishDoc` bumps `lesson.version + 1`                    |

Consequences the design must honour:

- **Historical masters survive.** `docStorage.saveDoc` writes to a
  version-suffixed path and only unlinks _that_ path, so v157 was never
  overwritten by the v158 upload. The v157 file is the expected recovery source,
  and its continued existence is a **precondition the tool checks**, not a hope.
- **`bumpCount === 1` is the expected branch**, so the `findTSubsBridge`
  strategy is the one that will actually run. `snapshotAnchored` remains built
  and tested as the fallback the runtime selects if reality differs (e.g. a
  further re-upload lands before we run) — but the report must state which
  branch it took, and a `bumpCount !== 1` result is a **stop-and-re-review
  signal for the operator**, not a silent path switch.
- **`restore-english` consumes the one-bump lookback.** After the v159 upload,
  production's `version - 1` generation is the cover page, so `findTSubs` /
  `diffLesson` can no longer bridge to v157. This is exactly why the mapping is
  persisted to the report before the English restore (research D5), and it is
  why apply-time re-validation (below) must **reuse the report's mapping** and
  never recompute it.

### Scope Boundaries (explicit non-goals)

- No schema changes, migrations, or constraint additions — including the
  tempting unique index on `tstrings`.
- No cover-file support, upload-confirmation UX, or automated backups
  (recurrence prevention is follow-up work).
- No general-purpose backup/restore tooling.
- Web/server only; desktop code untouched (desktop _sync behaviour_ is
  respected and documented, not modified).
- `cleanDB.ts` must not run during or after recovery.
- `saveTStrings`'s two latent defects are **compensated for, not fixed**, here.

## Constitution Check

_GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design._

| Principle                               | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zeroth — fidelity to reality            | PASS             | Every design decision is cited to code read during planning (research.md "Ground truth"). Two latent defects in `saveTStrings` were found by reading it and are compensated for explicitly rather than hoped past. Unknowables (bump count, legacy row count, disk space) are **measured at runtime and abort on failure**, not guessed.                                                                                                                                                                                                                                               |
| I — Test-First Development              | PASS             | Pure diagnosis/classification/planning core takes fetched rows and returns data — unit-testable under strict red-green-refactor with fixtures (research D11). One integration test recreates the incident end-to-end in the test environment, per the "Document Processing and Multi-Layer Verification" clause.                                                                                                                                                                                                                                                                       |
| II — Type Safety and Static Analysis    | PASS             | New code lives under `src/server/`, covered by the existing `tsc --noEmit -p src/server/tsconfig.typecheck.json` and ESLint. Explicit return types, no `any`; report shapes are declared types validated against `contracts/report.schema.json`.                                                                                                                                                                                                                                                                                                                                       |
| III — Code Quality Standards            | PASS             | JSDoc on exported functions and types; naming and import order per existing conventions; Prettier via lint-staged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| IV — Pre-commit Quality Gates           | PASS             | Standard pipeline; no `--no-verify`. Conventional commits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| V — Warning and Deprecation Policy      | PASS             | No new dependencies, so no new advisories; zero-warning build maintained.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VI — Layered Architecture / Persistence | PASS (with note) | All domain access goes through `Persistence` implementations: production via `PGStorage`, snapshot via `PGSnapshotStorage extends PGStorage`. **Note**: diagnosis reads use raw SQL _inside those storage subclasses_ because the interface's read methods filter archived languages and legacy `lessonStringId` rows — precisely the data the diagnosis must see. This matches the `cleanDB.ts` precedent (a `PGStorage` subclass adding task SQL); no SQL escapes into `core/` or a controller. Nothing is added to `core/`; the desktop path is untouched. See Complexity Tracking. |
| VII — Simplicity and Maintainability    | PASS             | One task directory, no new dependencies, no schema change, reuses `uploadEnglishDoc`/`webifyLesson`/`generateAllWebPreviews`/`saveTStrings` rather than reimplementing them. Both mapping strategies exist because production data selects one at runtime — that is required capability, not speculation (YAGNI holds).                                                                                                                                                                                                                                                                |

**Post-design re-evaluation**: unchanged. Phase 1 introduced no new
dependencies, no schema change, and no new layer crossings. The single item
worth a reviewer's attention is the raw-SQL-inside-a-storage-subclass note
above, recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/018-lesson1-translation-restore/
├── plan.md                      # This file
├── research.md                  # Phase 0 output — all deferred questions resolved
├── data-model.md                # Phase 1 output — existing schema reference + new in-memory types
├── quickstart.md                # Phase 1 output — the operator runbook
├── contracts/
│   ├── cli.md                   # Subcommands, preconditions, side effects, exit codes
│   └── report.schema.json       # The report artifact that gates apply
└── tasks.md                     # Phase 2 output (sp:05-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/server/
├── storage/
│   └── PGSnapshotStorage.ts             # NEW: read-only PGStorage subclass for the snapshot
│                                        #      (mutators throw; session read-only)
└── tasks/
    └── restoreLesson/                   # NEW
        ├── cli.ts                       # argument parsing, subcommand dispatch, exit codes
        ├── types.ts                     # DiagnosisReport, findings, mappings, writes
        ├── identity.ts                  # FR-001: marker file + data-based server identification
        ├── detectLesson.ts              # FR-002: affected-lesson + bumpCount + strategy selection
        ├── mapMasterStrings.ts          # findTSubs bridge / snapshot-anchored reconstruction
        ├── classify.ts                  # FR-008: the restore/intact/conflict/newerWork/lost table
        ├── planWrites.ts                # FR-007/011: RestoreWrite[] derivation, per-language batching
        ├── restoreWrite.ts              # FR-009: saveTStrings wrapper compensating its two defects
        ├── restoreEnglish.ts            # FR-006: ODT verification + upload path / relink fallback
        ├── report.ts                    # report read/write, diagnosisId gating, Markdown rendering
        ├── gateway.ts                   # the only I/O: bulk row fetches from both storages
        └── *.test.ts                    # co-located unit tests (repo convention)

src/server/tasks/restoreLesson/restoreLesson.integration.test.ts   # incident re-creation, end-to-end
```

**Structure Decision**: An operational task under `src/server/tasks/`,
following the established precedent of `cleanDB.ts`, `reparseEnglish.ts`,
`listTSubs.ts`, and `generateAllWebPreviews.ts` — a directory rather than a
single file because the pure/impure split (Constitution I) requires several
small modules. The snapshot storage class sits with its siblings in
`src/server/storage/` alongside `PGDevStorage`/`PGTestStorage`, which
established the "subclass, swap `this.sql`" pattern. Nothing is added to
`src/core/`, `src/frontend/`, or `src/desktop/`.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec
> gets an acceptance spec file created during `sp:05-tasks`. Files live in
> `specs/acceptance-specs/` in GWT format. Numbering continues the repo-wide
> sequence (latest existing: `US14`).

| User Story                                              | Acceptance Spec File                                     | Scenarios |
| ------------------------------------------------------- | -------------------------------------------------------- | --------- |
| US1: Diagnose the damage before touching anything       | `specs/acceptance-specs/US15-diagnose-damage.txt`        | 5         |
| US2: Restore the English master content                 | `specs/acceptance-specs/US16-restore-english-master.txt` | 3         |
| US3: Restore translations without destroying newer work | `specs/acceptance-specs/US17-restore-translations.txt`   | 5         |
| US4: Verify and hand back to the client                 | `specs/acceptance-specs/US18-verify-and-handback.txt`    | 2         |

The harness for all four is the incident re-creation described in research D11:
inside the test environment, build a lesson with translations through the app's
own upload path, capture that state as the snapshot side, upload a different
document to orphan the translations, then exercise diagnose → restore-english →
apply → verify.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Edge Cases & Error Handling

### Concurrency drift between `diagnose` and `apply` (CRITICAL — I11)

The write plan is computed at diagnosis time and executed minutes-to-hours
later, on a system whose defining premise is that **translators are actively
working**. The only staleness check in the original design is the lesson
version, which catches another master upload but is blind to translation edits.

Both outcomes of the drift break a hard invariant:

- A row classified `restore` (production absent) that a translator has since
  created with different text: the wrapper submits it with `history: []`, so
  `saveTStrings` routes it to `toAdd`, which either **overwrites newer work**
  (violating FR-008 / SC-003) or **inserts a duplicate row** (violating FR-011 —
  `tstrings` has no unique constraint). Which of the two happens does not
  matter; both are unacceptable.
- A row classified `conflict` that the translator has since reverted is a
  missed restore — harmless, and stays a reported conflict.

**Mitigation (I11)**: `apply` re-fetches live production rows for the exact
`(languageId, masterId)` pairs in the planned batch, **immediately before each
per-language batch**, and re-runs the D7 classification against them. Only rows
still classifying as `restore` are written. Anything that drifted is skipped,
recorded as a `DriftSkip`, and reported. Apply exits non-zero (27) when any
drift is detected so the operator re-diagnoses rather than assuming completeness.

Two constraints on the re-check:

- It reuses the report's `mappings` verbatim. It must **not** recompute the
  master-string mapping, because after `restore-english` the production
  `bumpCount` relative to the snapshot is 2 and the strategy would flip.
- The re-fetch uses the same unfiltered raw SQL as diagnosis (research D4), not
  the `Persistence` read methods, or archived languages and legacy
  `lessonStringId` rows go invisible again and drift is under-detected.

This also subsumes the "stale write plan after the English restore" hazard:
`restore-english` can mint new `masterId`s for any text not already present in
production, and the re-check sees the post-upload landscape rather than the
diagnosis-time one.

### The restore-source document must survive being used

`uploadEnglishDoc` → `docStorage.saveDoc` calls `file.mv(filepath)` on an
`express-fileupload` `UploadedFile`. The CLI has a filesystem path, not an HTTP
upload, so it must supply a shim. **That shim's `mv` MUST copy, not rename.** A
renaming shim would consume `docs/Luke-1-01v157.odt` — the only recovery source
— as a side effect of using it, leaving no second attempt if the upload fails
midway.

Additionally: `saveDoc` unlinks its destination before writing. The tool MUST
assert `path.resolve(source) !== path.resolve(destination)` and abort if they
are equal, so a version-arithmetic error can never delete the source file.

### Known-bad document guard (misuse)

The known-bad version MUST be **pinned in the report**, not derived from the
live production version. `isKnownBadUpload = (version === live production
version)` is correct only until `restore-english` bumps production to 159 — at
which point a re-diagnosis would stop flagging v158, the actual cover file, and
start flagging v159, the file we just correctly restored. `diagnose` records
`knownBadVersions: [158]` (the production version at first diagnosis, plus any
carried forward from a prior report) and every later command reads the pinned
list.

The incident _was_ an operator uploading the wrong file. The tool must make
repeating it impossible rather than unlikely:

- `--master-document` is rejected when its parsed version equals the live
  production lesson version (that is the cover file, v158) — with **no
  `--force` escape**.
- `--master-document` is rejected unless the report lists it as a candidate
  with `englishTextSetMatchesSnapshot === true`. `--force-relink` selects the
  direct-relink fallback; it does **not** authorise an unverified document.
- The human summary names the resolved document and its version explicitly, so
  the step-4 review gate has something concrete to check.

### Version parsing is variable-width

`docStorage.docFilepath` builds names with `zeroPad(version, 2)`, which pads to
a **minimum** of two digits and does not truncate: `v03`, but also `v157`. A
fixed two-digit regex parses `Luke-1-01v157.odt` as version 15 and would
silently mis-rank candidates. The candidate scanner MUST anchor on
`^{book}-{series}-{lesson:2}v(\d+)\.odt$` and MUST ignore the `*_odt`
extraction directories that exist alongside the documents in `docs/`.

### Crash mid-apply must not lose the audit trail

SC-004 requires every change to be enumerable. If `appliedWrites` is written to
the report only after the last batch, a crash, OOM, or dropped SSH session
leaves rows written on production and **no record of which**. The dump is still
the wholesale rollback, but the per-change evidence is gone.

**Mitigation (I12)**: the report is flushed to disk after **each per-language
batch**, atomically (write temp file, `fsync`, rename). The report carries an
`applyState` recording which language batches have completed, so a resumed or
re-diagnosed run can see exactly how far the previous attempt got.

Two constraints the atomic-rename claim depends on:

- The temp file MUST be created **in the same directory** as the report.
  `rename(2)` is only atomic within a filesystem; a temp file in `/tmp` gives a
  copy, not a rename, and can leave a truncated report.
- The whole report (findings for ~10²–10³ strings × ~10–30 languages) is
  rewritten on every flush. To keep the audit trail cheap and append-only, the
  per-write log is **also** appended line-by-line to a sibling
  `report.journal.jsonl` as each batch completes, and the report's
  `appliedWrites` is reconciled from it at the end. If the two ever disagree,
  the journal wins — it is the one artifact that is never rewritten.

### Report integrity and identity

The `diagnosisId` gate assumes the report file is trustworthy. It is a plain
JSON file on a shared server that a well-meaning operator can edit.

**Mitigation (I13)**: the report records a `productionFingerprint` (database
name plus a stable count/max-id signature) and **two** checksums, because they
answer different questions:

- `diagnosisChecksum` — SHA-256 over **only the diagnosis-produced fields**
  (identity, affectedLessons, mappings, findings, perLanguageCounts,
  blastRadius, plannedWrites, conflicts), computed once by `diagnose` and
  **never recomputed**. This is the real human-review gate: it proves the
  diagnosis being applied is byte-for-byte the diagnosis that was reviewed at
  step 4 of the runbook.
- `reportChecksum` — SHA-256 over the whole body, recomputed on every append.
  This only detects tampering since the last tool write, which is why it cannot
  serve as the review gate on its own.

Every write subcommand verifies both plus `productionFingerprint.databaseName`
before doing anything; a mismatch aborts with exit 20. This makes "the report I
reviewed is the report being applied" a checked fact rather than a filename
convention.

### Concurrent invocations

Nothing prevents two operators — or an operator and a forgotten background
shell — from running `restore-english` or `apply` at the same time, which is
how duplicate rows get created in a table with no unique constraint.

**Mitigation (I14)**: every write subcommand takes a Postgres advisory lock
(`pg_try_advisory_lock` on a constant derived from the tool name) for its whole
run, and aborts with exit 28 if the lock is held.

**The lock MUST be taken on a dedicated, explicitly reserved connection** —
`sql.reserve()` in `postgres@1` — held for the process lifetime. `PGStorage`
pools its connections; a session-level advisory lock taken on a pooled
connection is released the moment that connection is recycled, which would make
the guard silently useless exactly when concurrency is highest. The tool asserts
it still holds the lock before each batch.

### The residual write race, and detecting what it costs

Apply-time re-classification (I11) narrows the drift window from "hours" to
"the gap between the re-fetch and the write", but it does not close it. It
cannot: `tstrings` has **no unique constraint**, so an absent row cannot be
locked, and adding one is outside this feature's scope boundary.

Two honest compensations rather than a false guarantee:

- The dumps and the apply run in a low-traffic window for the client's timezone,
  which is when concurrent edits are least likely.
- **`verify` runs a duplicate-row sweep** over the affected lesson's master
  strings: `SELECT languageid, masterid, lessonstringid, count(*) … HAVING
count(*) > 1`. Any duplicate is reported prominently with its rows, in both
  the JSON report (`duplicateRows`) and the client-facing Markdown. A duplicate
  is a data defect a human must resolve; the tool detects it rather than
  pretending it cannot happen.

This is recorded as a **known residual risk**, not as a solved problem.

### Drift severity, and re-diagnosing after drift

Two refinements to I11 that only become visible once it exists:

- **Not all drift is bad drift.** A planned write whose live row now holds the
  _identical_ text (`reclassifiedAs: "intact"`) is a benign no-op — someone
  re-typed what we were going to write. It is recorded but MUST NOT trigger
  exit 27. Only `conflict`, `newerWork`, and `lost` reclassifications do.
  Making a benign case alarm is how operators learn to ignore the alarm.
- **Re-diagnosing after a partial apply legitimately changes the strategy.**
  Once `restore-english` has bumped production to v159, a fresh `diagnose`
  computes `bumpCount = 2` and selects `snapshotAnchored`. That is correct, not
  a red flag. The "`bumpCount !== 1`, stop and re-review" warning MUST therefore
  be conditional: expected `bumpCount` is 1 before any English restore and
  `1 + (versions bumped by this tool)` afterwards, read from the prior report's
  `englishRestore`. The runbook's drift-recovery loop would otherwise fire a
  scary warning on its own happy path.

### Overwriting the audit artifact

`--force-report` must refuse to overwrite a report file that already contains
`englishRestore` or `appliedWrites`. That file is the record of what was done
to production and the pointer to the pre-apply dump; clobbering it destroys the
evidence for SC-004 and the operator's route back.

### `verify` when the snapshot is gone

The snapshot server's availability is an external assumption held by the
client's technical contact. If it is torn down between `apply` and `verify`,
the client never gets the report the whole engagement is being judged on.

**Mitigation**: `verify` accepts `--offline`, computing before/after counts from
the report's stored `perLanguageCounts` and live production only. It labels the
output as snapshot-independent so nobody mistakes it for a fresh comparison.

### After-effects of the English restore

- **TSub suggestions**: `findTSubs` → `diffLesson` diffs the live lesson against
  `oldlessonstrings` at `version - 1`. After the v159 restore that prior
  generation is the **cover page**, so the substitution suggestions offered to
  translators will be cover-page-to-lesson churn. `computeLessonDiffs` is
  currently commented out, so nothing is persisted — but the live path is
  reachable. The verification step MUST check what Lesson 1's TSub suggestions
  look like post-restore and note the result for the client; if they are
  nonsense, saying so beats a translator discovering it.
- **Web previews**: `webifiedHtmPath` is keyed `${lessonId}-${version}.htm`, so
  the v159 preview is a new file and the v158 (cover) preview lingers on disk.
  Verification MUST confirm the app serves the v159 preview and that Lesson 1
  no longer renders the cover page.

### Existing edge cases, unchanged

The spec's edge-case list (multi-bump, snapshot post-dates the incident, legacy
`lessonStringId` rows, NULL `modified`, no uniqueness constraint, interrupted
apply, shared strings, wrong-server confusion) is already answered in research
D2–D9 and is not restated here.

## Security & Privacy Considerations

### The pre-apply dump is a full credential dump

`pg_dump -Fc lessons-from-luke` captures **the entire database**, not the
translation tables. That includes the better-auth-owned `user` and `account`
tables (Argon2id password hashes), `session` (live session tokens), and
`invitation` (AES-256-GCM-encrypted invite tokens). Two such dumps are produced
(`restore-english` and `apply`) and the runbook currently leaves them in
`~/recovery` indefinitely, with whatever the ambient umask gives them.

Requirements:

- The dump directory MUST be created `0700` and the tool MUST verify its mode
  before writing; dump files MUST be written with mode `0600`.
- **The restrictive umask MUST be scoped to the dump and report writes only —
  never process-wide.** `restore-english` also writes files the _web server_
  reads: the copied master document (`docs/Luke-1-01v159.odt`) and the
  regenerated web preview (`docs/web/{lessonId}-159.htm`). A process-wide
  `umask 077` would create those `0600` owned by the CLI user, and if the app
  runs as a different user Lesson 1 breaks **worse than the incident** —
  unreadable instead of merely wrong. The umask is set immediately before and
  restored immediately after each dump/report write. After the upload, the tool
  MUST assert the new ODT and preview have the same mode and owner as their
  pre-existing siblings in `docs/`, and abort loudly if not.
- Dumps MUST NOT be copied off the production host — not to a laptop, not to
  cloud storage, not attached to anything sent to the client.
- The runbook MUST include an explicit **retention and destruction** step:
  delete the dumps once the client confirms the restoration (SC-006), and state
  the deletion in the closing note.
- The tool MUST refuse to write a dump into a world- or group-readable
  directory.

### Snapshot credentials must not leak

`--snapshot-url` carries a password. Passed on the command line it is visible
in `ps` and `/proc/<pid>/cmdline` to every other user on the production host,
and it lands in shell history. `SNAPSHOT_DATABASE_URL` is better but still
appears in the process environment.

Requirements:

- The env var is the **documented** path; `--snapshot-url` remains supported
  but the tool prints a warning when it is used.
- The connection URL MUST be redacted (`postgres://user:***@host:port/db`)
  everywhere it is echoed: stdout, `--json` output, error messages, and the
  report. The report MUST NOT store the URL, password, or the SSH hop details.
- The runbook MUST tell the operator to prefix the `export` with a space (or
  use `read -s`) so the password stays out of shell history, and to close the
  SSH tunnel when finished.

### Report artifacts contain the corpus

`report.json` contains the full text of every affected translation in every
language, plus internal paths, database names, and the snapshot server's role.
It is a working artifact for the operator, not a deliverable.

Requirements:

- `report.json` and the pre-apply dumps are written `0600` into a `0700`
  directory.
- The client-facing Markdown (`--out`) MUST contain **no** credentials, server
  IP addresses, filesystem paths, database names, or stack traces. Counts,
  language names, lesson identity, conflict sample text, and the `diagnosisId`
  are the permitted content.
- Conflict sample text in the client report is translation content the client
  owns; it stays. Nothing else internal does.

### Least privilege and blast radius

- The snapshot connection SHOULD use a Postgres role with only `SELECT`, in
  addition to the `default_transaction_read_only` session setting and the
  throwing `PGSnapshotStorage` overrides (research D1). Three independent
  guards, none of which is trusted alone.
- The tool never accepts a production connection string as an argument; it
  reads production from the deployed `secrets.json` only. This makes
  "accidentally pointed the write side at the wrong database" unrepresentable.
- The tool MUST never log the contents of `secrets.json` or any part of it.

### Misuse and abuse

This is an operator tool on a trusted host, so the threat model is
**operator error under time pressure**, not an external attacker. The guards
that matter are the ones above plus:

- `--max-writes` defaults to a computed sanity cap (the snapshot's reachable
  translation count for the affected lesson, times 1.2) rather than being
  unbounded when omitted. A write plan larger than that is a mapping failure,
  not a big recovery, and MUST abort before any write.
- `apply` refuses to run against a report whose `affectedLessons` contains more
  than the lesson the operator named, so a detection surprise cannot quietly
  widen the blast radius.
- Every abort path exits non-zero with a distinct code and a sentence saying
  what to do next. Silent success on a partial run is the failure mode that
  costs the client's trust.

## Performance & Resource Considerations

- **Disk headroom is cumulative, not per-command.** `restore-english` and
  `apply` each take a full dump, so the 3× free-space check MUST account for
  dumps already present in `--dump` from earlier steps of the same recovery
  (effectively 4× the database size across the run). The check runs immediately
  before each dump, not once at the start.
- **Filling the production disk takes the app down.** The free-space check is a
  hard abort, and the runbook states the dump directory must not be on a
  partition shared with `docs/` if that can be avoided.
- **`pg_dump` on a live production database** adds I/O load and holds a long
  transaction. Both dumps SHOULD be taken during a low-traffic window for the
  client's timezone (WAT), which is also the window with the fewest concurrent
  translator edits — the same window that minimises the drift handled by I11.
- **Reads are bulk, not per-string.** Diagnosis and the apply-time re-check
  fetch rows per language in single queries keyed by the mapped `masterId` set.
  At ~10²–10³ master strings × ~10–30 languages this is tens of queries, not
  tens of thousands.
- **`updateProgress()` over all languages** is the expensive tail. It is awaited
  once at the end of apply and once in verify, not per batch.

## Accessibility

Analyzed; **no material findings**. The feature's entire surface is a CLI run
over SSH by one developer plus a Markdown report. Two requirements carried
anyway because they are cheap and concrete:

- CLI output MUST NOT rely on colour alone to distinguish pass from fail —
  every status line carries a word (`OK`, `ABORT`, `DRIFT`), and colour is
  suppressed when stdout is not a TTY.
- The client-facing Markdown uses real heading levels and real tables (not
  ASCII art or indentation), so it stays readable in an email client and to a
  screen reader.

No UI, no forms, no keyboard navigation, no colour contrast surface exists in
this feature.

## Complexity Tracking

| Violation                                                                                             | Why Needed                                                                                                                                                                                                      | Simpler Alternative Rejected Because                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw SQL for diagnosis reads (inside `PGStorage` subclasses, not through the interface's read methods) | `Persistence.languages()`/`tStrings()` filter out archived languages, and `tStrings({lessonId})` filters out legacy `lessonStringId`-scoped rows — exactly the rows the diagnosis exists to find (research D4). | Using the interface reads would silently under-report orphans and could lose an archived language's translations entirely — a correctness failure, not a style preference. The SQL stays inside the storage layer, matching `cleanDB.ts`. |
| Two master-string mapping strategies rather than one                                                  | The number of version bumps since the snapshot cannot be read from this repo; both branches are reachable in production (research D3).                                                                          | Picking one at planning time is a guess that fails silently on the wrong branch; the tool measures `bumpCount` and selects, reporting which it used.                                                                                      |
| A wrapper around `saveTStrings` instead of calling it directly                                        | Two defects in `saveTStrings` (masterId-only dedupe across languages; "has history" used as "row exists") would silently drop restored rows on exactly this feature's copy path (research D6).                  | Calling it directly loses data silently. Patching `saveTStrings` itself is out of scope during an incident recovery — it is the live app's shared write path; both defects are logged as follow-up work.                                  |
