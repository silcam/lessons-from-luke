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

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
> </content>
