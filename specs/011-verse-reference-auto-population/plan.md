# Implementation Plan: Auto-Populate Verse-Reference Strings

**Branch**: `011-verse-reference-auto-population` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-verse-reference-auto-population/spec.md`

## Summary

Verse references in English masters split into a translatable **book name**
(`Luke`) and a language-neutral **numeric reference** (`1:5–25`). Two mechanisms
deliver auto-population (per the 2026-07-14 spec amendment):

- **Mechanism 1 — recognize (no document mutation)**: extend the single shared
  `canAutoTranslate` predicate to accept the numeric-range shape, so the ~141
  reference paragraphs the parser **already** stores as separate runs
  auto-populate their numeric part verbatim from English at project creation and
  via backfill. Book names stay translatable and propagate translate-once via
  master-string dedup.
- **Mechanism 2 — split (narrow document mutation)**: a pre-parse content.xml
  rewrite splits the ~15 residual **unsplit** reference runs into book + numeric
  runs so their numeric flows into Mechanism 1. It is book-agnostic, idempotent,
  atomic, and round-trips visually identical (LibreOffice-verified).

Backfill (extends `defaultTranslateAll.ts`) and one-time re-processing (mirrors
`reparseEnglish.ts`) carry the benefit to existing projects; changes surface
through the existing lesson-update-issues flow without destroying prior work.
Server-only; no new endpoints, no schema change.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), libxmljs2 (ODT XML parse/rewrite/merge), the existing `parse` / `mergeXml` / `saveDocStrings` pipeline, LibreOffice `soffice --headless` (round-trip verification). React 16 + Redux Toolkit UI (existing translation & update-issues screens, unchanged).
**Storage**: No new tables/columns/migrations. Domain data via the `Persistence` interface (`storage.tStrings`, `addOrFindMasterStrings`, `saveDocStrings`, `updateLesson`). Master odt files in the existing `docStorage`.
**Testing**: Jest unit/TDD for the recognizer predicate and splitter logic; `*.integration.test.ts` with `soffice --headless` for the round-trip (SC-004); corpus-extraction tests over `test/docs/serverDocs/` for SC-003/SC-006.
**Target Platform**: Linux/macOS Node server (web deployment). Desktop inherits Mechanism 1 for free via the shared core auto-translate path; not a separately in-scope surface.
**Project Type**: web (existing four-layer isomorphic app; changes are server-only)
**Performance Goals**: N/A — batch/one-off upload, project-create, and maintenance-script paths; no latency-critical surface.
**Constraints**: Round-trip visual identity (FR-008/SC-004); idempotent + atomic splitter (FR-009); never destroy translation data/history (FR-014); zero corpus false positives (SC-006).
**Scale/Scope**: 67 English masters; four reference styles; ~141 already-split reference paragraphs (156 occurrences, 50 distinct numeric masters, all ranges); ~15 residual unsplit references.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                  | Assessment                                                                                                                                                                     | Status |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| I. Test-First Development (NON-NEGOTIABLE) | Recognizer + splitter developed red-green-refactor; document round-trip covered by `*.integration.test.ts` via `soffice --headless`; corpus behavior by extraction tests.      | PASS   |
| II. Type Safety & Static Analysis          | Strict TS, explicit return types, no `any`; predicate + splitter are small typed functions.                                                                                    | PASS   |
| III. Code Quality Standards                | JSDoc on new public functions; naming per conventions; import order enforced.                                                                                                  | PASS   |
| IV. Pre-commit Quality Gates               | `yarn typecheck` + lint-staged + jest run on commit; never bypassed.                                                                                                           | PASS   |
| V. Warning & Deprecation Policy            | Zero new warnings; predicate unification removes a duplicated function.                                                                                                        | PASS   |
| VI. Layered Architecture & Dual Targets    | Domain data stays behind `Persistence`; splitter/backfill/re-processing are server-only; core auto-translate path unchanged so desktop inherits Mechanism 1. No schema change. | PASS   |
| VII. Simplicity & Maintainability          | No new endpoints/tables; extend one predicate (unify the duplicate) + one narrow splitter + two existing scripts. YAGNI/DRY honored.                                           | PASS   |

**Gate result**: PASS (initial and post-design). No violations; Complexity
Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-verse-reference-auto-population/
├── plan.md              # This file
├── research.md          # Phase 0 output (regenerated, two-mechanism framing)
├── data-model.md        # Phase 1 output (regenerated)
├── quickstart.md        # Phase 1 output (regenerated)
├── contracts/
│   └── README.md        # No new endpoints; documents changed surfaces + scripts
├── checklists/          # sp:04-checklist output
└── tasks.md             # sp:05-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── models/                     # DocString / TString / LessonString (unchanged shapes)
├── server/
│   ├── actions/
│   │   ├── defaultTranslations.ts  # EXTEND canAutoTranslate → accept numeric-range shape (Mechanism 1)
│   │   ├── findTSubs.ts            # consumer of canAutoTranslate (blast radius verified; no change expected)
│   │   ├── uploadDocument.ts       # upload path: invoke splitter before parse (Mechanism 2)
│   │   └── updateLesson.ts         # parseDocStrings / saveDocStrings (unchanged; splitter runs before)
│   ├── xml/
│   │   └── <referenceSplitter>.ts  # NEW: narrow pre-parse content.xml splitter (Mechanism 2)
│   └── tasks/
│       ├── defaultTranslateAll.ts  # EXTEND: import unified predicate; backfill (FR-011)
│       └── reparseEnglish.ts       # EXTEND/MIRROR: one-time re-processing w/ splitter (FR-012)
└── ...
test/docs/serverDocs/               # Luke Q1–Q4 corpus — extraction benchmark (SC-003/SC-006)
```

**Structure Decision**: Server-only change within the existing four-layer app.
No new layer or directory beyond one new XML splitter module; everything else
extends existing files. Domain persistence remains behind `Persistence`.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets an
> acceptance spec file created during `sp:05-tasks`, in `specs/acceptance-specs/`
> (GWT format). The SC-003/SC-006 benchmark is **extraction-derived at test
> time** over the corpus — acceptance specs and tasks MUST NOT bake in a
> hardcoded reference count.

| User Story                                             | Acceptance Spec File                                         | Scenarios |
| ------------------------------------------------------ | ------------------------------------------------------------ | --------- |
| US1: Verse references pre-fill on new project          | `specs/acceptance-specs/US01-verse-references-prefill.txt`   | 4         |
| US2: Prose and non-references are never auto-filled    | `specs/acceptance-specs/US02-prose-never-autofilled.txt`     | 3         |
| US3: Splitting residual unsplit references round-trips | `specs/acceptance-specs/US03-splitter-round-trip.txt`        | 4         |
| US4: Existing projects backfill without overwriting    | `specs/acceptance-specs/US04-backfill-existing-projects.txt` | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Edge Cases & Error Handling

> Added by `/sp:04-red-team` (Pass 1). Adversarial review of the two-mechanism
> design surfaced the following. Each is a design-impacting consideration for
> `/sp:05-tasks`, not a code-review item.

### Update-issue suppression for changed numeric references (second-order effect of extending `canAutoTranslate`) — HIGH

Extending the **shared** `canAutoTranslate` predicate (Decision 1) has a
second-order effect on `findTSubs.usefulEngSub` that Decision 1's blast-radius
check only half-covered. `usefulEngSub` keeps an update-issue only when
`engFrom.some(tStr => !canAutoTranslate(tStr.text))`. Broadening the predicate to
accept numeric ranges **monotonically increases suppression**: any update-issue
whose changed English "from" strings are **all** now-auto-translatable numeric
references flips from _surfaced_ to _suppressed_.

Research Decision 1 verified only the **split** direction (`Luke 1:26–38` "from"
contains letters → still surfaced). The uncovered direction is a plain **numeric
reference correction** on an already-split reference — e.g. a master revision
changes `1:5–25` → `1:5–24`. That produces a **new** numeric master (masters
dedup by exact text), so:

1. `usefulEngSub` now **suppresses** the update-issue (the changed "from" string
   `1:5–25` is now auto-translatable) — before this feature it was surfaced.
2. The master-update path does **not** re-apply auto-translation: verified in code
   — `uploadEnglishDoc` → `saveDocStrings` bumps the version but never calls
   `defaultTranslations` or any auto-translate. Auto-population happens **only** at
   project-create (`defaultTranslations`) and via the manual `defaultTranslateAll`
   backfill.

**Net effect**: after any ad-hoc master revision that changes a numeric reference,
existing in-progress projects get **neither** a surfaced update-issue **nor**
auto-repopulation — the new numeric master is silently blank (and the old
reference's carried value is stale) until an operator manually re-runs the
backfill. A wrong/blank scripture reference is a real curriculum-correctness
defect, so this is HIGH. (Note: this suppression-without-repopulation gap already
existed latently for pure-digit masters like lesson numbers; this feature
**extends** it to semantically meaningful scripture references, raising the
stakes.)

**Design mitigation (must land in tasks, not deferred to hardening)**: close the
gap for changed auto-translatable masters on the update path. Preferred: have the
master-update/upload path (and the re-processing task) re-apply the backfill for
**changed** auto-translatable numeric masters into existing projects — filling
only masters a language does not yet have, never overwriting translator work
(reuse the `defaultTranslateAll` skip logic; FR-011/SC-005 semantics). If instead
the team accepts a manual-backfill requirement, it MUST be documented as a
standing operational invariant ("run the backfill after **any** English master
revision that changes references", not only the one-time FR-013 migration) and the
acceptance suite MUST cover the "reference corrected in an existing project"
scenario so the silent-staleness path is exercised. FR-010's non-destruction of
prior translations is preserved either way.

### Batch re-processing partial-failure handling & resumability (FR-012) — MEDIUM

The one-time re-processing task runs the splitter over all 67 stored masters. The
plan specifies per-file atomicity and per-splitter idempotency, but not the
**batch's** behavior when the splitter (or a `saveDocStrings` write) throws on one
master mid-run. Left unspecified, a thrown error could abort the batch, leaving
some masters split and others not — then a subsequent backfill copies numeric
masters unevenly across projects, an inconsistent partial state that is hard to
detect. Mitigation: the re-processing task MUST continue-on-error with per-master
success/skip/failure logging and a final summary, so a failed master is visible
and the operator can safely re-run (the splitter's idempotency, FR-015, makes
re-run non-destructive). A task-level test SHOULD assert the batch completes and
reports the failure when one master is unprocessable.

### Concurrency: operator scripts vs. live server writes — LOW

The re-processing and backfill scripts are operator-run against the production
`PGStorage`. Nothing coordinates them with concurrent live writes (a
document upload bumping a version, or a project-create running
`defaultTranslations`) to the same masters/lessons, which could interleave version
bumps or read a master mid-rewrite. Mitigation: document (quickstart /
operational-sequence) that re-processing and backfill assume server quiescence
(maintenance window) with no concurrent admin uploads or project creation; note
this alongside the FR-013 sequence.

### Splitter single-run precondition made explicit — LOW

Decision 3's splitter assumes each residual unsplit reference is a **single** text
run. A reference stored as multiple inline-formatted runs (e.g. book bold, numeric
not) would not match the single-run precondition. Mitigation: make the precondition
explicit — the splitter fires only when the entire reference paragraph is one
unstyled-boundary text run in a reference-bearing style; any reference stored as
multiple runs is out of scope and MUST degrade **safely** (left unchanged: no
auto-population, and never mis-split or mangled). A splitter unit test SHOULD assert
a multi-run reference paragraph is left byte-identical.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
> </content>
