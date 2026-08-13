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

## Complexity Tracking

| Violation                                                                                             | Why Needed                                                                                                                                                                                                      | Simpler Alternative Rejected Because                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw SQL for diagnosis reads (inside `PGStorage` subclasses, not through the interface's read methods) | `Persistence.languages()`/`tStrings()` filter out archived languages, and `tStrings({lessonId})` filters out legacy `lessonStringId`-scoped rows — exactly the rows the diagnosis exists to find (research D4). | Using the interface reads would silently under-report orphans and could lose an archived language's translations entirely — a correctness failure, not a style preference. The SQL stays inside the storage layer, matching `cleanDB.ts`. |
| Two master-string mapping strategies rather than one                                                  | The number of version bumps since the snapshot cannot be read from this repo; both branches are reachable in production (research D3).                                                                          | Picking one at planning time is a guess that fails silently on the wrong branch; the tool measures `bumpCount` and selects, reporting which it used.                                                                                      |
| A wrapper around `saveTStrings` instead of calling it directly                                        | Two defects in `saveTStrings` (masterId-only dedupe across languages; "has history" used as "row exists") would silently drop restored rows on exactly this feature's copy path (research D6).                  | Calling it directly loses data silently. Patching `saveTStrings` itself is out of scope during an incident recovery — it is the live app's shared write path; both defects are logged as follow-up work.                                  |
