# Implementation Plan: Auto-Populate Verse-Reference Strings

**Branch**: `011-verse-reference-auto-population` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-verse-reference-auto-population/spec.md`

## Summary

Split isolated verse references in English masters into a translatable **book
name** (`Luke`) and a language-neutral **numeric reference** (`1:5–25`) so the
book name is translated once (propagating via master-string deduplication) and
the numeric part auto-populates like picture numbers. Achieved with **zero
parser/merge changes** by (1) rewriting qualifying reference paragraphs into
`<text:span>` runs upstream of parse and persisting the normalized odt, and (2)
extending the shared `canAutoTranslate` predicate to include the colon. Existing
projects are upgraded by an operator-run re-normalization task (routing changes
through the existing lesson-update-issues flow) followed by the existing
idempotent backfill. Server-side only; desktop inherits auto-population via the
shared core path. See [research.md](./research.md) for the evidence behind each
decision.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), libxmljs2 (ODT XML rewrite/parse/merge), existing `parse`/`mergeXml`/`saveDocStrings` pipeline, LibreOffice `soffice --headless` (round-trip verification), React 16 + Redux Toolkit (existing translation & update-issues UI, unchanged)
**Storage**: No new tables/columns/migrations. Domain data via the `Persistence` interface (`storage.tStrings`, `addOrFindMasterStrings`, `saveDocStrings`, `updateLesson`). Master odt files in the existing `docStorage`.
**Testing**: Jest unit TDD (shape detector, predicate, XML transform); `*.integration.test.ts` via `soffice --headless` for round-trip identity; committed Q1–Q4 masters as the SC-003 benchmark fixture.
**Target Platform**: Linux/macOS server (web). Desktop inherits auto-population through the isomorphic core; no desktop-specific work (spec Assumptions, Session 2026-07-14 clarification).
**Project Type**: Web (isomorphic four-layer: core / server / frontend / desktop). Changes land in core (`util`) and server (`xml`, `actions`, `tasks`).
**Performance Goals**: Not performance-sensitive — normalization runs at upload and in one-off operator tasks over ~56 documents.
**Constraints**: Round-trip must be visually identical (SC-004); SC-003 requires 100% precision AND recall (95 matched / 0 false positives); no source mutation or history loss (FR-013); tasks idempotent (FR-014). `soffice` and jest run with the Bash sandbox disabled (project MEMORY).
**Scale/Scope**: ~95 references and ~160 colon-bearing prose strings across Luke Q1–Q4; ~56 master documents to re-normalize.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Test-First (NON-NEGOTIABLE)**: Unit TDD for `parseVerseReferences`, the
  unified `canAutoTranslate`, and the `normalizeReferences` XML transform (all
  pure/mockable). ODT round-trip (external binary) covered by `*.integration.test.ts`
  per the document-processing clause. **PASS** (test-first ordering enforced in
  sp:05-tasks; ATDD outer loop below).
- **II. Type Safety**: Explicit return types, no `any`, `type`-only imports, new
  `VerseReferenceSegment` interface PascalCase. **PASS**.
- **III. Code Quality**: JSDoc on the new public `parseVerseReferences`,
  `normalizeReferences`, and unified `canAutoTranslate`; import ordering. **PASS**.
- **IV. Pre-commit Gates**: `yarn typecheck` + lint-staged + related jest. **PASS**.
- **V. Warnings**: zero-tolerance maintained. **PASS**.
- **VI. Layered Architecture**: `parseVerseReferences` is pure/isomorphic → lives
  in `src/core/util`. Server-only concerns (XML rewrite, tasks) stay in `server`.
  All domain access via `Persistence`; no new persistent storage. Desktop
  inherits auto-population via core with no desktop code. **PASS**.
- **VII. Simplicity**: No new endpoints, no new tables. **Unifies** the currently
  duplicated auto-translate predicate (DRY). Reuses `reparseEnglish` and
  `defaultTranslateAll` precedents. **PASS**.

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/011-verse-reference-auto-population/
├── plan.md              # This file
├── research.md          # Phase 0 output (6 decisions + corpus/round-trip verification)
├── data-model.md        # Phase 1 output (entities, VerseReferenceSegment, predicate change)
├── quickstart.md        # Phase 1 output (dev walkthrough + operator sequence)
├── contracts/
│   └── README.md        # Phase 1 output (unchanged endpoints + CLI task contracts)
└── tasks.md             # Phase 2 output (sp:05-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── util/
│       ├── verseReference.ts            # NEW: parseVerseReferences + VerseReferenceSegment (pure, isomorphic)
│       └── verseReference.test.ts       # NEW: unit tests incl. Q1–Q4 corpus fixture (SC-003)
├── server/
│   ├── xml/
│   │   ├── normalizeReferences.ts       # NEW: rewrite content.xml reference paragraphs into spans
│   │   ├── normalizeReferences.test.ts  # NEW: unit tests over content.xml fixtures
│   │   └── normalizeReferences.integration.test.ts  # NEW: soffice round-trip identity (SC-004)
│   ├── actions/
│   │   ├── uploadDocument.ts            # EDIT: invoke normalizeReferences on English master after saveDoc
│   │   └── defaultTranslations.ts       # EDIT: canAutoTranslate pattern += ':'; single exported source
│   └── tasks/
│       ├── defaultTranslateAll.ts       # EDIT: import unified canAutoTranslate (drop shouldAutoTranslate)
│       └── renormalizeEnglish.ts        # NEW: one-time re-normalization task (mirrors reparseEnglish)
└── (frontend/, desktop/ unchanged)

test/docs/serverDocs/                    # existing Luke Q1–Q4 masters = SC-003 benchmark source
```

**Structure Decision**: Web / isomorphic four-layer. The book-agnostic shape
detector is pure and isomorphic → `src/core/util`. The ODT rewrite and both
operator tasks are Node/server-only → `src/server/xml` and `src/server/tasks`.
Auto-population reuses the existing `defaultTranslations` core-adjacent path, so
desktop needs no changes.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets an
> acceptance spec file created during `sp:05-tasks`, in `specs/acceptance-specs/`
> in GWT format.

| User Story                                          | Acceptance Spec File                                             | Scenarios |
| --------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| US1: References pre-fill on new project             | `specs/acceptance-specs/US01-references-prefill-new-project.txt` | 4         |
| US2: Prose containing a reference is never split    | `specs/acceptance-specs/US02-prose-never-split.txt`              | 3         |
| US3: Documents round-trip identically               | `specs/acceptance-specs/US03-round-trip-identical.txt`           | 2         |
| US4: Existing projects backfill without overwriting | `specs/acceptance-specs/US04-backfill-existing-projects.txt`     | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

Note: US2/US3 are document-processing-heavy; their acceptance coverage bottoms
out in the shape-detector unit fixture (SC-003) and the soffice round-trip
integration test (SC-004) respectively.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

## Applied Learnings

_No solutions in `.specify/solutions/` matched this feature's stack (existing
learnings are all sp-workflow/tooling). Relevant operational constraint from
project MEMORY — `soffice` and jest require the Bash sandbox disabled — is
captured in Technical Context and research.md rather than as a solution
reference._

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-13-verse-reference-auto-population-requirements.md](../brainstorms/2026-07-13-verse-reference-auto-population-requirements.md)

### Key Decisions Carried Forward

- **Split book name from numeric reference** (two-string model): book name is
  translatable text, numerics are language-neutral; master-string dedup gives
  translate-once propagation. Constrains data-model Decision (book span dedupes to
  one master).
- **Normalize at upload** (span rewrite upstream of parse), not a one-time
  document transformation and not a parser/merge core change → research Decision 1.
- **Shape-based detection, not a book list** → research Decision 2 (FR-002/FR-008).
- **Existing masters re-normalized by a one-time admin task**; carry-over via the
  existing update-issues flow → research Decisions 4 and 6.

### Deferred Questions (resolved during planning)

- Span-normalization mechanics & where the rewrite runs → **Decision 1** (new
  `normalizeReferences.ts`, English-master path only, persist normalized odt).
- Extend shared `canAutoTranslate` vs sibling predicate → **Decision 3** (extend
  and unify; blast radius on `findTSubs.usefulEngSub` is the desired filtering).
- Exact detection grammar incl. numbered books & multi-reference paragraphs →
  **Decision 2** grammar.
- How the update-issues diff presents a one-string→multi-string split →
  **Decision 4** (verified against `findTSubs`/`lessonsController`; verify on a
  real re-normalized master in integration).
- Backfill extends `defaultTranslateAll` vs new script → **Decision 5** (extend;
  already idempotent) + predicate unification.
