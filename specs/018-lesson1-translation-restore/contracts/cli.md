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

| Option                     | Required | Description                                                                                                                                    |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--snapshot-url <url>`     | yes      | Postgres URL for the snapshot (typically `postgres://…@127.0.0.1:5433/…` over an SSH tunnel). May also be supplied as `SNAPSHOT_DATABASE_URL`. |
| `--report <path>`          | yes      | Path to the report file (written by `diagnose`, read by `apply`/`verify`).                                                                     |
| `--snapshot-confirmed <t>` | yes      | Operator's confirmation token proving the snapshot marker file was seen. Recorded verbatim in the report.                                      |
| `--book <name>`            | no       | Restrict detection (default: all books).                                                                                                       |
| `--json`                   | no       | Emit machine-readable output on stdout instead of the human summary.                                                                           |

Production connection comes from the deployed `secrets.json` (`db`), unchanged.
The snapshot credential is **never** read from `secrets.json`.

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
   `--force-report` to overwrite).

**Side effects**

- Writes exactly one file: the report at `--report`.
- **Zero database writes on either side** (I2, SC-005).

**Output** — human summary on stdout:

- identified production/snapshot pair and the checks that passed
- affected lesson(s), version bump count, selected mapping strategy
- candidate master documents under `docs/` and which matches the snapshot
- per language: intact / restore / conflict / newerWork / lost counts, with
  up to 3 sample texts per category
- shared-master-string blast radius (which other lessons are touched)
- legacy `lessonStringId IS NOT NULL` row counts, both databases
- count of rows with `modified IS NULL` (timestamp coverage)
- a closing line stating the exact `apply` command, including the
  `--diagnosis-id` produced

**Exit codes**

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| 0    | Diagnosis complete; report written                            |
| 10   | Production marker file missing / identity unverified          |
| 11   | Snapshot is not older than production (aborted)               |
| 12   | Snapshot connection failed or is writable when it must not be |
| 13   | No affected lesson detected                                   |
| 14   | Report path unwritable or already exists                      |
| 1    | Unexpected error                                              |

---

## `restore-english` — US2 (FR-006)

```
cli.js restore-english --report <path> --diagnosis-id <id> \
       --master-document <path> [--dump <dir>] [--force-relink]
```

**Preconditions**

1. All `diagnose` preconditions.
2. The report exists, its `diagnosisId` matches `--diagnosis-id`, and the
   production lesson version recorded in it still matches live production.
3. `--master-document` is one of the report's
   `candidateMasterDocuments` with `englishTextSetMatchesSnapshot === true`,
   unless `--force-relink` selects the direct re-link fallback.
4. A production `pg_dump -Fc` succeeds into `--dump` (default: the report's
   directory) with at least 3× the database size free.

**Side effects**

- One production dump file.
- Re-uploads the verified historical master document through
  `uploadEnglishDoc` (or, with `--force-relink`, writes the snapshot's
  `lessonstrings` generation directly). Bumps the lesson version.
- Regenerates the lesson's web preview (`webifyLesson` runs inside the upload
  path; the relink fallback calls it explicitly).
- Appends the result to the report.

**Exit codes**: 0 success; 20 report/diagnosis-id mismatch; 21 production
changed since diagnosis; 22 master document not verified against the snapshot;
23 dump failed or insufficient disk; 1 unexpected.

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
7. `--max-writes` (if given) is not exceeded by the plan; exceeding it aborts
   before any write.

**Expected-version rule (applies to `apply` and `verify`)**: precondition 2's
"production version still matches the report" is checked against
`englishRestore.newLessonVersion` when the report contains an `englishRestore`
entry, and against the diagnosis-time `productionVersion` otherwise.
`restore-english` deliberately bumps the lesson version, so checking against
the diagnosis-time value alone would make `apply` unsatisfiable after a
successful English restore. The check still catches the case that matters:
_someone else_ changed the lesson between our steps.

**Side effects**

- One production dump before any write.
- Writes only `plannedWrites` (classification `restore`), batched **one
  language at a time**, all through `saveTStrings` (I4).
- Awaits progress recomputation (I10).
- Appends `appliedWrites`, per-language after-counts, and the outstanding
  conflict list to the report.

**Guarantees**

- No row whose production text differs from the snapshot is touched (I3).
- No duplicate rows created (I4, no bare INSERT).
- Re-running `apply` with the same report writes nothing (I5).
- Every overwritten value is retained in `history` (I6).

**Exit codes**: 0 success; 20 report/diagnosis-id mismatch; 21 production
changed since diagnosis; 23 dump failed or insufficient disk; 24 English master
not yet restored; 25 write plan exceeds `--max-writes`; 1 unexpected.

---

## `verify` — US4 (FR-012, FR-013)

```
cli.js verify --snapshot-url <url> --report <path> --diagnosis-id <id> \
       [--out <path.md>]
```

**Preconditions**: report exists with `appliedWrites` recorded.

**Side effects**

- Recomputes and awaits `updateProgress()`.
- Writes a client-facing Markdown report at `--out`
  (default: alongside the JSON report).
- **No translation writes.**

**Output**: per-language before/after reachable-translation counts for the
affected lesson, the restored count, and the outstanding conflict list with
sample text — written in plain language, suitable to forward to the client.

**Exit codes**: 0 success; 26 no apply recorded in the report; 1 unexpected.

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
