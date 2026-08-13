# CLI Contract: `restoreLesson`

**Branch**: `018-lesson1-translation-restore`

This feature exposes **no HTTP endpoints**. Its interface is an operational
CLI run on the production host. This document is the contract: subcommands,
arguments, preconditions, side effects, exit codes, and output.

**Entry point**

```
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js <subcommand> [options]
```

Built by the existing `tsc -b ./src/server`. Source:
`src/server/tasks/restoreLesson/cli.ts`.

---

## Global options

| Option                     | Required | Description                                                                                                                                                                            |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--snapshot-url <url>`     | yes\*    | Postgres URL for the snapshot (typically `postgres://…@127.0.0.1:5433/…` over an SSH tunnel). **Prefer `SNAPSHOT_DATABASE_URL`** — an argv password is world-readable in `ps`/`/proc`. |
| `--report <path>`          | yes      | Path to the report file (written by `diagnose`, read by the write subcommands).                                                                                                        |
| `--snapshot-confirmed <t>` | yes      | Operator's confirmation token proving the snapshot marker file was seen. Recorded verbatim in the report. MUST NOT contain a credential.                                               |
| `--book <name>`            | no       | Restrict detection (default: all books).                                                                                                                                               |
| `--json`                   | no       | Emit machine-readable output on stdout instead of the human summary. Redacted identically.                                                                                             |
| `--no-color`               | no       | Suppress ANSI colour. Colour is auto-suppressed when stdout is not a TTY; status is always also carried by a word (`OK` / `ABORT` / `DRIFT`), never by colour alone.                   |

\* `--snapshot-url` and `SNAPSHOT_DATABASE_URL` are alternatives; the env var is
the documented path and the flag emits a warning when used.

Production connection comes from the deployed `secrets.json` (`db`), unchanged.
The snapshot credential is **never** read from `secrets.json`, and the tool
**never** accepts a production connection string as an argument — pointing the
write side at the wrong database is unrepresentable.

### Output redaction and file modes (all subcommands)

- Every connection string echoed to stdout, `--json`, a log line, an error
  message, or the report is redacted to `postgres://user:***@host:port/db`. The
  report stores no URL, password, or SSH host at all.
- The report file is written mode `0600`; its directory must be mode `0700`
  (the tool creates it so, and aborts if an existing directory is group- or
  world-readable). Dump files get the same treatment.
- **The restrictive umask is scoped to dump and report writes only — never
  process-wide.** `restore-english` also writes files the _web server_ reads
  (`docs/…v159.odt`, `docs/web/{lessonId}-159.htm`); creating those `0600` under
  the CLI user's ownership would leave Lesson 1 unreadable, which is worse than
  the incident. After the upload the tool asserts the new ODT and preview match
  the mode and owner of their pre-existing siblings in `docs/` (I18).
- `secrets.json` content is never logged.

---

## `diagnose` — US1 (FR-001..FR-005, FR-014)

```
cli.js diagnose --snapshot-url <url> --report <path> --snapshot-confirmed <token>
```

**Preconditions**

1. `THIS_IS_THE_PRODUCTION_SERVER` exists in the invoking user's home directory.
2. The snapshot connection opens and is older than production for the affected
   lesson (`snapshotVersion < productionVersion`).
3. `--report <path>` is writable and does not already exist (use
   `--force-report` to overwrite). **`--force-report` MUST refuse** to
   overwrite a report that already contains `englishRestore` or
   `appliedWrites` — that file is the record of what was done to production and
   the pointer to the pre-apply dump.
4. `--report`'s directory is mode `0700` (created so, or aborted on).

**Side effects**

- Writes exactly one file: the report at `--report`.
- **Zero database writes on either side** (I2, SC-005).

**Output** — human summary on stdout:

- identified production/snapshot pair and the checks that passed
- affected lesson(s), version bump count, selected mapping strategy — plus a
  loud warning when `bumpCount !== expectedBumpCount`. Expected is 1 for the
  first diagnosis (v157 → v158) and `1 + versions this tool bumped` for any
  later one, so re-diagnosing after a legitimate `restore-english`
  (`bumpCount` 2, `snapshotAnchored`) does **not** raise a false alarm on the
  drift-recovery path
- candidate master documents under `docs/`, each with its parsed version,
  whether it matches the snapshot's English text set, and whether its version is
  in the pinned `knownBadVersions` (the cover file). Expected for this incident:
  `docs/Luke-1-01v157.odt` matches, `docs/Luke-1-01v158.odt` is known-bad
- per language: intact / restore / conflict / newerWork / lost counts, with
  up to 3 sample texts per category
- shared-master-string blast radius (which other lessons are touched)
- legacy `lessonStringId IS NOT NULL` row counts, both databases
- count of rows with `modified IS NULL` (timestamp coverage)
- a closing line stating the exact `apply` command, including the
  `--diagnosis-id` produced

**Exit codes**

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0    | Diagnosis complete; report written                                               |
| 10   | Production marker file missing / identity unverified                             |
| 11   | Snapshot is not older than production (aborted)                                  |
| 12   | Snapshot connection failed or is writable when it must not be                    |
| 13   | No affected lesson detected                                                      |
| 14   | Report path unwritable, already exists, or its directory is group/world-readable |
| 1    | Unexpected error                                                                 |

---

## `restore-english` — US2 (FR-006)

```
cli.js restore-english --report <path> --diagnosis-id <id> \
       --master-document <path> [--dump <dir>] [--force-relink]
```

**Preconditions**

1. All `diagnose` preconditions.
2. The report exists, its `diagnosisId` matches `--diagnosis-id`, its
   frozen `diagnosisChecksum` **and** its `reportChecksum` verify, its
   `productionFingerprint.databaseName` matches the live database, and the
   production lesson version recorded in it still matches live production.
3. `--master-document` is one of the report's `candidateMasterDocuments` with
   `englishTextSetMatchesSnapshot === true`, unless `--force-relink` selects the
   direct re-link fallback. A candidate whose version is in the report's pinned
   `knownBadVersions` (`isKnownBadUpload === true` — the cover file,
   `Luke-1-01v158.odt`) is **hard-denied with no override** —
   `--force-relink` selects the fallback mechanism, it does not authorise an
   unverified document.
4. `resolve(--master-document)` differs from the destination path the upload
   will write (`docs/{book}-{series}-{lesson}v{version+1}.odt`). `saveDoc`
   unlinks its destination first, so equality would delete the source.
5. A production `pg_dump -Fc` succeeds into `--dump` (default: the report's
   directory) with at least 3× the database size free **after** accounting for
   dumps already present there from earlier steps of this recovery.
6. The advisory lock is free (no other write subcommand running). It is taken
   on a **reserved, non-pooled** connection (`sql.reserve()`) held for the whole
   run — `PGStorage` pools its connections, and a session-level lock on a pooled
   connection is released the moment that connection is recycled.

**Side effects**

- One production dump file, mode `0600` in a `0700` directory. It contains the
  **whole** database, including better-auth `user`/`account` (Argon2id hashes),
  `session`, and `invitation` tables — it must not leave the production host and
  must be deleted once the client confirms restoration.
- Re-uploads the verified historical master document through `uploadEnglishDoc`
  (or, with `--force-relink`, writes the snapshot's `lessonstrings` generation
  directly). Bumps the lesson version (157 → … → 159 for this incident, since
  the current production version is the 158 cover upload).
- **Copies, never moves,** the source document: the `UploadedFile` shim handed
  to `uploadEnglishDoc` implements `mv` as a copy so
  `docs/Luke-1-01v157.odt` — the only recovery source — survives.
- Regenerates the lesson's web preview (`webifyLesson` runs inside the upload
  path; the relink fallback calls it explicitly).
- Appends the result to the report and recomputes `reportChecksum`.

**Exit codes**: 0 success; 20 report/diagnosis-id/checksum/database mismatch;
21 production changed since diagnosis; 22 master document not verified against
the snapshot, is the known-bad upload, or collides with its destination path;
23 dump failed, insufficient disk, or unsafe dump directory permissions;
28 another write subcommand holds the advisory lock; 1 unexpected.

---

## `apply` — US3 (FR-007..FR-011, FR-014)

```
cli.js apply --snapshot-url <url> --report <path> --diagnosis-id <id> \
      [--dump <dir>] [--languages <ids>] [--max-writes <n>]
```

**Preconditions** — all of `restore-english`'s, plus:

5. The English master has been restored (the report records an `englishRestore`
   entry) — otherwise there is no spine to attach to.
6. `--diagnosis-id` is supplied explicitly. Apply never runs off a report the
   operator did not name. This is the machine-checked form of FR-005's
   "human reviewed the dry run".
7. `--max-writes` is not exceeded by the plan; exceeding it aborts before any
   write. **When omitted it defaults to a computed sanity cap** — the
   snapshot's reachable translation count for the affected lesson × 1.2 — not
   to unbounded. A plan larger than that is a mapping failure, not a big
   recovery.
8. The report's `affectedLessons` contains only the lesson the operator named;
   a detection surprise cannot quietly widen the blast radius.
9. The advisory lock is free, taken on a reserved connection, and re-asserted
   as still held before each batch.

**Expected-version rule (applies to `apply` and `verify`)**: precondition 2's
"production version still matches the report" is checked against
`englishRestore.newLessonVersion` when the report contains an `englishRestore`
entry, and against the diagnosis-time `productionVersion` otherwise.
`restore-english` deliberately bumps the lesson version, so checking against
the diagnosis-time value alone would make `apply` unsatisfiable after a
successful English restore. The check still catches the case that matters:
_someone else_ changed the lesson between our steps.

**Side effects**

- One production dump before any write (same `0600`/`0700`, whole-database
  credential-bearing caveat as `restore-english`).
- Writes only `plannedWrites` (classification `restore`) that **still classify
  as `restore` against live production at write time**, batched **one language
  at a time**, all through `saveTStrings` (I4).
- Awaits progress recomputation (I10).
- Flushes `applyState`, `appliedWrites`, and `driftSkips` to the report
  **after every per-language batch**, atomically (temp file in the **same
  directory** → `fsync` → rename), so an interruption still leaves a complete
  record (I12). Each write is also appended to a sibling
  `report.journal.jsonl`, which is never rewritten; `appliedWrites` is
  reconciled from it at the end and the journal wins on disagreement.
- Appends per-language after-counts and the outstanding conflict list, and
  recomputes `reportChecksum` (never `diagnosisChecksum`, which stays frozen).

**Apply-time re-validation (I11)** — the reason a stale plan cannot corrupt
production. Immediately before each per-language batch, apply re-fetches the
live production rows for that batch's `(languageId, masterId)` pairs — using
the same unfiltered raw SQL as diagnosis, so archived languages and legacy
`lessonStringId` rows stay visible — and re-runs the D7 classification.
Anything no longer `restore` is skipped and recorded as a `DriftSkip`. The
re-check **reuses the report's `mappings` verbatim** and never recomputes the
mapping: after `restore-english` the production-vs-snapshot `bumpCount` is 2 and
recomputation would flip the mapping strategy.

Drift where the live row now holds the _identical_ text
(`reclassifiedAs: "intact"`) is marked `benign: true`: recorded, but it does
**not** trigger exit 27. Only `conflict`, `newerWork`, and `lost` do.

**Guarantees**

- No row whose live production text differs from the snapshot is touched, even
  if it changed after the diagnosis (I3, I11).
- No duplicate rows created **by this tool** (I4, no bare INSERT; the drift
  re-check closes all but the sub-second window between the re-read and the
  write). That last window cannot be closed without a unique constraint, which
  is outside this feature's scope — see the residual-risk note below.
- Re-running `apply` with the same report writes nothing (I5).
- Every overwritten value is retained in `history` (I6).
- An interrupted apply leaves a complete record of what it wrote (I12).
- Two applies cannot overlap (I14).

**Known residual risk**: `tstrings` has no unique constraint, so an absent row
cannot be locked and the last sub-second race between re-read and write stays
open. It is compensated by detection, not by a false guarantee — `verify` runs
a duplicate sweep (I19) and reports any hit prominently.

**Exit codes**: 0 success, no non-benign drift; 20 report/diagnosis-id/checksum/database
mismatch; 21 production changed since diagnosis; 23 dump failed, insufficient
disk, or unsafe dump directory permissions; 24 English master not yet restored;
25 write plan exceeds `--max-writes` (explicit or the computed default);
29 report's `affectedLessons` does not match the named lesson; **27 completed
with non-benign drift — one or more planned writes were withheld because
production changed; re-run `diagnose`**; 28 another write subcommand holds the advisory
lock; 1 unexpected.

Exit 27 is a **completion-with-caveat**, not a failure: the writes that were
safe were applied and journaled. It is non-zero so that no script and no tired
operator reads a partial restore as a complete one.

---

## `verify` — US4 (FR-012, FR-013)

```
cli.js verify [--snapshot-url <url>] --report <path> --diagnosis-id <id> \
       [--out <path.md>] [--offline]
```

**Preconditions**: report exists with `appliedWrites` recorded; its
`reportChecksum` verifies.

`--offline` drops the snapshot requirement and computes before/after figures
from the report's stored `perLanguageCounts` plus live production. The snapshot
server's availability is an **external** assumption held by the client's
technical contact; if it is torn down between `apply` and `verify`, the client
must still get the report the engagement is judged on. Offline output is
labelled as snapshot-independent so nobody mistakes it for a fresh comparison.

**Side effects**

- Recomputes and awaits `updateProgress()`.
- Writes a client-facing Markdown report at `--out`
  (default: alongside the JSON report).
- **No translation writes.**

**Output**: per-language before/after reachable-translation counts for the
affected lesson, the **applied** restored count (not the planned one), any
`driftSkipped` count, and the outstanding conflict list with sample text —
plain language, suitable to forward to the client.

**Client-report content rules** — this file leaves the building:

- Permitted: counts, language names, lesson identity, conflict sample text
  (translation content the client owns), the `diagnosisId`, dates.
- Forbidden: credentials, connection strings, server IP addresses, filesystem
  paths, database names, stack traces, `masterId`/`lessonStringId` internals.
- Structure uses real Markdown headings and tables (not ASCII art), so it
  survives an email client and a screen reader.

**Duplicate-row sweep (I19)**: `verify` runs
`SELECT languageid, masterid, lessonstringid, count(*) … HAVING count(*) > 1`
over the affected lesson's master strings and records any hit in
`duplicateRows`, surfacing it prominently in the client-facing Markdown. This is
the detection that compensates for the residual write race apply cannot close.
Any duplicate is a data defect a human must resolve.

**Post-restore checks verify MUST report on** (both are consequences of the
version bump to 159):

- Lesson 1's TSub substitution suggestions now diff v159 against v158 — the
  cover page — so the suggestions offered to translators may be cover-page
  churn. State what they look like rather than letting a translator discover it.
- The web preview for the new version exists and is what the app serves
  (`webifiedHtmPath` is keyed `${lessonId}-${version}.htm`, so the v158 cover
  preview lingers on disk).

**Exit codes**: 0 success; 20 report checksum/diagnosis-id mismatch; 26 no
apply recorded in the report; 1 unexpected.

Web previews are regenerated by the existing task and are **not** re-implemented
here:

```
yarn generate-previews
```

---

## Contract tests

Each behaviour above is covered by a test in
`src/server/tasks/restoreLesson/cli.test.ts` (argument parsing, precondition
gating, exit codes) with the two storages doubled. The end-to-end path is
covered once in `restoreLesson.integration.test.ts`.
