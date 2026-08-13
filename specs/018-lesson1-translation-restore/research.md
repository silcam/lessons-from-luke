# Phase 0 Research: Luke Lesson 1 Translation Restoration

**Branch**: `018-lesson1-translation-restore` | **Date**: 2026-08-13
**Input**: `spec.md` (Deferred technical questions), `specs/brainstorms/2026-08-13-lesson1-translation-restoration-requirements.md`

All decisions below are grounded in code read during planning, cited by file
and symbol. Nothing here is inferred from memory of the schema.

---

## Ground truth established by code reading

| Fact                                                                                                                                                                                   | Source                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `tstrings` has **no primary key and no unique constraint** (`masterId serial`, `languageId`, `sourceLanguageId`, `source`, `text`, `history jsonb`, `lessonStringId`)                  | `migrations/1582711758713-LoadSchema.js`                             |
| Row identity in application code is the triple `(languageId, masterId, lessonStringId)`                                                                                                | `equal()` in `src/core/models/TString.ts`                            |
| `created` / `modified` columns were added later and backfilled; some write paths leave them stale                                                                                      | `migrations/1594220343825-addTimestampsColumns.js`                   |
| An English upload never deletes `tstrings`; it re-generates `lessonstrings` and archives the prior generation into `oldlessonstrings`                                                  | `uploadDocument.ts` → `saveDocStrings` → `storage.updateLesson`      |
| Identical English text reuses the existing `masterId` (so translations stay reachable); changed text mints a new `masterId` (orphaning every language's translation of the old string) | `PGStorage.addOrFindMasterStrings` (`findBy(engStrings, "text", …)`) |
| `findTSubs` bridges old→new masterIds across **exactly one** version bump (`storage.oldLessonStrings(lessonId, lesson.version - 1)`)                                                   | `src/server/actions/findTSubs.ts` → `diffLesson`                     |
| `Persistence.languages()` and `Persistence.tStrings()` **exclude archived languages**                                                                                                  | `PGStorage.languages`, `PGStorage.tStrings` (`NOT lang.archived`)    |
| `tStrings({ lessonId })` also filters `lessonStringId IN (current lesson strings) OR IS NULL` — legacy lesson-scoped rows are invisible through it                                     | `PGStorage.tStrings` (lessonId branch)                               |
| `updateProgress()` is fire-and-forget unless `saveTStrings(..., { awaitProgress: true })`                                                                                              | `PGStorage.saveTStrings`, `withProgressUpdate`                       |
| Desktop sync selects rows by `modified` recency                                                                                                                                        | `PGStorage` continuous-sync query (`WHERE modified > …`)             |

---

## D1. Where the tool lives, and how it reaches two databases

**Decision**: A CLI task at `src/server/tasks/restoreLesson/` (directory, not a
single file), compiled by the existing `tsc -b ./src/server` build and run as
`NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js <subcommand>`.
Production access uses the existing `PGStorage`. Snapshot access uses a new
`PGSnapshotStorage extends PGStorage` whose constructor replaces `this.sql`
with a connection built from **environment variables** (host/port/database/
user/password), never from `secrets.json`.

**Rationale**:

- `src/server/tasks/` is the established home for operational scripts
  (`cleanDB.ts`, `reparseEnglish.ts`, `listTSubs.ts`, `generateAllWebPreviews.ts`),
  and `cleanDB.ts` sets the precedent for subclassing `PGStorage` to add
  task-specific SQL while staying inside the storage layer.
- `PGDevStorage`/`PGTestStorage` already establish the "subclass, swap
  `this.sql`" pattern, so a snapshot variant costs nothing new.
- Env-var connection config keeps the snapshot's credentials out of the repo
  and out of `secrets.json` (which is deployed), and lets the operator point
  at an SSH-tunnelled local port.
- Production DB is socket-only in the deployed `secrets.json` shape, so the
  tool must run **on** the production host; the snapshot is reached by an SSH
  tunnel from that host (`ssh -L 5433:localhost:5432 172.26.12.108`), making
  the snapshot connection a TCP one on `127.0.0.1:5433`.

**Read-only enforcement**: `PGSnapshotStorage` overrides every mutating
`Persistence` method (`saveTStrings`, `updateLesson`, `createLesson`,
`addOrFindMasterStrings`, `updateLanguage`, `createLanguage`,
`archiveLanguage`, `updateProgress`, `updateLessonDiff`, …) to throw
`SnapshotIsReadOnlyError`, **and** the connection is opened against a
Postgres role/session marked read-only where available
(`SET default_transaction_read_only = on` on connect). Belt and braces: a
programming error cannot write to the snapshot even if the tool is mis-wired.

**Alternatives considered**:

- _Standalone script outside `src/`_ — rejected: escapes typecheck, lint, and
  the TDD gate (Constitution I, II, IV).
- _`pg_dump` the snapshot into a scratch schema in production_ — rejected:
  writes to production during a dry run, violating SC-005.
- _Reading the snapshot with raw `postgres()` calls, no storage class_ —
  rejected: Principle VI routes domain reads through `Persistence`.

---

## D2. Server identity verification (FR-001)

**Decision**: Three independent checks, all required, before any other work:

1. **Marker file** — `THIS_IS_THE_PRODUCTION_SERVER` must exist in the home
   directory of the invoking user on the host running the tool. If absent, the
   tool aborts (it refuses to believe it is on production).
2. **Snapshot marker** — the operator supplies the snapshot marker check as a
   preflight in the runbook (`ssh 172.26.12.108 ls THIS_IS_THE_SNAPSHOT_SERVER`);
   the tool records the operator's confirmation token in the report.
3. **Data check** — the tool compares both databases and asserts the snapshot
   side is _behind_: for the affected lesson, `snapshot.version <
production.version`, and the snapshot's max `tstrings.modified` predates
   production's. If the "snapshot" is not strictly older, abort with
   `SnapshotNotOlderError` (covers the spec's "snapshot post-dates the
   incident" edge case).

**Rationale**: A marker file alone can be copied; a data check alone can be
fooled by clock skew. Requiring both, plus a hard abort, makes wrong-server
confusion (spec edge case) structurally impossible rather than merely
unlikely. Writes are additionally impossible on the snapshot side per D1.

---

## D3. Affected-lesson detection and multi-bump mapping

**Deferred question**: "How many version bumps occurred since the snapshot; can
`findTSubs` bridge them?"

**Decision**: Do not answer this at planning time — **the tool measures it and
selects a strategy at runtime**. The diagnosis:

1. Joins `lessons` on `(book, series, lesson)` across both databases and reports
   every lesson whose `version` or `modified` differs. This resolves the "which
   Luke Lesson 1" series ambiguity from data (FR-002).
2. Computes `bumpCount = production.version − snapshot.version`.
3. Selects a mapping strategy:
   - `bumpCount === 1` → **findTSubs bridge**: `oldlessonstrings` at
     `lessonVersion = production.version − 1` is the pre-incident generation;
     old→new masterId mapping is derivable in-database.
   - `bumpCount > 1` → **snapshot-anchored reconstruction**: take the
     snapshot's own `lessonstrings` for the lesson as the pre-incident truth
     (masterId + xpath + type + position). This is strictly better than
     `oldlessonstrings` archaeology because the snapshot _is_ the pre-incident
     state. Match snapshot masterIds to production masterIds by **English text
     equality** (`tstrings` where `languageId = ENGLISH_ID`), falling back to
     `(type, xpath)` and then ordinal position, recording the match method per
     string in the report.
   - `bumpCount < 1` → abort (`SnapshotNotOlderError`, see D2).

**Rationale**: The snapshot contains the complete pre-incident `lessonstrings`
generation, so the one-version `findTSubs` limitation is not actually binding —
`findTSubs` becomes a corroborating check, not the primary mechanism. Designing
for both branches unconditionally means production data selects the path
instead of the plan gambling on a number nobody can read from this repo.

**Alternatives considered**: reconstructing from historical ODTs in `docs/` —
retained only as the fallback for D5's English restore, not as the primary
mapping source (parsing ODTs requires LibreOffice and is slower and lossier
than reading the snapshot's own linkage rows).

---

## D4. Orphan detection must bypass the Persistence read filters

**Decision**: Diagnosis reads go through `PGSnapshotStorage` /
`PGRestoreStorage` (a `PGStorage` subclass) using **raw SQL over `tstrings`,
`lessonstrings`, `oldlessonstrings`, `languages`, `lessons`** — not through the
filtered `Persistence` read methods.

**Rationale** (this is a correctness requirement, not a convenience):

- `languages()` and `tStrings()` both carry `AND NOT lang.archived`. An
  archived language's translations would be reported as "lost" and never
  restored. The diagnosis must enumerate **all** languages, flagging archived
  ones explicitly.
- `tStrings({ lessonId })` filters `lessonStringId IN (current lessonStringIds)
OR lessonStringId IS NULL`. Legacy lesson-scoped rows (the spec's _second
  orphan vector_) are invisible through it by construction. The diagnosis
  counts `SELECT count(*) FROM tstrings WHERE lessonstringid IS NOT NULL`
  (globally and for the affected lesson's masterIds, both sides) and reports
  it, rather than assuming the vector is inert.

The raw SQL lives inside a `PGStorage` subclass in the storage layer, matching
`cleanDB.ts`; no query escapes into `core/` or a controller. See the
Constitution Check in `plan.md`.

---

## D5. Restoring the English master (FR-006) — upload pathway vs direct re-link

**Tension**: the spec (US2 scenario 2) permits reusing the app's upload
pathway; the brainstorm's scope boundary forbids re-upload because each upload
burns the one-version `findTSubs` lookback.

**Decision**: **Sequence removes the conflict.** Diagnosis runs first and
persists the complete old→new masterId mapping to a durable report file
(`report.json`). Once that mapping is on disk, another version bump costs
nothing — there is no lookback left to burn. Then:

- **Primary path — re-upload the correct historical master document** through
  the app's own `uploadEnglishDoc` pathway, using the pre-incident ODT
  recovered from the production `docs/` shared directory. Preflight: parse the
  candidate ODT and compare its extracted string set against the **snapshot's**
  English `tstrings` for the lesson. Proceed only if the text set matches
  (allowing for ordering); on match, `addOrFindMasterStrings` reuses the
  original masterIds, which **auto-re-attaches every non-orphaned translation**
  and `webifyLesson` regenerates the preview for free.
- **Fallback — direct re-link.** If no `docs/` version matches the snapshot's
  English strings, write `lessonstrings` rows directly from the snapshot's
  linkage generation (masterId, type, xpath, motherTongue, ordering) at the
  next lesson version, archiving the current generation via the existing
  `updateLesson` path. Web previews are then regenerated explicitly.

**Rationale**: The upload path is the app's own, fully tested code; it is by
far the safest way to get a coherent lesson structure, and its masterId reuse
does most of Story 3's work automatically. The brainstorm's objection was
purely about ordering, and ordering is under our control. The preflight is
what makes it safe: uploading the _wrong_ document again is the incident, so
the document is verified against the snapshot before it is used, never trusted
by filename.

**Verification of the historical ODT is itself a diagnosis output** — the
diagnosis lists candidate files under `docs/` for the lesson with their
version-suffixed names and reports which (if any) matches the snapshot's
English text set.

---

## D6. Write path for restored translations (FR-009, FR-011)

**Deferred question**: use `saveTStrings` or direct SQL replicating its
semantics?

**Decision**: Use `PGStorage.saveTStrings`, but through a **task-local
`restoreWrite` wrapper** that compensates for two defects found in it, and
call it **one language at a time**.

Two defects in `saveTStrings` (`src/server/storage/PGStorage.ts`) that a naive
caller would be bitten by:

1. `tStrings = uniq(tStrings, (a, b) => a.masterId == b.masterId)` — dedupes by
   `masterId` **ignoring `languageId`**. Passing a multi-language batch
   silently discards every language but the first for a given masterId.
   → **Mitigation**: the restore batches strictly per `(languageId)`.
2. `discriminate(tStringsWithHistory, tStr => tStr.history.length > 0)` uses
   "has history" as a proxy for "row already exists". A translation copied from
   the snapshot to a **new** masterId while carrying its snapshot history lands
   in `toUpdate`; the `UPDATE … WHERE languageid AND masterid AND
lessonstringid IS NULL` matches zero rows and the restore **silently
   no-ops**. This is exactly the orphan-copy path.
   → **Mitigation**: for rows that do not exist in production, the wrapper
   submits `history: []` so they route to `toAdd`; the snapshot's prior history
   is preserved by writing it in a follow-up update keyed on the freshly
   inserted triple, or (simpler, chosen) by appending the snapshot's history
   entries to the report rather than the row. **Decision: restored new rows
   carry `history: []`**; the value being restored is the snapshot's current
   text, and the pre-restore production value (none, by definition) is what
   history exists to recover. Where production **does** have a row and the
   restore overwrites it, `saveTStrings` appends the production value to
   history automatically — which is precisely FR-009.

**Idempotency (FR-011)** comes free from `saveTStrings`: `if (existing &&
existing.text == tStr.text) return tStrings` — a re-run with identical values
writes nothing, adds no rows, and appends no history. The task adds a unit
test asserting a second apply is a no-op.

**Duplicate-row safety**: because `tstrings` has no unique constraint, the
wrapper never issues bare INSERTs; every write goes through `saveTStrings`,
whose existence check is the triple `(languageId, masterId, lessonStringId)`.
Restored rows always use `lessonStringId = null` (the shape all current code
writes), so the check is well-defined.

**Alternatives considered**: hand-rolled SQL replicating the semantics —
rejected (duplicates the subtlest code in the repo, and the defects above are
easier to _compensate for_ than to _re-derive_); patching `saveTStrings`
itself — rejected for this feature (a shared write path used by the live app;
changing it during an incident recovery widens blast radius beyond the spec's
scope boundary). Both defects are recorded as follow-up work.

---

## D7. Conflict detection when `modified` is NULL or stale (FR-008)

**Decision**: Value comparison is **primary**; timestamps are corroborating
only. For each (language, masterId) pair in scope:

| Production row | Snapshot row | Texts  | Classification                           |
| -------------- | ------------ | ------ | ---------------------------------------- |
| absent         | present      | —      | **Restore** (orphan re-attach / copy)    |
| present        | present      | equal  | **Intact** — no write (idempotent no-op) |
| present        | present      | differ | **Conflict** — leave untouched, report   |
| present        | absent       | —      | **Newer work** — leave untouched, report |
| absent         | absent       | —      | **Lost** — report (nothing to restore)   |

A differing value is a conflict **regardless of timestamps**, and regardless of
which lesson the edit came through — which satisfies the "shared boilerplate
edited via another lesson" edge case without needing to attribute the edit.
`modified` is reported alongside each conflict as evidence for the human, and
`modified IS NULL` counts are reported so the operator can see how much of the
corpus timestamps cover.

**Rationale**: "Never overwrite newer work" (the user's explicit decision) is
satisfied conservatively: any divergence is treated as newer work. False
conflicts cost a human a look at the report; a false non-conflict destroys a
translator's work.

---

## D8. Desktop sync propagation of restored rows

**Deferred question**: should restored rows propagate to desktop clients?

**Decision**: **Yes — let them propagate.** `saveTStrings` stamps
`modified = Date.now()` on every insert and update, so restored rows will be
picked up by the continuous-sync query (`WHERE modified > <clientTimestamp>`).
This is documented explicitly in `quickstart.md` rather than left implicit.

**Rationale**: Restored translations are the correct current state of the
corpus; a desktop client that keeps showing the orphaned/blank version is
showing a lie. Suppressing propagation would require back-dating `modified`,
which would also corrupt future conflict evidence. The cost is one larger sync
payload for desktop users on their next connection.

---

## D9. Reversibility (FR-010) and the dry-run gate (FR-005)

**Decision**:

- Apply mode refuses to start unless (a) a `report.json` produced by a prior
  `diagnose` run against the _same_ production/snapshot pair exists, (b) its
  recorded production lesson version still matches live production (nothing
  changed under us), and (c) the operator passes the report's
  `diagnosisId` explicitly on the command line. This makes FR-005's "human
  reviewed the dry run" a machine-checkable precondition, not an honour system.
- Apply mode takes a `pg_dump -Fc` of production **itself**, before any write,
  and refuses to proceed if the dump fails, is zero-length, or if free disk
  space is under a configurable multiple of the database size (default 3×).
  The disk-space question the brainstorm deferred is answered by _measuring at
  runtime and aborting_, not by picking a path now: the dump location is a
  required CLI argument, and the tool checks writability and free space there.
- Dry-run mode makes zero writes to either database (SC-005), verified in the
  runbook by comparing `pg_dump` output before and after a dry run.

---

## D10. Post-apply recomputation (FR-012)

**Decision**: The apply subcommand awaits progress recomputation explicitly
(`saveTStrings(..., { awaitProgress: true })` on the final batch, plus a
terminal `await storage.updateProgress()`), then the runbook runs
`yarn generate-previews` (`NODE_ENV=production node
dist/server/tasks/generateAllWebPreviews.js`).

**Rationale**: `updateProgress()` is deliberately fire-and-forget in the
server's request path (`this.updateProgress(); // Without await`). In a
short-lived CLI the process can exit before it finishes, leaving
`languages.progress` stale and making the verification report wrong. Awaiting
is mandatory here.

---

## D11. Testability strategy (Constitution Principle I)

**Decision**: Split hard.

- **Pure core** (`src/server/tasks/restoreLesson/diagnose.ts`,
  `conflicts.ts`, `plan.ts`, `report.ts`): functions that take already-fetched
  row arrays and return the diagnosis, the classification, and the write plan.
  No I/O, no clock, no filesystem. Unit-tested with fixtures under TDD —
  every branch of D7's table, both mapping strategies from D3, archived
  languages, legacy `lessonStringId` rows, NULL timestamps, shared-string blast
  radius, idempotent re-apply.
- **Thin I/O shell** (`gateway.ts`, `cli.ts`, `PGSnapshotStorage.ts`): fetches
  rows, calls the pure core, writes via `restoreWrite`. Unit-tested with
  fixture doubles for the two storages.
- **One integration test** (`restoreLesson.integration.test.ts`) recreating the
  incident inside the test environment: create a lesson with translations via
  the app's own upload path, capture that state as the "snapshot" side, upload
  a different document to orphan the translations, then run diagnose + apply
  and assert re-attachment, conflict preservation, and idempotency.

**Rationale**: Two `PGTestStorage` instances share one test database, so
prod-vs-snapshot cannot be simulated with two live storage handles. Passing
fetched rows into pure functions sidesteps that entirely and keeps the
coverage threshold reachable. The integration test supplies the reality check
that unit fixtures cannot (Constitution I, "Document Processing and
Multi-Layer Verification").

---

## D12. Explicit non-decisions

- No schema change, migration, index, or constraint (spec scope boundary) —
  including the tempting unique index on `tstrings`. Recorded as follow-up.
- `cleanDB.ts` MUST NOT be run during or after recovery
  (`consolidateEnglish` deletes translations across all languages).
- No cover-file support, upload confirmation UX, or automated backups —
  follow-up features.
- `saveTStrings`'s two defects are compensated for, not fixed, in this feature.
