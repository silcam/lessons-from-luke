# Implementation Plan: Automated Quarter-Styles Template Application

**Branch**: `009-quarter-styles-template` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-quarter-styles-template/spec.md`

## Summary

Every assembled quarter book (feature 007) must arrive print-styled: the
mother-tongue `M.T.*` paragraph highlight removed and the book ready for Chris's
visual-QA pass with no manual Format → Styles → Load Styles step. The technical
approach adds **one** `StyleFamilies.loadStylesFromURL` call inside the existing
assembly StarBasic macro — after the 14-constituent insert loop, before
`storeToURL` — loading a single, global, swappable **template asset** shipped
with the application. Load flags are scoped
(`OverwriteStyles=True, LoadTextStyles=True, LoadPageStyles=False, LoadNumberingStyles=False`)
so template paragraph styles win while the 007 clean page-style set, chapterized
footers, and outline-numbering finalize patches are provably untouched. If the
asset is missing/unreadable or the load errors, the job fails loudly with a
curated reason — no unstyled book is ever delivered. The stand-in asset is
derived from Chris's hand-assembled Q2 reference master
(`test/docs/references/English_Luke-Q2-Master-bilingual.odt`), preserving his
style definitions verbatim; his real template file drops in later with zero code
change.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-11-quarter-styles-template-requirements.md](../brainstorms/2026-07-11-quarter-styles-template-requirements.md)

### Key Decisions Carried Forward

- **Always-on application**: one canonical output per (language, book, quarter,
  mode); no user-facing toggle. QA happens on the print-styled book. → Constrains
  the design to a single unconditional macro step (FR-001).
- **Fail the job on template failure**: the template is a build-time asset, so
  its absence is a deployment bug, not a runtime condition to paper over. →
  Per-job asset-existence check + macro error trap (FR-004, research R4/R5).
- **Ship the stand-in derived from the Q2 reference master**: unblocks the
  feature now; the real file is a long-lead, non-blocking drop-in. → Static
  committed asset resolved from `process.cwd()` (FR-005/FR-006, research R4).
- **Deliverable is template-file application, not just highlight-off**: the
  template file is the durable mechanism; the highlight-off is the minimum
  observable effect (FR-001 vs FR-002).

### Deferred Questions (resolved during planning)

- Stand-in form (direct reference vs. extract cleaned) → **research R3**: ship
  style definitions verbatim (optional content-strip for size only); no runtime
  cleaning; evidence-based on the reference master's `styles.xml`.
- Which style-family load flags → **research R2**: `OverwriteStyles=True,
LoadTextStyles=True, LoadPageStyles=False, LoadNumberingStyles=False`.
- Style-load orthogonality to outline-numbering + finalize metadata, and
  pagination parity → **research R2 + cross-cutting**: guaranteed by the OFF page
  & numbering flags; pinned by the golden-reference integration test.
- Where the asset lives and startup-vs-per-job validation → **research R4**:
  committed `assets/quarter-styles-template.odt`, resolved from `process.cwd()`;
  per-job existence check is the gate.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: existing 007 assembly pipeline
(`assembleQuarter` → `sofficeAssemble` → `Module1.xba` macro →
`finalizeAssembledQuarter`); LibreOffice `soffice --headless` (existing prod
dependency); `child_process.spawn`; libxmljs2 (existing, finalize only)
**Storage**: No new persistent storage. Template is a **static committed
application asset** (`assets/quarter-styles-template.odt`) resolved from
`process.cwd()`; read-only per job. Assembly job state stays the existing
in-memory process-scoped registry (007, non-durable).
**Testing**: Jest unit tests for asset-path resolution + per-job validation
(no `soffice`); `*.integration.test.ts` (`yarn test:integration`, real
`soffice`, serialized) for style-load behavior + the M.T. highlight assertion +
007 parity re-verification.
**Target Platform**: Linux server (web deploy via Capistrano + Passenger). Desktop
and the isomorphic `core` are untouched (server-only change).
**Project Type**: web — server-side only. No frontend or `core` changes.
**Performance Goals**: No new process. One additional in-process UNO style-load
on the already-open merged document; negligible vs. the ~40s baseline merge.
**Constraints**: Must not regress any 007 guarantee (single clean un-suffixed
page-style set, per-lesson chapterized footers, continuous pagination with
per-lesson first-page suppression, full editability, finalize metadata). Constant
`M.T.` highlight-removal observable effect. Template asset swappable with zero
code change.
**Scale/Scope**: One global template; all languages/books/quarters/modes. Change
surface: the macro, `sofficeAssemble` (env var + asset path plumbing),
`assembleQuarter` (per-job asset validation), a new asset-path helper, and the
committed asset file.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                     | Assessment                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Test-First Development** | PASS. Imperative additions (asset-path resolver, per-job existence/non-empty validation, env-var plumbing) are unit-TDD'd with mocked fs — no `soffice`. The `soffice`/ODT-round-trip behavior (style load, M.T. highlight-off, 007 parity) is covered by `*.integration.test.ts` per the constitution's document-processing clause. RED-before-green throughout. |
| **II. Type Safety**           | PASS. New code is strict-typed, explicit return types, no `any`, `type`-only imports. No new lint surface beyond the touched server modules.                                                                                                                                                                                                                      |
| **III. Code Quality**         | PASS. JSDoc on new public functions/options; naming follows the existing `assembly/`+`actions/` conventions; import order preserved.                                                                                                                                                                                                                              |
| **IV. Pre-commit Gates**      | PASS. `yarn typecheck` + lint-staged + related jest run unchanged; conventional commits. Unit suites run pre-commit; integration suite run explicitly (does not block commit but MUST pass before merge).                                                                                                                                                         |
| **V. Warning/Deprecation**    | PASS. No new deprecations; zero-warning maintained.                                                                                                                                                                                                                                                                                                               |
| **VI. Layered Architecture**  | PASS. Change is confined to `src/server/` (assembly + actions). No `core`, `frontend`, or `desktop` change; the isomorphic boundary and offline path are untouched. No domain-data access (template is a static asset, not `Persistence` data) — the `Persistence` mandate does not apply. No new tables/migrations.                                              |
| **VII. Simplicity**           | PASS. One macro call + one asset + one validation check. No new process, no new abstraction, no variant matrix (per-language/RTL templates explicitly deferred). YAGNI/KISS honored.                                                                                                                                                                              |

**Result**: PASS — no violations. Complexity Tracking table omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/009-quarter-styles-template/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R5 + cross-cutting)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── template-application.md   # Phase 1 output (internal pipeline contract)
└── tasks.md             # Phase 2 output (sp:05-tasks — NOT created here)
```

### Source Code (repository root)

```text
assets/
└── quarter-styles-template.odt        # NEW — committed stand-in style asset (research R4)

src/server/
├── assembly/
│   ├── macro/
│   │   ├── Module1.xba                 # EDIT — add loadStylesFromURL + On Error trap
│   │   ├── module1Xba.ts               # REGEN — embedded string (scripts/genMacroConstant.js)
│   │   └── module1Xba.test.ts          # drift guard (existing)
│   ├── sofficeAssemble.ts              # EDIT — pass SPIKE_TEMPLATE_URL env; accept templatePath
│   ├── sofficeAssemble.test.ts         # EDIT — unit: env var wired, missing-asset behavior
│   └── quarterStylesTemplate.ts        # NEW — resolve asset path (process.cwd()) + validate
├── actions/
│   ├── assembleQuarter.ts              # EDIT — per-job asset validation; thread templatePath
│   ├── assembleQuarter.test.ts         # EDIT — unit: fail-loud on missing/unreadable asset
│   └── assembleQuarter.integration.test.ts  # EDIT — M.T. highlight-off + 007 parity re-verify
└── ...

scripts/
└── genMacroConstant.js                 # existing — regenerates module1Xba.ts from .xba
```

**Structure Decision**: Server-side-only extension of the existing 007 assembly
pipeline. The new committed asset lives at repo-root `assets/` (a production asset
dir, distinct from `test/docs/`) and is resolved at runtime from `process.cwd()`
(the Capistrano release root), matching `docStorage`'s cwd-relative convention and
avoiding the `__dirname` build-layout trap documented in the macro-embedding
comment. No `core`/`frontend`/`desktop` files change.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec will
> have a corresponding acceptance spec file created during `sp:05-tasks`. These
> live in `specs/acceptance-specs/` and follow the GWT format consumed by the
> acceptance pipeline.

| User Story                                               | Acceptance Spec File                                            | Scenarios |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| US1: Downloaded quarter book arrives print-styled        | `specs/acceptance-specs/US01-quarter-book-print-styled.txt`     | 3         |
| US2: Template failure fails the job loudly               | `specs/acceptance-specs/US02-template-failure-fails-loudly.txt` | 2         |
| US3: Swapping in the real template is a file replacement | `specs/acceptance-specs/US03-template-drop-in-swap.txt`         | 2         |

**Scope note for US1 / FR-002 / SC-003 (from research R3 — flag for red-team &
the user)**: the acceptance assertion is scoped to the **`M.T.*` body paragraph
family** carrying no background highlight (the SOP §16 effect the reference
already satisfies — e.g. `M.T. Text` is `transparent`). The stand-in reference
retains `fo:background-color="#ffffcc"` on one **text**-family style
(`M.T. Text highlight`, outside SC-003's literal "paragraph" scope) and two
**paragraph** cover styles (`M.T. Text - Cover title` / `- Cover subtitle`, part
of Chris's own print-ready reference). Whether those two cover residuals should
also be transparent is **Chris's call, pinned to his real template** — do NOT
strip them in the stand-in (that would diverge from the hand-produced reference
the feature exists to reproduce). Red-team and the user should confirm the
SC-003 literal wording vs. this scoped assertion.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Complexity Tracking

> No Constitution Check violations — table intentionally omitted.
