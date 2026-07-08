# Implementation Plan: Assembled Quarter Download

**Branch**: `007-assembled-quarter-download` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-assembled-quarter-download/spec.md`

## Summary

Automate what is today a manual LibreOffice master-document workflow: from the language page, one per-quarter action assembles the Table of Contents plus lessons 1–13 (absolute lesson numbers `(series-1)*13+1 .. series*13`, plus the `-99` TOC) into a single, self-contained, fully editable `.odt` with continuous page numbering and per-lesson first-page number suppression, in both bilingual and single-language modes. Assembly runs as a background, in-memory job (indeterminate "Assembling…" status → ready / failed), delivers the finished file for download, blocks incomplete quarters with a message naming the missing lesson(s), and never emits a partial book.

**Technical approach** (proven by the WS-2a spike, `spike/FINDINGS.md`, verdict GO): reuse the existing per-lesson `makeLessonFile` pipeline unchanged to generate the 14 constituent ODTs, then merge them with **LibreOffice headless via the `insertDocumentFromURL` UNO call driven from an injected StarBasic macro** against a per-job isolated `-env:UserInstallation` profile — productionizing the spike's warm-profile / inject-macro / run flow into a server action. A per-ODT footer field-flatten pre-process closes the one non-trivial spike gap (blank Quarter/Lesson footer numbers). Job tracking is an in-process registry (no table, no queue) keyed on `(languageId, book, series, mode)`, with the soffice step serialized (concurrency 1).

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-06-assembled-quarter-download-requirements.md](../brainstorms/2026-07-06-assembled-quarter-download-requirements.md)

### Key Decisions Carried Forward

- **Assembly mechanism = LibreOffice headless (`soffice`), not a pure-XML merge**: `soffice` natively resolves automatic-style collisions, master-page binding, field resolution, and continuous numbering that a hand-rolled merge would have to solve one-by-one. Proven viable by the WS-2a spike.
- **Background job + polling, not a long synchronous request**: assembling 14 documents through `soffice` (~30–40 s observed for 14 files) exceeds a comfortable request time.
- **Block incomplete quarters with a clear reason** rather than allowing partial assembly.
- **No stricter translation-completeness bar than today**: "complete" means all 13 lessons + TOC exist and generate without error, not that translation progress is 100%.
- **In-memory / process-scoped job tracking** (non-goal: any persistent job table or external queue).

### Deferred Questions (resolved during planning)

- **`soffice` invocation mechanism** → Injected StarBasic macro + `insertDocumentFromURL` against a per-job isolated profile (see research.md R1). Chosen over Python-UNO for cross-platform local testability (LO's bundled Python is SIGKILLed on macOS dev machines).
- **Profile-dir isolation & timeout/kill policy** → per-job `mktemp` profile, warm→inject→run, `rm -rf` on completion/crash; hard timeout with process kill for a hung soffice (research.md R1, R5).
- **Polling mechanism / job-ID scheme** → REST start + poll endpoints, in-memory registry keyed `(languageId, book, series, mode)`; download by job id (contracts/assembly-api.md).
- **Where the 13 lessons + TOC are looked up** → `storage.lessons()` filtered by `(book, series)`; completeness validated against the expected 14-part set (data-model.md, research.md R2).
- **Continuous numbering / footers / editability** → confirmed feasible by the spike; the +1 offset root cause remains open (research.md R3, flagged as top risk).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), existing `makeLessonFile` / `mergeXml` per-lesson pipeline, LibreOffice `soffice` headless (already a production dependency via `webifyLesson`), `child_process.exec`/`spawn`, React 16 + Redux Toolkit + styled-components (frontend), Axios + file-saver (download)
**Storage**: No new persistent storage. Domain reads go through the existing `Persistence` interface (`storage.lessons()`, `storage.lesson(id)`). Assembly job state is an **in-memory process-scoped registry** (FR-011 — explicitly non-durable). Output ODTs and constituents live in the existing `docStorage` tmp dir (24 h cleanup reused for result retention).
**Testing**: Jest unit TDD (`*.test.ts`) for imperative logic (job registry, file resolution/ordering, completeness validation, footer field-flatten); Jest integration (`*.integration.test.ts`, `yarn test:integration`, opt-in, serialized) for the real `soffice` merge; Cypress E2E for the operator flow on the language page
**Target Platform**: Linux server (production, Passenger + nvm Node 24); macOS/Linux dev workstations. Web deployment target only — **desktop/Electron is out of scope** (assembly is a server-only action; the isomorphic `core` and offline path are untouched).
**Project Type**: Web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`); this feature touches `server` + `frontend/web` only.
**Performance Goals**: No throughput target. Single-quarter assembly budget ~30–60 s (14 files, observed 30–40 s in spike); UI must never present a frozen control (indeterminate progress).
**Constraints**:

- `soffice` is effectively single-instance / single-concurrency for a merge — the assembly step MUST be serialized (concurrency 1) or use fully isolated per-job profiles with a hard timeout + kill.
- Output MUST be fully editable: 0 `text:protected`, 0 linked `.odt`, 0 `text:section-source` (spike-confirmed FR-002).
- No stricter translation-completeness bar than per-lesson download; reuse its partial-translation fallback unchanged.
- Introduce no change to existing per-lesson download endpoints/UI.
  **Scale/Scope**: Small-team, low-concurrency internal publishing tool. 4 REST endpoints, 1 server assembly action + job registry, 1 language-page UI control cluster (assemble + progress + download), ~4 complete quarters per book.

## Presentation Design

**Component Framework**: React 16 + styled-components, using the existing `src/frontend/common/base-components/` kit (`Button`, `Div`, `Table`, `Label`, `SelectInput`) per `DESIGN.md`. Register: product — clear, efficient, utilitarian ("Field Manual").
**Interaction Patterns**: Mirror the existing per-lesson `useGetDocument` / `GetDocumentButton` pattern (Axios blob download + `file-saver`). Add a small polling hook for the background job's status. State is local component state + Redux where it already lives (`state.lessons`, `state.languages`); no new global slice needed for the transient job.
**Accessibility Target**: WCAG 2.2 AA, consistent with the rest of the app. The "Assembling…" indicator must be announced (not a purely visual spinner) and the control must remain keyboard-operable and never appear frozen.

### UI Decisions

| Screen / Component                                                                                                  | User Story     | Approach                                                                                                                                                                                                    | Design Skills                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Per-quarter "Assemble quarter" control cluster on `LanguageView` (Bilingual \| Single-Language), grouped per series | US1, US2, US12 | Extend `LanguageView.tsx`: add a per-quarter row/section above or beside the per-lesson table, offering Bilingual and Single-Language assemble actions consistent with existing `GetDocumentButton` styling | `/design-language-to-daisyui` (n/a — this app uses base-components/styled-components, so `/impeccable` + DESIGN.md instead) |
| "Assembling…" in-progress indicator (indeterminate)                                                                 | US3            | Indeterminate status text/affordance driven by a polling hook; queued/running → "Assembling…", ready → auto-download or "Download" affordance, failed → human-readable reason                               | `/design-clarify` (status + error microcopy), `/design-onboard` (first-run empty/blocked state)                             |
| Blocked / failed message (names missing or failing lesson(s))                                                       | US4            | Inline human-readable message rendered in place of the progress affordance; identifies missing/failing lesson(s); offers retry (re-trigger)                                                                 | `/design-clarify` (error/blocked copy)                                                                                      |

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**:

- `/impeccable` — bring the new controls into line with `DESIGN.md` (flat, no-shadow, Helvetica scale, `Colors.ts` palette) and the existing per-lesson controls.
- `/design-clarify` — finalize the "Assembling…", blocked, and failure microcopy so a non-technical operator understands state and next action.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                   | Gate                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| I. Test-First (TDD, RGR, ~95–100% coverage) | Imperative logic (job registry, file resolution, completeness validation, footer field-flatten) gets unit TDD; the `soffice` merge — an external-binary surface the constitution explicitly routes to **integration tests** — gets `*.integration.test.ts`; the operator flow gets Cypress E2E.                                                                                                                         | PASS — layer mapping matches constitution §I "Document Processing and Multi-Layer Verification". |
| II. Type Safety & Static Analysis           | Explicit return types, no `any` (use `unknown` + guards), strict boolean expressions, `type` imports, ESLint max-warnings 0. New job-status/mode types are discriminated unions.                                                                                                                                                                                                                                        | PASS (enforced by pre-commit).                                                                   |
| III. Code Quality                           | JSDoc on new public functions/types; naming per glossary (Assembled quarter book, Assembly job, Assembly mode, TOC lesson, Quarter); import order.                                                                                                                                                                                                                                                                      | PASS.                                                                                            |
| IV. Pre-commit Gates                        | `yarn typecheck` + lint-staged (eslint → prettier → jest related). No `--no-verify`.                                                                                                                                                                                                                                                                                                                                    | PASS.                                                                                            |
| V. Warnings/Deprecations                    | Zero-tolerance; addressed as they arise.                                                                                                                                                                                                                                                                                                                                                                                | PASS.                                                                                            |
| VI. Layered Architecture & Dual Targets     | Server-only feature. Domain reads (`lessons`, `tStrings`) go through `Persistence`. The in-memory job registry and `soffice` orchestration are **server-only infrastructure that stores no domain data and is never imported into `core` or the desktop offline path** — squarely inside the boundary rules (analogous to the Principle VI server-only exemption reasoning). No change to `core`, no change to desktop. | PASS.                                                                                            |
| VII. Simplicity                             | In-memory registry (no queue/table), reuse existing pipeline + `soffice` dependency + `docStorage` tmp cleanup, mirror existing download UI. YAGNI: no durable jobs, no PDF, no covers.                                                                                                                                                                                                                                 | PASS.                                                                                            |

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/007-assembled-quarter-download/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── assembly-api.md   # REST contract for start/poll/download/status
├── spec.md
└── spike/               # WS-2a + WS-2a′ spike deliverables (assemble.sh, macro, FINDINGS)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── models/
│       └── Quarter.ts                 # NEW (optional): quarter/series lesson-set resolution helpers
│                                       #   (expectedLessonNumbers(series), isCompleteQuarter(...))
│                                       #   — pure, isomorphic, unit-tested. May instead live as
│                                       #   helpers alongside Lesson.ts.
├── server/
│   ├── actions/
│   │   ├── assembleQuarter.ts          # NEW: orchestrates constituent generation + soffice merge
│   │   ├── assembleQuarter.test.ts     # NEW: unit TDD (resolution, ordering, validation — soffice mocked)
│   │   ├── assembleQuarter.integration.test.ts  # NEW: real soffice merge, opt-in, serialized
│   │   ├── flattenFooterFields.ts      # NEW: per-ODT Quarter/Lesson field → literal text pre-process
│   │   └── flattenFooterFields.test.ts # NEW: unit TDD against a fixture ODT/styles.xml
│   ├── assembly/
│   │   ├── AssemblyJobRegistry.ts      # NEW: in-memory job registry (dedup, status, serialization)
│   │   ├── AssemblyJobRegistry.test.ts # NEW: unit TDD (dedup, lifecycle, concurrency-1)
│   │   ├── sofficeAssemble.ts          # NEW: warm-profile / inject-macro / run wrapper (from spike)
│   │   └── macro/Module1.xba           # NEW: the Assemble StarBasic macro (from spike template)
│   └── controllers/
│       ├── assemblyController.ts       # NEW: REST endpoints (start / status / download)
│       └── assemblyController.test.ts  # NEW: controller unit tests
└── frontend/
    └── web/
        ├── languages/
        │   └── LanguageView.tsx        # EDIT: add per-quarter assemble control cluster
        └── documents/
            ├── useAssembleQuarter.tsx  # NEW: start + poll + download hook (mirrors useGetDocument)
            └── AssembleQuarterButton.tsx  # NEW: control + progress/blocked/failed states

cypress/integration/
└── assembleQuarter.cy.ts               # NEW: E2E operator flow
```

**Structure Decision**: Web application, isomorphic four-layer. This feature adds a server assembly action + in-memory registry + REST controller (registered in `serverApp.ts` beside `documentsController`) and a web-frontend control cluster on the existing `LanguageView`. It reuses `makeLessonFile`, `mergeXml`, and `docStorage` unchanged, and adds the `soffice` merge orchestration proven in the spike. No `core` domain-data changes beyond optional pure quarter-set helpers; no desktop changes.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios below will get a corresponding acceptance spec file created during `sp:05-tasks` under `specs/acceptance-specs/`, in the GWT format the acceptance pipeline consumes.

| User Story                                         | Acceptance Spec File                                            | Scenarios |
| -------------------------------------------------- | --------------------------------------------------------------- | --------- |
| US1: Assemble and download a complete quarter book | `specs/acceptance-specs/US01-assemble-and-download-quarter.txt` | 3         |
| US2: Choose bilingual or single-language output    | `specs/acceptance-specs/US02-bilingual-or-single-language.txt`  | 3         |
| US3: See progress and receive the finished file    | `specs/acceptance-specs/US03-progress-and-delivery.txt`         | 3         |
| US4: Blocked when the quarter is incomplete        | `specs/acceptance-specs/US04-blocked-incomplete-quarter.txt`    | 2         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` → `acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

## Risks (carried into red-team / implement)

1. **[TOP RISK] The +1 page-number offset root cause is UNRESOLVED (FR-003).** The spike proved continuous numbering and first-page suppression, but printed number = physical page + 1, and `page-usage="right"` does **not** yield odd rectos until the offset is fixed (LO considers the "right" constraint already satisfied). **FR-003 tension to surface:** the spec's explicit "each lesson begins on an odd (right-hand) page" MUST goes _beyond_ the manual reference output — FINDINGS-odm proved **Chris's actual master also carries the +1 offset and starts no lesson on an odd recto**. So "match the manual workflow" and "odd-page starts" are not the same target. Resolving the offset is a dedicated Phase 0/implementation research task (research.md R3); odd-page work is sequenced strictly after it. Red-team should confirm the odd-page clause is truly required or scope it to a follow-up.
2. **Footer Quarter/Lesson number fields blank after merge (FR-004 consistency).** Closed by the field-flatten pre-process (research.md R4); watch the `zip` mimetype-first / stored-uncompressed sharp edge in `fsUtils.zip`.
3. **`soffice` single-concurrency + hung-process risk.** Serialize the merge (concurrency 1), per-job isolated profile, hard timeout + kill (a hung soffice sits at 0 % CPU forever). research.md R1/R5.
4. **Local integration testing on macOS**: LO bundled Python is SIGKILLed; the Basic-macro driver is the cross-platform choice so devs can run `test:integration` before commit. research.md R1.
5. **Series 1 is an incomplete quarter (missing lesson 06)** — a concrete US4 fixture, and a reminder that "1–13" is conceptual: the real lesson numbers are absolute per series.

## Applied Learnings

_No entries — the `.specify/solutions/tooling/*` learnings are spec-kit-workflow-internal (acceptance-spec routing, harness/model schema), none relevant to soffice/ODT assembly or the job registry. Omitted deliberately._
