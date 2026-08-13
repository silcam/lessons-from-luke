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

| Option                     | Required in       | Description                                                                                                                                                                            |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--snapshot-url <url>`     | `diagnose` only\* | Postgres URL for the snapshot (typically `postgres://…@127.0.0.1:5433/…` over an SSH tunnel). **Prefer `SNAPSHOT_DATABASE_URL`** — an argv password is world-readable in `ps`/`/proc`. |
| `--report <path>`          | all               | Path to the report file (written by `diagnose`, read by the write subcommands).                                                                                                        |
| `--snapshot-confirmed <t>` | `diagnose` only   | Operator's confirmation token proving the snapshot marker file was seen. Recorded verbatim in the report and re-read from it by every later subcommand.                                |
| `--book <name>`            | no (`diagnose`)   | Restrict detection (default: all books).                                                                                                                                               |
| `--json`                   | no                | Emit machine-readable output on stdout instead of the human summary. Redacted identically.                                                                                             |
| `--no-color`               | no                | Suppress ANSI colour. Colour is auto-suppressed when stdout is not a TTY; status is always also carried by a word (`OK` / `ABORT` / `DRIFT`), never by colour alone.                   |

\* `--snapshot-url` and `SNAPSHOT_DATABASE_URL` are alternatives; the env var is
the documented path and the flag emits a warning when used. `verify` accepts it
optionally (a snapshot comparison unless `--offline`); `restore-english` and
`apply` **do not accept it at all** — see the precondition split below.

### Which preconditions each subcommand can actually check

`diagnose`'s preconditions are of two kinds, and later subcommands can only
re-execute one kind. Conflating them makes `restore-english`'s and `apply`'s
"all `diagnose` preconditions" unsatisfiable as written, since neither holds a
snapshot connection.

- **Host-local preconditions — re-checked by every subcommand**: the
  `THIS_IS_THE_PRODUCTION_SERVER` marker file (10), report path/permissions
  (14), and the report checksum/database-name gate (20).
- **Snapshot-dependent preconditions — established once, at `diagnose`, and
  thereafter carried in the checksum-gated report**: the snapshot connection and
  `snapshotVersion < productionVersion` (11/12), and the I22 cross-database
  language-identity check (15). `restore-english` and `apply` re-verify them by
  asserting the report records them as passed (`identity.snapshotIsOlder`,
  a non-empty `languageIdentityChecks` with every entry `agrees: true`), not by
  reopening the snapshot. The frozen `diagnosisChecksum` is what makes reading
  them out of the report as trustworthy as recomputing them.

Consequence, stated plainly because it is a real operational property: **the
snapshot server only needs to be reachable during `diagnose` (and during a
non-`--offline` `verify`)**. If it is torn down after diagnosis, the restore
still completes. That is a strengthening of the external assumption the spec
carries, not a weakening.

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
cli.js diagnose --snapshot-url <url> --report <path> --snapshot-confirmed <token> \
       [--prior-report <path>] [--force-report]
```

`--prior-report` carries `knownBadVersions`, this tool's bump accounting, and
the prior `englishRestore` record forward from an earlier report, and records
its `diagnosisId` as `priorDiagnosisId`. The `englishRestore` carry-forward is
what keeps `apply`'s precondition 8 satisfiable on the drift-recovery path (see
`apply` below); the carried entry is marked `carriedFromDiagnosisId` so it is
never read as this run's own work. It is **required on the drift-recovery re-diagnosis**: that
run writes to a new report path so it cannot clobber the audit artifact, and
without the flag it silently loses the cover-file denial and mis-warns on
`bumpCount` (I20). When it is omitted and a report already exists in the same
directory, the tool **aborts (14)** rather than proceeding blind.

The prior report is a **trust input**: `knownBadVersions` is the whole
foundation of the cover-file denial. `diagnose` therefore verifies the prior
report's `diagnosisChecksum`, `reportChecksum`, and
`productionFingerprint.databaseName` before reading anything from it, aborting
with exit 20 on mismatch — the same gate the write subcommands apply.

**Preconditions**

1. `THIS_IS_THE_PRODUCTION_SERVER` exists in the invoking user's home directory.
2. The snapshot connection opens and is older than production for the affected
   lesson (`snapshotVersion < productionVersion`).
3. **Language identity agrees across the two databases (I22).** `languages` is
   joined across the databases (unfiltered raw SQL, so archived languages
   participate) and every matched pair must satisfy
   `snapshotLanguageId === productionLanguageId`. `languageId` is a serial,
   exactly like `lessonId` and `masterId`, and every finding and write carries
   one bare value used on both sides — a divergence would write one language's
   translations into another language's rows. Also fatal: two snapshot
   languages mapping to one production language, and a snapshot language with
   affected-lesson translations having no production counterpart under the
   chosen key. Verified and aborted on (15), **never remapped** — divergence
   means the operator has the wrong snapshot. Languages present only in
   production are recorded, not fatal.

   **The join key is chosen at runtime.** `languages.code` is declared bare
   `text` — nullable and not unique — so joining on it unconditionally would
   rest this guard on an unchecked assumption: NULL codes collapse into one
   group and duplicate codes make the pairing arbitrary, letting a real
   divergence pass. `diagnose` tests `code` on **both** databases for non-null
   and unique, falls back to testing `name` identically, and aborts (15) naming
   the offending rows when neither qualifies. `matchedBy` records which was
   used. Under a `name` fallback, a language renamed since the snapshot is
   indistinguishable from an absent one, so the abort message MUST name the
   fallback and tell the operator to populate `languages.code` uniquely and
   re-run — otherwise a healthy database reads as a wrong snapshot.

4. `--report <path>` is writable and does not already exist (use
   `--force-report` to overwrite). **`--force-report` MUST refuse** to
   overwrite a report that already contains a **self-produced** `englishRestore`
   (not one carried from `--prior-report`) or `appliedWrites`, or beside which
   **that report's own** non-empty journal exists — those are the record of what
   was done to production and the pointer to the pre-apply dump.

   **The journal name is derived from the report filename**, not fixed:
   `<report-basename-without-extension>.journal.jsonl`, so
   `/rec/report.json` → `/rec/report.journal.jsonl` and
   `/rec/report-2.json` → `/rec/report-2.journal.jsonl`. A fixed
   `report.journal.jsonl` breaks on the drift-recovery path, which mandates a
   second report **in the same directory**: two runs would append to one journal,
   destroying the per-report "the journal wins" reconciliation that SC-004's
   audit trail depends on, and the refusal above would fire on the first report's
   journal and make the second report unusable. Every journal line also carries
   its `diagnosisId`, so a journal that is somehow shared is still separable.

5. `--report`'s directory is mode `0700` (created so, or aborted on).
6. `--prior-report` is supplied, **or** no report already exists in
   `--report`'s directory. Proceeding blind beside an existing report loses the
   pinned `knownBadVersions` and mis-warns on `bumpCount` (14).

**Side effects**

- Writes exactly one file: the report at `--report`, mode `0600`.
- **Zero database writes on either side** (I2, SC-005).
- Records `duplicateRowsBaseline` — duplicates that already exist before this
  tool touches anything, so `verify` can report a delta instead of blaming the
  restore for pre-existing data defects (I19).
- Records `languageIdentityChecks` — the cross-database `code`→id agreement
  evidence for every language (I22).
- Records `sha256` and `sizeBytes` for every `candidateMasterDocuments` entry,
  so `restore-english` can prove the file it uploads is the file that was
  verified here (I23).

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
- pre-existing duplicate rows found by the baseline sweep, if any
- a closing line stating the exact `apply` command, including the
  `--diagnosis-id` produced

**Exit codes**

| Code | Meaning                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Diagnosis complete; report written                                                                                                                                                                                         |
| 10   | Production marker file missing / identity unverified                                                                                                                                                                       |
| 11   | Snapshot is not older than production (aborted)                                                                                                                                                                            |
| 12   | Snapshot connection failed or is writable when it must not be                                                                                                                                                              |
| 13   | No affected lesson detected                                                                                                                                                                                                |
| 14   | Report path unwritable, already exists, its directory is group/world-readable, or a report exists beside it and `--prior-report` was omitted                                                                               |
| 15   | **Language identity unusable (I22)** — either the ids diverge (wrong snapshot) or neither `code` nor `name` qualifies as a join key (healthy database; fix the named `languages` rows and re-run). The message says which. |
| 20   | `--prior-report`'s checksums or database name do not verify                                                                                                                                                                |
| 1    | Unexpected error                                                                                                                                                                                                           |

---

## `restore-english` — US2 (FR-006)

```
cli.js restore-english --report <path> --diagnosis-id <id> \
       --master-document <path> [--dump <dir>] [--force-relink]
```

**Preconditions**

1. All of `diagnose`'s **host-local** preconditions (marker file, report
   path/permissions), plus the **snapshot-dependent** ones asserted from the
   report rather than re-executed: `identity.snapshotIsOlder === true` and every
   `languageIdentityChecks` entry `agrees: true`. This subcommand takes no
   `--snapshot-url` and opens no snapshot connection; requiring it to re-run
   checks that need one would make this precondition unsatisfiable.
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
4. **The bytes still match the bytes that were verified (I23)** — applies to
   the upload path; `--force-relink` uses no document and skips 3, 4, and 5.
   The file is re-hashed and must equal the candidate's recorded `sha256` and
   `sizeBytes`, and its resolved real path must lie inside the `docs/` root. The report is
   checksum-gated but the ODT on disk is not; without this, anything that
   replaces or symlinks `docs/Luke-1-01v157.odt` between diagnosis and restore
   passes every other gate and gets uploaded as the master. Mismatch aborts
   with 22.
5. `resolve(--master-document)` differs from the destination path the upload
   will write (`docs/{book}-{series}-{lesson}v{version+1}.odt`). `saveDoc`
   unlinks its destination first, so equality would delete the source.
6. A production `pg_dump -Fc` succeeds into `--dump` (default: the report's
   directory) with at least 3× the database size free **after** accounting for
   dumps already present there from earlier steps of this recovery.
7. The advisory lock is free (no other write subcommand running). It is taken
   **first, before the dump**, on a **reserved, non-pooled** connection
   (`sql.reserve()`) held for the whole run — `PGStorage` pools its connections,
   and a session-level lock on a pooled connection is released the moment that
   connection is recycled. If the lock is later found lost, the tool aborts
   (28); it never silently re-acquires, because re-acquiring would hide the
   interval in which someone else may have held it.

**Side effects**

- One production dump file, mode `0600` in a `0700` directory. It contains the
  **whole** database, including better-auth `user`/`account` (Argon2id hashes),
  `session`, and `invitation` tables — it must not leave the production host and
  must be deleted once the client confirms restoration. **Its path is recorded
  as `englishRestore.dumpPath`**: this dump is the only rollback route in the
  window between a successful English restore and `apply`, and `apply`'s
  `preApplyDumpPath` does not cover it. Both paths appear in the runbook's
  retention-and-destruction step so neither is left on disk.
- Re-uploads the verified historical master document through `uploadEnglishDoc`
  (or, with `--force-relink`, writes the snapshot's `lessonstrings` generation
  directly). Bumps the lesson version (157 → … → 159 for this incident, since
  the current production version is the 158 cover upload).
- **Copies, never moves,** the source document: the `UploadedFile` shim handed
  to `uploadEnglishDoc` implements `mv` as a copy so
  `docs/Luke-1-01v157.odt` — the only recovery source — survives.
- Asserts the new ODT and preview match the mode and owner of their
  pre-existing siblings in `docs/` (I18). This check runs **after** production
  has changed, so the tool attempts repair (`chmod`/`chown`) and re-checks
  first; only then does it abort — stating that Lesson 1 may currently be
  unreadable, naming the files with actual vs expected modes, and printing the
  exact fix command (exit 31).
- Regenerates the lesson's web preview (`webifyLesson` runs inside the upload
  path; the relink fallback calls it explicitly).
- Appends the result to the report and recomputes `reportChecksum`.

**Exit codes**: 0 success; 20 report/diagnosis-id/checksum/database mismatch;
21 production changed since diagnosis; 22 master document not verified against
the snapshot, is the known-bad upload, or collides with its destination path;
23 dump failed, insufficient disk, or unsafe dump directory permissions;
28 another write subcommand holds the advisory lock (or it was lost mid-run);
31 the uploaded document or preview does not have app-readable modes and repair
failed — **Lesson 1 may be unreadable, follow the printed fix command**;
1 unexpected.

---

## `apply` — US3 (FR-007..FR-011, FR-014)

```
cli.js apply --report <path> --diagnosis-id <id> \
      [--dump <dir>] [--languages <ids>] [--max-writes <n>]
```

`apply` takes **no `--snapshot-url`**. Everything it needs from the snapshot is
already in the checksum-gated report: the planned text (`plannedWrites[].text`),
the mappings the re-check reuses verbatim, and the reachable count that bounds
the computed `--max-writes` default (`perLanguageCounts[].snapshotReachable`).
The I11 re-classification compares those against **live production** only.
Opening a second connection here would add a credential on the command line, a
dependency on the snapshot still being up, and a second chance to point at the
wrong database — for no fact the report does not already carry under a frozen
checksum.

**Preconditions** — all seven of `restore-english`'s, plus:

8. The English master has been restored — the report records an `englishRestore`
   entry, **or carries one forward from `--prior-report`** (see below).
   Otherwise there is no spine to attach to.

   **The drift-recovery path depends on the carry-forward.** After exit 27 or
   32, the runbook re-diagnoses to a _new_ report path. English was restored
   under the _earlier_ report, so the new report has no `englishRestore` of its
   own and this precondition would abort with 24 — on precisely the path the
   whole `--prior-report` mechanism exists to serve, and with the misleading
   message "English master not yet restored" about a lesson that has been
   correctly restored. `diagnose --prior-report` therefore carries the prior
   `englishRestore` record forward alongside `knownBadVersions` and the bump
   accounting. It is a trusted source: the prior report's `diagnosisChecksum`,
   `reportChecksum`, and database name are all verified (20) before anything is
   read out of it.

   A carried entry is marked `carriedFromDiagnosisId`, so nothing downstream
   mistakes it for work this run performed: `verify` reports the English restore
   as having happened under that earlier report, and `--force-report`'s refusal
   to clobber an audit artifact keys on a **self-produced** `englishRestore`,
   never on a carried one — otherwise the second report becomes unoverwritable
   the moment it is created.

9. `--diagnosis-id` is supplied explicitly. Apply never runs off a report the
   operator did not name. This is the machine-checked form of FR-005's
   "human reviewed the dry run".
10. `--max-writes` is not exceeded by the plan; exceeding it aborts before any
    write. **When omitted it defaults to a computed sanity cap** — the
    snapshot's reachable translation count for the affected lesson × 1.2 — not
    to unbounded. A plan larger than that is a mapping failure, not a big
    recovery. When `--languages` is given, the cap is computed **over the scoped
    languages only**; a whole-corpus cap is no cap at all for a one-language run.
11. The report's `affectedLessons` contains only the lesson the operator named;
    a detection surprise cannot quietly widen the blast radius.
12. The advisory lock is free, taken on a reserved connection before the dump,
    and re-asserted as still held before each batch — aborting with 28 on loss,
    never re-acquiring.

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
- Records `applyState.scopedLanguageIds` (`null` when unscoped). `verify` reads
  it and reports languages outside the scope as **not yet applied**, plainly
  labelled — otherwise the client-facing report cannot distinguish a
  deliberately scoped run from a run that covered everything and restored
  nothing in eleven languages.
- **Stops on the first failed batch.** If a `saveTStrings` call throws
  (dropped connection, disk full, unexpected constraint error), the tool marks
  that batch `failed`, flushes `applyState` and the journal, prints the
  pre-apply dump path and the journal path, and exits **32** without attempting
  further languages. Continuing would keep writing under a fault whose cause is
  unknown. Partial application is expected here and already covered: the
  journal records exactly how far it got, and `diagnose --prior-report` re-plans
  from live production.
- Flushes `applyState`, `appliedWrites`, and `driftSkips` to the report
  **after every per-language batch**, atomically (temp file in the **same
  directory** → `fsync` → rename), so an interruption still leaves a complete
  record (I12). Each write is also appended to this report's own journal
  (`<report-basename>.journal.jsonl`, derived — never a fixed name), which is
  never rewritten; `appliedWrites` is reconciled from it at the end and the
  journal wins on disagreement.
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
lock; **32 a language batch failed and the run stopped — the journal and dump
paths are printed; re-diagnose with `--prior-report` before retrying**;
1 unexpected.

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
`diagnosisId` matches `--diagnosis-id`; its frozen `diagnosisChecksum` **and**
its `reportChecksum` verify; and its `productionFingerprint.databaseName`
matches the live database. All three checks, not just `reportChecksum` — verify
mutates the report and produces the artifact the client reads, so it has more
reason to prove the report's provenance than less (I13). Mismatch exits 20.

**`verify` also takes the advisory lock** (reserved connection, exit 28 if held),
on the same terms as the write subcommands. It is not read-only: it calls
`updateProgress()`, which **writes `languages.progress` on production**, and it
appends a `verification` record to the report and recomputes `reportChecksum`.
Run concurrently with `apply` — two terminals, or an operator verifying while a
stalled apply still holds its lock — the two rewrite `report.json` through
independent atomic renames, and whichever lands last silently discards the
other's record. That is a lost update on the one artifact SC-004 relies on.
Verify's exemption was never justified by anything except the phrase "no
translation writes", which is true and beside the point.

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
- Appends a `verification` record to the JSON report
  (`mode: "snapshot" | "offline"`, `coverage: "complete" | "partial"`,
  `unappliedLanguageIds`, `verifiedAt`, `clientReportPath`,
  `clientReportWithheld`) and recomputes `reportChecksum`.
- **Heads the client Markdown `INTERIM` when `coverage` is `"partial"`**,
  naming the outstanding languages. A `--languages`-scoped apply does not
  satisfy SC-002, which is stated over every active language, so the artifact
  must not read as a completed recovery. Coverage is computed over **this
  report's** plan; on a drift-recovery report (`priorDiagnosisId` set) the label
  says so, since the earlier run's applied languages are recorded in the earlier
  report. The counts themselves come from live production and are unaffected. Without it, a later
  reader of `report.json` cannot tell whether the after-figures came from a live
  snapshot comparison or from stored counts — the honesty `--offline` buys on
  the console evaporates once the scrollback is gone.
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

**Duplicate-row sweep (I19)**: `verify` re-runs the sweep
(`SELECT languageid, masterid, lessonstringid, count(*) … HAVING count(*) > 1`)
over the affected lesson's master strings, records the result in
`duplicateRows`, and reports the **delta against `duplicateRowsBaseline`** —
duplicates that predate the recovery are listed separately as pre-existing, not
blamed on the restore. This is the detection that compensates for the residual
write race apply cannot close. Any duplicate is a data defect a human must
resolve; a non-empty delta exits 30.

**On exit 30 the Markdown is still written**, with a `DRAFT — DO NOT SEND`
banner as its first heading naming the duplicate count and the affected
languages, and `verification.clientReportWithheld: true` in the JSON report.
Withholding the file entirely invites a hand-written substitute; writing it
silently invites an operator who skimmed the exit code to forward it. The
artifact says what is wrong with itself.

**Post-restore checks verify MUST report on** (both are consequences of the
version bump to 159):

- Lesson 1's TSub substitution suggestions now diff v159 against v158 — the
  cover page — so the suggestions offered to translators may be cover-page
  churn. State what they look like rather than letting a translator discover it.
- The web preview for the new version exists and is what the app serves
  (`webifiedHtmPath` is keyed `${lessonId}-${version}.htm`, so the v158 cover
  preview lingers on disk).

**Exit codes**: 0 success, no new duplicates; 20 report
checksum/diagnosis-id/database mismatch; 26 no apply recorded in the report;
28 another subcommand holds the advisory lock (or it was lost mid-run);
**30 new duplicate rows found against the baseline — resolve by hand before
sending the client report; the Markdown carries a DO-NOT-SEND banner**;
1 unexpected.

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
