# Implementation Plan: Quarter Pagination and Coloring-Page Style Fixes

**Branch**: `017-quarter-pagination-fixes` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-quarter-pagination-fixes/spec.md`

## Summary

Two client-reported defects in the delivered assembled quarter book, both originating at the
assembly stage. **Pagination**: printed page numbers do not match position in the book, and
the compensating `text:page-adjust` offsets baked into the two template assets are visible
to the client and read as a mistake. **Coloring-page memory verse**: of the two memory
verses each coloring page carries by design, the second renders with the inline-graphic
paragraph's formatting.

The technical approach splits cleanly by where each thing can be expressed. The offsets are
**asset-only** — delete `text:page-adjust` from both committed templates (research R1). The
sequence restarts are **finalize-only** — ODF expresses "restart numbering here" as
`style:page-number` on the paragraph that opens the page, which exists only in the merged
`content.xml`; `finalizeAssembledQuarter` already patches exactly this shape when it pins
lesson-opening headings to `First_20_Page`. Roman front matter and footer-less lesson first
pages already hold by construction in the assets — verified statically during planning, so
FR-001/FR-002/FR-007 are regression guards rather than new work.

The recto guarantee (FR-008–FR-010) adds a new render-and-measure pass: finalize without a
filler, render the book to PDF, locate lesson 1's first page by its live footer marker, and
re-finalize with one blank paragraph if that index is even. PDF page indices _are_ physical
sheet positions, which is what makes this immune to feature 007's counted-but-unrendered
phantom page without root-causing it.

The coloring-page fix is deliberately **not** designed yet. Planning found strong static
corroboration for the automatic-style collision hypothesis — the second copy is always the
one reaching its style indirectly through a locally-unique `P<n>` automatic style, and those
names demonstrably collide across constituents with opposite meanings (`P5` is a graphic
anchor in Luke-1-05 and a memory verse in Luke-1-04) — but the causal mechanism is settled
by a ~20 s headless two-constituent merge, not by assumption. That check is the first task
of the spike and gates the choice between per-constituent style namespacing and post-merge
repointing.

No database, no API, no UI, no migration.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), libxmljs2 (ODF XML parse/patch), LibreOffice
`soffice --headless` (merge **and now render**), poppler `pdftotext`/`pdfinfo` (page text +
count, currently test-only — see Constraints), the existing 007/009/013 assembly pipeline
(`makeLessonFile` → `prepareConstituentForAssembly` → `sofficeAssemble`/`Module1.xba` →
`finalizeAssembledQuarter`)
**Storage**: **No persistent storage change.** No tables, columns, migrations, or
`Persistence` contract change. Assembly job state remains the in-memory, process-scoped
`AssemblyJobRegistry` (007 FR-011); outputs keep the existing 24 h `docStorage` tmp
retention. Two committed **binary assets** change: `assets/quarter-styles-template.odt` and
`assets/quarter-styles-template-monolingual.odt`
**Testing**: Jest unit (`finalizeAssembledQuarter.test.ts`, `quarterStylesTemplate.test.ts`,
new measurement-pass tests) + Jest integration against real `soffice`
(`assembleQuarter.integration.test.ts`, the golden reference) + a human PDF round trip for
the spike only
**Target Platform**: Linux server (Capistrano + Passenger, Node 24 via nvm); development on
macOS. Desktop and web frontends are untouched
**Project Type**: Web (server-side assembly change; no frontend or desktop surface)
**Performance Goals**: The new render pass adds one sequential `soffice` invocation per
assembly job. Cost to be measured on a ~100-page book; the 2 vCPU deploy box is the sizing
case
**Constraints**:

- **No page-number field offset may survive anywhere** (FR-004) — the client inspects the
  field directly (SC-005).
- **Parity must be measured on the rendered document** (FR-010), never on an ODF page
  counter or a sum of constituent page counts.
- **The soffice-self-kills-first invariant** (`assemblyBudget.ts`, asserted in
  `assemblyBudget.test.ts`): the registry timeout may fire only after every `soffice` has
  self-killed, so the concurrency-1 slot is never freed with a LibreOffice process alive.
  Adding a second `soffice` invocation means adding its budget into `ASSEMBLY_TIMEOUT_MS`
  structurally, not numerically.
- **Both modes verified separately** (FR-015) — the two assets are not structurally
  parallel (research R5: 18 vs 16 master pages, no `Table_20_of_20_Contents` in
  monolingual, and different offsets `-1` vs `-2`).
- **Two memory-verse copies stay** (FR-014). No deduplication.
- **Open — gated on spike evidence (R3), production dependency**: `pdftotext`/`pdfinfo` are required by the
  test suite but are **not** established as present on the deploy host. If the measurement
  pass ships as-is, they become production dependencies; the alternative is moving the
  page-index query into the UNO macro. Decided by research R3's open item before the FR-010
  task closes.
- **Open — gated on spike evidence (R2), fix location**: whether the coloring-page fix lands pre-merge in
  `prepareConstituentForAssembly` or post-merge in `finalizeAssembledQuarter` is gated on
  the headless discriminating check (research R2). Resolved by evidence, in the spike,
  before any implementation task for US2 starts.

**Scale/Scope**: One quarter book = 14 constituents, ~100 pages. Two template assets, one
finalize module, one new measurement module, one integration test file.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-08-11-quarter-pagination-and-coloring-page-style-requirements.md](../brainstorms/2026-08-11-quarter-pagination-and-coloring-page-style-requirements.md)

### Key Decisions Carried Forward

- **This reverses feature 007's stated position, deliberately.** 007 FR-003 declared the
  offset "expected, not a defect" and descoped odd-page lesson starts; client feedback
  reverses both. 007's spec already carries the superseded banner. → Constraint: no plan
  step may re-derive the old doctrine, and the offsets are removed rather than re-tuned.
- **Pin each numbering sequence explicitly rather than solving the phantom page.** →
  Constraint on the design: printed numbers must depend on explicit start values, never on
  the counter's accumulated history. Root-causing the phantom is an explicit non-goal.
- **Physical page position is the authority for recto, not the page-number field.** →
  Constraint: parity is a counting question against _rendered_ pages (FR-010), which is
  also what makes it phantom-immune.
- **Both defects ship together.** They share the assembly stage and one verification round
  trip. → The spike is one batch, not two.
- **The spike maximizes information per artifact.** First-page suppression disabled so drift
  onset is visible; three variants; both modes; one individually downloaded lesson with a
  coloring page. → Carried verbatim into [quickstart.md](./quickstart.md) §3.

### Deferred Questions (resolved during planning)

- **Does the numbering fix belong in the assets, the finalize step, or both?** → **Both,
  split by kind** (research R1). Offsets are asset-only; sequence restarts are expressible
  only in the merged `content.xml` and therefore finalize-only. Roman front matter already
  holds in the assets today.
- **Does the phantom page shift physical sheet parity?** → **Structurally moot** (research
  R3). A counted-but-unrendered page does not appear in the PDF, so PDF indices are
  physical sheet positions; measuring there sidesteps the question entirely.
- **Confirm the automatic-style collision hypothesis before designing a fix.** → **Strongly
  corroborated statically, mechanism still open** (research R2). The second copy is always
  the indirect one, and the colliding names are documented in a table. The discriminating
  check is headless and cheap; it runs **first** in the spike and gates the fix design.
  Planning attempted it and was blocked by sandboxed `soffice`, not by cost.
- **Is headless render equivalent to interactive PDF export?** → **Still open, highest
  leverage** (research R4). Settled inside the human sitting the spike already requires, at
  the cost of one extra export. If equivalent, all later verification is automated.
- **Where does the rendered-page-count measurement fit?** → **Between finalize and the move
  to `docStorage`, with a conditional re-finalize** (research R3), because inserting the
  filler changes the document being measured.
- **No test asserts an absolute printed page number.** → **Confirmed gap** (research R6).
  The existing relative assertion passes under a uniformly shifted sequence — exactly the
  delivered defect. FR-016 closes it.

### Scope Boundaries (explicit non-goals)

Forcing lessons other than the first to open recto; removing or deduplicating either memory
verse; root-causing 007's counted-but-unrendered page; covers (feature 008); any change to
translation, upload, or storage; making the recto guarantee survive client edits after
delivery (Clarifications: correct-as-delivered).

## Applied Learnings

`.specify/solutions/` contains only Ralph/spec-kit tooling learnings (epic detection,
ATDD routing, harness schemas). Nothing there touches ODT/LibreOffice assembly, pagination,
or ODF style resolution, so no prevention tips apply to this plan.

## Constitution Check

_GATE: passed before Phase 0 research; re-checked after Phase 1 design — see below._

| Principle                                | Assessment                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Fidelity to reality**               | ✅ The whole feature is a correction of a book that passed its tests while being wrong for the reader. The plan refuses to assert the coloring-page mechanism from memory (research R2) and refuses to trust an internal page counter over the rendered document (FR-010). Both are this principle applied. |
| **I. Test-First (application code)**     | ✅ New Node logic (`measureLessonOneParity`, the finalize additions, the budget change) is unit-testable with fixture XML and a mocked render, and follows red-green-refactor.                                                                                                                              |
| **I. Document processing / multi-layer** | ✅ ODF round-trip behaviour is verified by `assembleQuarter.integration.test.ts` against real `soffice`, extended with the FR-016 absolute assertions in both modes. The human PDF round trip is a spike instrument, not a substitute for the automated layer.                                              |
| **II. Type safety**                      | ✅ Explicit return types, no `any`; `LessonOneParity` is a named interface, not an inline tuple.                                                                                                                                                                                                            |
| **III. Code quality**                    | ✅ JSDoc on every new export, matching the density of the surrounding assembly modules. Naming follows the existing vocabulary (`finalizeAssembledQuarter`, `prepareConstituentForAssembly`).                                                                                                               |
| **IV. Pre-commit gates**                 | ✅ `yarn typecheck` + lint-staged; conventional commits; never `--no-verify`.                                                                                                                                                                                                                               |
| **V. Warnings**                          | ✅ No deferred warnings introduced.                                                                                                                                                                                                                                                                         |
| **VI. Layered architecture**             | ✅ Server-only. `src/core` untouched, no domain data touched, no `Persistence` change, desktop and frontend untouched.                                                                                                                                                                                      |
| **VII. Simplicity**                      | ⚠️ One added complexity — a second `soffice` invocation per job — justified in Complexity Tracking below. Otherwise the plan reuses existing mechanisms (footer-less masters for suppression, the existing clone-and-repoint pattern, the existing marker-based page location).                             |

**Post-Phase-1 re-check**: no new violations. The design added no new module boundaries
beyond `measureLessonOneParity`, no new persistence, and no new external surface. The
two spike-gated open items above are both scheduled to be resolved by evidence _before_ the
implementation tasks they gate, which is the constitution's Zeroth Principle rather than a
gate failure.

## Project Structure

### Documentation (this feature)

```text
specs/017-quarter-pagination-fixes/
├── plan.md                              # This file
├── spec.md                              # Feature specification
├── research.md                          # Phase 0 output — R1..R6 + open questions
├── data-model.md                        # Phase 1 output — ODF entities + invariants
├── quickstart.md                        # Phase 1 output — how to run the spike & verify
├── contracts/
│   └── pagination-and-assembly.md       # Phase 1 output — internal pipeline contract
├── spike/                               # Spike scripts + FINDINGS.md (created during implementation)
└── tasks.md                             # Phase 2 output (sp:05-tasks — NOT created here)
```

Spike artifacts land in `specs/017-quarter-pagination-fixes/spike/`, mirroring the 007
precedent (`specs/007-assembled-quarter-download/spike/`). Decided explicitly so the
implement phase does not guess.

### Source Code (repository root)

```text
assets/
├── quarter-styles-template.odt              # CHANGED — remove text:page-adjust="-1"
└── quarter-styles-template-monolingual.odt  # CHANGED — remove text:page-adjust="-2"

src/server/
├── actions/
│   ├── assembleQuarter.ts                   # CHANGED — measure + conditional re-finalize
│   ├── assembleQuarter.integration.test.ts  # CHANGED — FR-016 absolute assertions, both modes
│   ├── finalizeAssembledQuarter.ts          # CHANGED — sequence restart + filler page
│   ├── finalizeAssembledQuarter.test.ts     # CHANGED
│   ├── measureLessonOneParity.ts            # NEW — render + locate lesson 1 (FR-010)
│   ├── measureLessonOneParity.test.ts       # NEW
│   └── prepareConstituentForAssembly.ts     # CHANGED only if research R2 direction (a) wins
└── assembly/
    ├── assemblyBudget.ts                    # CHANGED — render timeout folded into the sum
    ├── assemblyBudget.test.ts               # CHANGED — invariant still structural
    └── quarterStylesTemplate.test.ts        # CHANGED — assert no offsets in either asset

specs/acceptance-specs/                       # NEW files (created by sp:05-tasks)
```

**Structure Decision**: no new layer or directory. The change lives entirely in the existing
server-side assembly slice (`src/server/actions/` + `src/server/assembly/`) plus the two
committed template assets. `src/core`, `src/frontend`, and `src/desktop` are untouched,
which is what keeps constitution Principle VI trivially satisfied.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec will have a
> corresponding acceptance spec file created during `sp:05-tasks`. These files live in
> `specs/acceptance-specs/` and follow the GWT format consumed by the acceptance pipeline.
> Ralph's ATDD cycle depends on these files existing before `US<N>` tasks are processed.

| User Story                                                     | Acceptance Spec File                                               | Scenarios |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| US1: Page numbers match the reader's position in the book (P1) | `specs/acceptance-specs/US24-quarter-page-numbering.txt`           | 6         |
| US2: Both memory verses on a coloring page look the same (P2)  | `specs/acceptance-specs/US25-coloring-page-memory-verse-style.txt` | 4         |
| US3: The first lesson opens on a right-hand page (P3)          | `specs/acceptance-specs/US26-first-lesson-opens-recto.txt`         | 4         |

Numbering continues from the existing `specs/acceptance-specs/` sequence (US23 is the
highest present), so these are US24–US26 rather than US1–US3.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Note on the outer loop's oracle**: every scenario above is ultimately observed on a
rendered PDF, so the acceptance tests bottom out in the same `soffice` +
`pdftotext` extraction the integration test already uses. US2's scenarios about indirect
style resolution are additionally assertable on the assembled `content.xml` without a
render, which makes them the fastest feedback in the feature.

## Complexity Tracking

| Violation                                                                     | Why Needed                                                                                                                                                         | Simpler Alternative Rejected Because                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second `soffice` invocation per assembly job (render-and-measure)           | FR-010 makes recto placement depend on the _rendered_ page count, and Clarifications (2026-08-11) explicitly chose the rendered document over any internal counter | Counting the front-matter constituent alone is one cheaper render but measures a **different document** than the one delivered — the exact trust error FR-010 forbids. Trusting the ODF page counter is what produced the delivered defect. |
| A two-pass finalize (measure, then conditionally re-finalize with the filler) | Inserting the filler changes the document whose parity was measured; the measurement must run on a filler-free document                                            | A single pass would have to predict parity before rendering, which is the counter-trusting approach FR-010 rules out. The second pass is XML-only — no second merge.                                                                        |
| An optional `insertRectoFiller` flag on `finalizeAssembledQuarter`            | Expresses the two-pass flow without a second entry point or a duplicated finalize                                                                                  | A separate `insertRectoFiller()` module would duplicate the unzip/patch/rezip cycle and risk the two passes diverging.                                                                                                                      |
