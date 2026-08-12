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

The technical approach splits cleanly by where each thing can be expressed. The offsets to
**edit** are asset-only — delete `text:page-adjust` from both committed templates (research
R1). The offsets to **verify gone** are not: the constituents carry offsets of their own, so
FR-004 is asserted on the merged output rather than on the assets (see Edge Cases). The
sequence restarts are **finalize-only** — ODF expresses "restart numbering here" as
`style:page-number` on the paragraph that opens the page, which exists only in the merged
`content.xml`; `finalizeAssembledQuarter` already patches exactly this shape when it pins
lesson-opening headings to `First_20_Page`. Roman front matter and footer-less lesson first
pages already hold in the assets — verified statically during planning, so FR-001/FR-002/FR-007
are regression guards rather than new work. **Not "by construction", though**: the constituents
all re-enable the footer on their own `First_20_Page`, so FR-007 holds only because the merge's
template style load overwrites their page layouts. That guard is therefore asserted on the merged
output, alongside FR-004's (see Edge Cases, INV-6b).

The recto guarantee (FR-008–FR-010) adds a new render-and-measure pass: finalize without a
filler, render the book to PDF, locate lesson 1's first page by classifying each rendered page
from its footer signature (see Edge Cases — marker adjacency is unsafe, because coloring pages
carry the same lesson marker and print no number), and re-finalize with one blank paragraph if
that index is even. PDF page indices _are_ physical
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
assembly job, and a **second** one on jobs that insert a filler (the mandatory confirmation
render — see Edge Cases). Cost to be measured on a ~100-page book; the 2 vCPU deploy box is the
sizing case
**Constraints**:

- **No page-number field offset may survive anywhere** (FR-004) — the client inspects the
  field directly (SC-005).
- **Parity must be measured on the rendered document** (FR-010), never on an ODF page
  counter or a sum of constituent page counts.
- **The soffice-self-kills-first invariant** (`assemblyBudget.ts`, asserted in
  `assemblyBudget.test.ts`): the registry timeout may fire only after every `soffice` has
  self-killed, so the concurrency-1 slot is never freed with a LibreOffice process alive.
  Adding render invocations means adding their budget into `ASSEMBLY_TIMEOUT_MS`
  structurally, not numerically — two render terms plus three bounded-exit-poll terms, the
  worst case (a filler-inserting job), carried unconditionally so the invariant stays
  structural rather than branch-dependent (contract §5).
- **Both modes verified separately** (FR-015) — the two assets are not structurally
  parallel, and the asymmetry is wider than research R5 records. [static-confirmed during
  red-team, layout-level probe] **19 masters / 18 layouts bilingual vs 15 / 15 monolingual**
  (R5's "18 vs 16" is wrong on both sides; `Footnote` and `Endnote` share `Mpm6`).
  Monolingual lacks `Table_20_of_20_Contents`, `Front_20_cover`, and `Back_20_cover`, and
  carries `-2` where bilingual carries `-1`. **A fourth asymmetry claimed by earlier passes does
  not exist and is struck**: `Inside_20_cover`, `Body_20_Pages`, and `Cover_20_pages` were said to
  carry a page-number footer in bilingual and no footer element in monolingual, yielding a
  different rendered signature per mode. [AUTHORITATIVE, XML-parser probe] They carry **no footer
  element in either asset** and render nothing in both — footer-identical across modes. The
  classification is therefore stable for the **same** reason in both modes, not (as previously
  written) for a different reason in each. FR-015 is still asserted rather than inferred, on the
  asymmetries that are real: the three missing masters and the differing offset value.
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

| Principle                                | Assessment                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Fidelity to reality**               | ✅ The whole feature is a correction of a book that passed its tests while being wrong for the reader. The plan refuses to assert the coloring-page mechanism from memory (research R2) and refuses to trust an internal page counter over the rendered document (FR-010). Both are this principle applied.                      |
| **I. Test-First (application code)**     | ✅ New Node logic (`measureLessonOneParity`, the finalize additions, the budget change) is unit-testable with fixture XML and a mocked render, and follows red-green-refactor.                                                                                                                                                   |
| **I. Document processing / multi-layer** | ✅ ODF round-trip behaviour is verified by `assembleQuarter.integration.test.ts` against real `soffice`, extended with the FR-016 absolute assertions in both modes. The human PDF round trip is a spike instrument, not a substitute for the automated layer.                                                                   |
| **II. Type safety**                      | ✅ Explicit return types, no `any`; `LessonOneParity` is a named interface, not an inline tuple.                                                                                                                                                                                                                                 |
| **III. Code quality**                    | ✅ JSDoc on every new export, matching the density of the surrounding assembly modules. Naming follows the existing vocabulary (`finalizeAssembledQuarter`, `prepareConstituentForAssembly`).                                                                                                                                    |
| **IV. Pre-commit gates**                 | ✅ `yarn typecheck` + lint-staged; conventional commits; never `--no-verify`.                                                                                                                                                                                                                                                    |
| **V. Warnings**                          | ✅ No deferred warnings introduced.                                                                                                                                                                                                                                                                                              |
| **VI. Layered architecture**             | ✅ Server-only. `src/core` untouched, no domain data touched, no `Persistence` change, desktop and frontend untouched.                                                                                                                                                                                                           |
| **VII. Simplicity**                      | ⚠️ One added complexity — a render `soffice` invocation per job, plus a confirmation render on the filler branch — justified in Complexity Tracking below. Otherwise the plan reuses existing mechanisms (footer-less masters for suppression, the existing clone-and-repoint pattern, the existing marker-based page location). |

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

The spike's variants are deliberately _wrong_ documents — first-page suppression disabled so
drift onset is visible, offsets zeroed or not per variant. Every spike script therefore builds
its variants into a scratch directory from the committed assets and **never** edits
`assets/quarter-styles-template*.odt` in place, so a suppression-disabled or half-edited asset
cannot reach a delivered book through an interrupted spike run.

### Source Code (repository root)

```text
assets/
├── quarter-styles-template.odt              # CHANGED — remove text:page-adjust="-1"
└── quarter-styles-template-monolingual.odt  # CHANGED — remove text:page-adjust="-2"

src/server/
├── actions/
│   ├── assembleQuarter.ts                   # CHANGED — measure + conditional re-finalize
│   ├── assembleQuarter.integration.test.ts  # CHANGED — FR-016 absolute assertions + zero
│   │                                        #   text:page-adjust in the MERGED output, both modes
│   ├── finalizeAssembledQuarter.ts          # CHANGED — sequence restart + filler page
│   ├── finalizeAssembledQuarter.test.ts     # CHANGED
│   ├── measureLessonOneParity.ts            # NEW — render + locate lesson 1 (FR-010)
│   ├── measureLessonOneParity.test.ts       # NEW
│   └── prepareConstituentForAssembly.ts     # CHANGED only if research R2 direction (a) wins
└── assembly/
    ├── sofficeAssemble.ts                   # UNCHANGED — verified: owns no profile teardown
    ├── sweepAssemblyWork.ts                  # UNCHANGED — startup-only; MUST NOT be reused per job
    ├── reapOrphanedSoffice.ts                # UNCHANGED — startup-only; render reapable by construction
    ├── assemblyBudget.ts                    # CHANGED — render + exit-poll terms folded into the sum
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

US26's scenarios exercise the recto guarantee, which the kill-switch above can disable. They
must therefore run against the switch's **on** default explicitly rather than inheriting
whatever the environment carries, so a switched-off environment fails them loudly instead of
skipping the requirement silently.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Note on the outer loop's oracle**: every scenario above is ultimately observed on a
rendered PDF, so the acceptance tests bottom out in the same `soffice` +
`pdftotext` extraction the integration test already uses. US2's scenarios about indirect
style resolution are additionally assertable on the assembled `content.xml` without a
render, which makes them the fastest feedback in the feature.

## Security Considerations

Server-side only, no HTTP or persistence surface, so the exposure is confined to how the new
render pass invokes external binaries and what it reports.

### Subprocess invocation discipline (new `soffice`, `pdftotext`, `pdfinfo` calls)

`measureLessonOneParity` MUST follow `sofficeAssemble.ts`'s invocation discipline, **not**
`webifyLesson.ts`'s. `webifyLesson.ts:20` is the in-repo anti-pattern: a shell `exec` with an
interpolated path and no profile isolation. Concretely, the render pass MUST:

- Spawn via `execFile`-style **array arguments** (`spawn`/`execFile`), never a shell string.
  `odtPath`, `outDir`, and the PDF output path are derived from job-scoped paths; a shell
  string breaks on spaces and turns any future path component into an injection surface.
  This applies equally to the `pdftotext` / `pdfinfo` calls (the integration test already uses
  `execFileSync` with array args — match it).
- Pass `-env:UserInstallation=file://<profileDir>` using the **same per-job profile directory**
  the merge already warmed (`profileDirFor(workRoot, jobId)`) — **threaded in as a parameter**, not
  re-derived inside the pass. `profileDirFor` needs `workRoot` and `jobId`, neither recoverable
  from a render working directory nested inside the job dir, so a signature that omits the value
  leaves only string surgery or the shared default profile — the thing this bullet forbids, and
  the thing that makes an orphaned render unreapable. The signature carries `profileDir` and a
  pass-tagged `outDir` explicitly (contract §3), matching the existing
  `convertToPdf(odtPath, workDir, profileDir)` test helper. The two invocations are strictly
  sequential within one job, so profile reuse is safe and avoids a second warm; what is not
  safe is falling back to LibreOffice's shared default profile, which is single-instance and
  would let the render collide with a concurrent `webifyLesson` or a lingering merge.
- Confirm the merge's `soffice` process group has fully exited before the render starts. A
  render launched against a profile whose `.lock` is still held either attaches to the running
  instance or wedges until its own timeout.
- Spawn `detached` (own process group) and kill with `process.kill(-pid, "SIGKILL")` on
  timeout or `AbortSignal`. This is the **only** runtime protection against a hung render
  wedging the concurrency-1 slot: `reapOrphanedSoffice` is not a backstop for it, because
  [static-confirmed during red-team] it runs only inside the startup sweep
  (`serverApp.ts:194`) and therefore never sees a live render. Treating it as a safety net
  would leave the render's own self-kill unbuilt and the wedge unguarded.

### Log and error hygiene

The measurement pass reads the **rendered text of unpublished translation content**. Curated
errors and diagnostics MUST NOT include extracted page text, and MUST NOT include absolute
filesystem paths — extending the existing path-free curated-reason rule
(`"assembly failed to finalize the merged book"`) to the new failure modes. Recording the
numeric `lessonOnePageIndex` / `renderedPageCount` (see Edge Cases below) is fine; recording
the page text that produced them is not.

## Performance Considerations

### The admission guard is sized for the merge, and this feature changes the peak it guards

[static-confirmed during red-team, `assemblyBudget.ts:70-82`, `AssemblyJobRegistry.ts:237-244`]
`ASSEMBLY_MIN_AVAILABLE_BYTES` (512 MB) is a Linux `MemAvailable` floor below which a genuinely new
job is refused. Its own doc comment says it is **a placeholder, not a sized number**, chosen for
safety against the deploy box's ~1.31 GB idle `MemAvailable` and explicitly **not** derived from a
measured peak of the 14-document merge. Two properties of that guard matter here:

- It is consulted at **admission only**. A job admitted at 600 MB proceeds through the whole
  pipeline, including a render whose peak has never been measured.
- The peak it was (loosely) chosen against is the merge's. A PDF export of a ~100-page,
  graphics-heavy book is a **second** LibreOffice peak of unknown size, and on the 2 vCPU / 2 GB
  swapless box there is no swap to absorb an underestimate.

**Requirements**, both folded into work this plan already schedules rather than added as new scope:

- The Technical Context's "cost to be measured on a ~100-page book" is extended from wall-clock to
  **`MemAvailable` during the render**, using the exact procedure the constant's doc comment already
  prescribes for the merge (`while :; do grep MemAvailable /proc/meminfo; sleep 1; done`). The spike
  already produces the artifact; this is one shell loop alongside it. If the render's peak exceeds
  the merge's, `ASSEMBLY_MIN_AVAILABLE_BYTES` is re-tuned to the observed peak plus headroom; if it
  does not, that is recorded so the next pass does not re-open the question.
- **An OOM kill must not be reported as a timeout.** The render is spawned `detached` and killed
  with `process.kill(-pid, "SIGKILL")` on timeout or abort (Security Considerations), so a
  SIGKILL-terminated render is otherwise indistinguishable from an OOM-killer SIGKILL — and the two
  need opposite operator responses (raise the budget vs. lower concurrency / raise the floor). The
  pass knows which signals it sent, so the server-side log line distinguishes "killed by us at
  `ASSEMBLY_RENDER_TIMEOUT_MS`" from "died on a signal we did not send". The coordinator-facing
  curated reason is unchanged.

### The wedged-job window widens for every job, including jobs that never render

`ASSEMBLY_TIMEOUT_MS` gains `2 × ASSEMBLY_RENDER_TIMEOUT_MS + 3 × ASSEMBLY_EXIT_POLL_CAP_MS`
unconditionally (contract §5), and `ASSEMBLY_ABANDON_MS` is derived from it
[static-confirmed during red-team, `assemblyBudget.ts:69`], so both windows widen automatically —
correct, and no extra work. The consequence to state rather than discover: assembly runs at
concurrency 1, so a single wedged job now holds the only slot for a materially longer period before
the registry marks it failed, and that is true even for jobs the kill-switch turned the render off
for. This is the same accepted cost already recorded for the kill-switch, generalized: it is
accepted deliberately, because deriving the budget from a runtime branch would make the
soffice-self-kills-first invariant conditional rather than structural.

## Edge Cases & Error Handling

### The recto pass must not be able to block delivery of the two reported defects

US3 (recto placement) is P3 and product-owner-originated; US1 and US2 are the client-reported
defects. As designed, US3 introduces a **new, unproven external dependency** (a second
`soffice` render, plus `pdftotext`/`pdfinfo` whose production availability is still open) into
the critical path of every assembly job, and contract §4 fails the whole job when it errors.
That is defensible as a correctness default and stays the default — but it means a flaky render
on the deploy box would block delivering the two fixes the client actually asked for.

**Mitigation**: the measure-and-re-finalize pass is gated by an explicit server-side
configuration switch, default **on**. When switched off, assembly skips the measurement,
delivers without the recto guarantee, and logs a single warning naming the skipped requirement
(FR-008). This is an operational kill-switch, not a fallback path with its own logic: there is
exactly one alternative behaviour (do not measure, do not insert a filler), so it adds no
untested branch beyond the pre-017 behaviour.

### Locating lesson 1's first page is an inference, and must fail loudly rather than guess

`measureLessonOneParity` derives lesson 1's first physical page as "the page before the first
page carrying lesson 1's live footer marker". Every step of that inference has a failure mode
that would silently produce the _wrong_ parity — and a wrong parity inserts a filler that makes
the delivered book worse than doing nothing:

- **Prefix collision**: the marker `Quarter <S> Lesson 1` is a strict prefix of
  `Quarter <S> Lesson 10`..`13`. Match on a whole-token/anchored boundary, not
  `String.includes`.
- **Marker absent**: a lesson 1 short enough to have no numbered page after its footer-less
  title page produces no marker at all. Throw the curated reason; do not fall back to a
  positional guess.
- **Implausible index**: a first-marker page at physical index 1 leaves no predecessor, and any
  index outside `2..renderedPageCount` is a parse failure. Both throw.
- **Cross-check the located page**: the candidate page must carry **no** page-number footer
  (lesson title pages are footer-less by construction, R1). If it carries one, the inference is
  wrong and the pass throws rather than returning a number.
- **Monolingual footer marker**: R5 established the two assets are not structurally parallel.
  The spike MUST confirm the same `Quarter <S> Lesson <N>` footer marker is present in
  monolingual output before this locator ships; if it is absent, every monolingual job throws
  and the mode needs its own anchor.

### Lesson title pages are not the only unnumbered body pages — coloring pages are too

[static-confirmed during red-team, both assets] Every lesson master pins a paragraph to the
`Coloring_20_Page` master (`style:master-page-name="Coloring_20_Page"` appears in each of
`Luke-1-01v03`, `-02v03`, `-04v03`), and that master's footer carries **no**
`<text:page-number>` field in either template asset. So every coloring page prints nothing
while consuming a number, exactly like a lesson title page. Two consequences the design must
absorb:

- **The lesson-1 locator's anchor is ambiguous, not merely its cross-check.**
  [static-confirmed during red-team] The `Coloring_20_Page` footer renders
  `Lessons from Luke  Quarter <Q>  Lesson <N>` — twice, once per printed half-sheet — and carries
  **no** `Page <n>`. The `Lesson_20_Content` footer renders `Quarter <Q>  Lesson <N>` followed by
  `Page <n>`. So a coloring page carries the _same_ lesson marker the locator anchors on, and
  also satisfies the footer-less cross-check. Both halves of contract §3's inference fail on the
  same page: "the first page carrying lesson 1's marker" can be a coloring page, and the
  predecessor returned as lesson 1's title page can then be an ordinary numbered content page.
  The result is a silently wrong parity — the failure INV-14 claims is impossible.

  **Locate by observable page class rather than by marker adjacency.** Each master leaves a
  distinct extractable footer signature, so page class is directly observable from `pdftotext`
  output instead of inferred from position. Two limits on the table below, both real:
  `pdftotext` extracts **whole-page text**, not footers specifically — body text containing a
  signature string (a title page plausibly prints "Lessons from Luke" and "Quarter <n>" in its
  body) can forge a footer signature, so the spike's signature-confirmation item covers
  adversarial body text, not just footers. And the "absent footer" rows are not master-exclusive
  (see the predecessor rule below).

  | Page class          | `Quarter <Q>` **and** `Lesson <N>` | `Page <n>` | Other signature                             |
  | ------------------- | ---------------------------------- | ---------- | ------------------------------------------- |
  | Lesson title page   | absent                             | absent     | no rendered footer, but the page's own text |
  | Blank page          | absent                             | absent     | **no extractable text at all** (after trim) |
  | Coloring page       | present **twice**                  | absent     | `Lessons from Luke`                         |
  | Lesson content page | present                            | present    | the lesson title                            |
  | Front matter        | absent (`Quarter <Q>` alone)       | present    | `Lessons from Luke` + `Teacher's Guide`     |
  | Table of contents   | absent                             | present    | `Lessons from Luke` + `Teacher's Guide`     |

  [static-confirmed during red-team, both assets, rendered footer text extracted from the masters]
  The first column requires **both** tokens: `Front_20_matter`'s footer is
  `Lessons from Luke  Teacher's Guide – Quarter <Q> Page <n>`, so a discriminator keyed on
  `Quarter <Q>` or on `Lessons from Luke` alone classifies every front-matter page as a coloring
  page. The coloring page's doubled marker is confirmed rather than spike-pending. Front matter and
  the table of contents share a signature apart from the `– Quarter <Q>` run — the locator does not
  need them separated (confirmation B is a denial), but INV-5's inventory must not assume they are.

  The first lesson's title page is the first page satisfying the **whole conjunction**: it is
  lesson-title class (no footer, but body text), the page after it belongs to the first lesson
  (coloring or content class, marker built from `firstLessonNumber` and matched on a whole-token
  boundary), and the page before it is admissible per the predecessor rule below. This makes the
  locator independent of where a coloring page falls inside a lesson.

  **"No footer, but body text" is not exclusive to lesson title pages, so the predecessor rule
  must be a deny-list rather than an allow-list.** [static-confirmed during red-team, both assets,
  XML-parser probe — supersedes the earlier "nine masters" count, produced by the regex probe
  struck below] Footer-rendering is the **minority** case, not a
  nine-master exception: in the bilingual asset only **four** of nineteen masters render a footer
  (`Coloring_20_Page`, `Lesson_20_Content`, `Front_20_matter`, `Table_20_of_20_Contents`), and
  **three** of fifteen in the monolingual (no `Table_20_of_20_Contents` master exists there).
  Every other master — fifteen bilingual, twelve monolingual — renders nothing. State the
  rendering set positively: it is smaller, and it cannot be invalidated by a master the
  enumeration omits. `Inside_20_cover` is among the dormant set and is demonstrably reachable: the TOC constituent
  `Luke-2-99v01` pins a paragraph to it. Such a page carries body text and no footer, so it is
  **lesson-title class** under the signature table — indistinguishable from a real title page.

  An allow-list predecessor rule ("absent, blank, front-matter, or table-of-contents class")
  therefore rejects a perfectly ordinary inside-cover page sitting as the last front-matter page,
  and the locator **throws on every job for that corpus shape** — deterministic, not flaky, and it
  hard-blocks US1 and US2 behind P3, the exact scenario the kill-switch exists for. It fails loudly
  rather than shipping a wrong book, which is why this is a robustness defect and not a correctness
  one, but it is a defect the corpus can trigger today.

  **Corrected predecessor rule (confirmation B)**: the page before the candidate is absent, **or**
  does not carry the first lesson's marker. Stated as a denial, it needs no enumeration of
  footer-less masters and cannot be invalidated by a master the table does not list. What it
  actually excludes is the only thing that matters — a candidate sitting _inside_ the first lesson
  rather than at its start.

  **"Lesson 1" means the quarter's _first_ lesson, not the literal number 1.** The footer marker
  is `Quarter <series> Lesson <firstLessonNumber>`, and `firstLessonNumber` is
  `(series - 1) * 13 + 1` — `14` for the Luke-2 corpus
  `assembleQuarter.integration.test.ts` assembles (lessons 14..26), and already a parameter of
  both `finalizeAssembledQuarter` and `measureLessonOneParity`. A locator that matches the
  literal string `Lesson 1` finds nothing and throws on every real job. Whole-token matching is
  required at every value, not only at `1`: `Lesson 1` is a prefix of `Lesson 14`, and `Lesson 2`
  of `Lesson 26`.

  **The conjunction is scanned, not checked after a first match.** The book's own physical page 1
  is _also_ lesson-title class — FR-002 requires it to print no page number, so its master is
  footer-less too. A rule reading "the first page with no footer, then confirm" selects page 1,
  fails the successor confirmation, and throws on every job. Exactly one page in the book
  satisfies the full conjunction; finding a second means the classification is wrong, and that
  throws rather than silently taking the first.

  The spike confirms the four signatures against real rendered output in both modes before this
  ships — including whether the coloring and content footers' `Quarter`/`Lesson` runs collapse to
  byte-identical strings under `pdftotext -layout`. The locator must be correct either way; the
  spike only settles which discriminator is cheapest.

  **One further axis the spike's "both modes" coverage does not span: language.** This locator is
  the first production dependence on _rendered footer text_, and assembly is per-language
  (`POST /api/languages/:languageId/quarters/:book/:series/assembly`). The marker tokens
  (`Quarter <Q>`, `Lesson <N>`, `Lessons from Luke`) should be template-borne and therefore
  language-invariant, by the same `loadStylesFromURL` mechanism INV-6b depends on — but that is
  inference, not evidence, and a translated footer frame would make the locator throw on every job
  in that language. Stated as a **check, not new work**: if a non-English corpus is cheaply
  available during the spike, render one and confirm the marker tokens are unchanged; if none is,
  record the assumption explicitly so the first failure in a new language is diagnosable rather than
  mysterious.

- **FR-016's "known positions" must be chosen with coloring pages counted.** An oracle that
  assumes only lesson title pages are suppressed will compute the wrong expected absolute
  number for every page after lesson 1's coloring page. The absolute assertions anchor on
  positions derived from the rendered page inventory, not from page-count arithmetic that assumes
  one suppression per lesson. "Which master each page rode" is **not** recoverable from
  `pdftotext`; the inventory is built from the observable footer signatures in the table above,
  which is what makes it assertable at all.
- **The existing FR-003 integration assertion may be passing for the wrong reason.**
  `assembleQuarter.integration.test.ts` locates each lesson's first numbered content page as
  `pages.findIndex((p) => p.includes(marker))` and then asserts its predecessor prints no number.
  A coloring page carries the marker and prints no number, so for any lesson whose coloring page
  precedes its first content page, that `findIndex` lands on the coloring page and the assertion
  checks the wrong pair — while still passing. Re-derive it under the page-class classification
  as part of the FR-016 work rather than treating the existing green as evidence.

### Blank pages are their own page class — starting with the one this feature inserts

The classification needs a blank-page row. Its original justification — that confirmation B's
allow-list would reject a blank predecessor and throw on every filler-inserted book — is
**superseded**: B is now stated as a denial (predecessor absent, or not carrying the first
lesson's marker), which accepts a blank predecessor without enumerating it. Two justifications
survive and are the ones to build against:

- **INV-5's page inventory must account for every rendered page**, so an unclassifiable page is a
  hole in the FR-016 oracle rather than a locator problem.
- **The filler's presence must be observable in the confirmation render.** An insertion silently
  deleted by `removeLeadingBlankParagraphs` (contract §2.4) would otherwise be indistinguishable
  from a parity that happened to come out right — the passes-while-wrong shape again.

Blank and lesson-title classes are distinguishable in `pdftotext` output — a lesson title page
carries the lesson's title text with no footer; a blank page carries no extractable text at all —
so this is an added row, not an ambiguity.

**But "no extractable text" is only well-defined once the page split is reconciled against
`pdfinfo`, and today's helper does not reconcile it.** [static-confirmed during red-team,
`assembleQuarter.integration.test.ts:194-196`] `pagesOf` is
`fullText.split("\f")`, and `pdftotext` emits a form feed **after every page including the last**,
so the split yields `pageCount + 1` entries whose tail is empty. Under the pre-017 relative
assertions that tail was harmless. It is not harmless now: an empty tail entry is byte-identical to
a genuine blank-class page, so the inventory INV-5 requires to account for **every** rendered page
disagrees with `pdfinfo` by one on **every** book, and a rule reading "the last page is blank" is
a coin flip. Two concrete requirements, both cheap:

- **Anchor the inventory on the authoritative page count** — `pdfinfo`'s today, the UNO macro's if
  R3's no-poppler-in-production fallback lands; the rule is stated over `renderedPageCount` and does
  not lapse with the mechanism. Assert `parts.length === renderedPageCount + 1` and that
  the tail entry is empty, then drop exactly one entry; the classifier consumes exactly
  `renderedPageCount` entries and every index it reports is a physical sheet position by
  construction. A mismatch throws the curated reason rather than being silently absorbed — it means
  the extraction and the count are describing different documents, which is F1's failure one layer
  down.
- **Blank class is "no extractable text after whitespace trim."** Under `-layout`, a page with no
  content commonly yields newlines and spaces rather than the empty string, so an exact-empty test
  misclassifies blanks as lesson-title class — and lesson-title class is what the locator scans for.

A genuine trailing blank page is probably unreachable (LibreOffice inserts an implicit blank to fix
a _following_ page's parity, so it never lands last), which is why this is a robustness requirement
rather than a live defect. The `pdfinfo` cross-check earns its place regardless, because the
off-by-one is present on every book today.

**Consequences, all specified rather than left to implementation:**

- The classification gains a **blank** class (no extractable text), and confirmation B accepts a
  blank-class predecessor.
- **LibreOffice inserts blank pages of its own, before this feature inserts any.**
  [static-confirmed during red-team, both assets] `Inside_20_cover` uses a page layout with
  `style:page-usage="left"` (`Mpm13` in both assets), and the Luke-2 TOC constituent
  (`Luke-2-99v01.odt`) pins a paragraph to that master. LibreOffice therefore forces that content
  onto a verso page, inserting an implicit blank when parity requires it — the same mechanism
  `removeLeadingBlankParagraphs`' own doc comment records for the Q1 TOC (100 → 99 pages once the
  leading empty paragraph was deleted). Implicit blanks are in the rendered book today, unmodelled
  by this plan, and one landing immediately before the first lesson would throw pre-insertion too.
- **The PDF export must be pinned to include automatically inserted blank pages.** "PDF page
  indices _are_ physical sheet positions" (Summary, and the whole basis of FR-010's
  phantom-immunity) holds only if the export emits LibreOffice's own implicit blanks. The Writer
  PDF filter has an explicit option for this (`IsSkipEmptyPages`, the UI's "Export automatically
  inserted blank pages"); which way it defaults is **not** established here, and it must not be
  relied on either way. The render pins the filter option explicitly in its `--convert-to`
  arguments.

  **The option's polarity is inverted relative to the prose, so state the value, not the name.**
  `IsSkipEmptyPages` = **`false`** is what _includes_ automatically inserted blank pages; `true`
  skips them. An instruction reading "pin `IsSkipEmptyPages`" without a value is a coin flip that
  lands on the wrong side half the time and produces a silently short PDF. Every artifact and every
  generated task states the value.

  **The mechanism for passing it is spike input, not settled.** Filter options travel as a JSON
  third field on the `--convert-to` target
  (`pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}`), which requires
  LibreOffice ≥ 7.4. Local development is 25.8, but the **deploy host's `soffice` version is not
  established** — fold this into research R3's existing open item on production tooling
  (`pdftotext`/`pdfinfo` availability), since both are answered by the same look at the deploy box
  and both have the same fallback: move the work into the UNO macro, which can set the filter
  property directly and is already a shipped surface (`Module1.xba`).

  **The flag is never trusted on its own.** The spike's rendered-page-count check against a book
  known to carry an implicit blank is the empirical confirmation that the option was accepted and
  took effect; a silently ignored filter option looks exactly like a correctly-set one until that
  count is compared. If implicit blanks were dropped, the rendered PDF would be shorter than the printed
  book on exactly the books that contain one — the Luke-2 corpus among them — and the measured
  parity would be silently wrong: the passes-while-wrong class this feature exists to kill. The
  spike verifies the rendered page count against a book known to contain an implicit blank, which
  also gives research R4 (headless vs interactive equivalence) a concrete failure mode to test
  instead of an open equivalence question.

  **The filter option binds every render, not just the production one — the verification layer is
  currently the counterexample.** [static-confirmed during red-team,
  `assembleQuarter.integration.test.ts:155-178`] The integration test's own `convertToPdf` helper
  invokes bare `soffice --headless --convert-to pdf` with **no** filter argument. If
  `measureLessonOneParity` pins `IsSkipEmptyPages` to `false` and the verification render does not,
  the two render a **different page inventory** of the same book on exactly the books that carry an
  implicit `page-usage="left"` blank — the Luke-2 corpus among them. FR-016's absolute page-number
  assertions and INV-7's odd-index check would then be evaluated against a document that is not the
  one production measured, and both would pass or fail for reasons unrelated to the delivered book:
  the passes-while-wrong shape this feature exists to kill, reproduced inside its own oracle.

  **Invariant**: _every render whose output feeds a page inventory, an absolute page-number
  assertion, or a parity claim pins `IsSkipEmptyPages` = `false`_ — the production measurement, the
  integration and acceptance renders, and the spike scripts alike, for the same reason in each case
  (the oracle must reflect physical sheets). Satisfy it structurally, by routing every such render
  through **one exported helper** that owns the filter argument, rather than by repeating the
  argument at each call site; the integration test additionally asserts the argument is present, so
  a helper edit cannot silently drop it. **The helper shares the argument, not the spawn**: it is a
  pure exported builder for the `--convert-to` target, because production must spawn `detached`,
  group-kill, and honour an `AbortSignal` while the test's `execFileSync` needs none of that.
  A shared spawner would pull process-lifecycle machinery into the test path for no gain.

  **If the R3 fallback lands, the mechanisms diverge and equivalence becomes a spike item.**
  Production may end up setting the property through the UNO macro (`Module1.xba`) while the tests
  keep the JSON `--convert-to` syntax — two different routes to the same option. That is workable,
  but it is an assumption: the spike confirms both routes produce the same rendered page count on a
  book known to carry an implicit blank, rather than inferring it.

  **And on that branch the invariant stops being structural, which is the part worth saying out
  loud.** The whole point of routing every render through one exported helper is that a helper edit
  cannot silently drop the option from production, because production and the oracle share the
  argument. If production moves to the UNO macro, the helper binds only the test and spike renders:
  the shared object is gone, an edit to `Module1.xba` can drop the property with every helper
  assertion still green, and the guarantee degrades to the coincidence the invariant was written to
  replace. **Requirement on that branch**: the single guard is replaced by **two named** ones rather
  than quietly lost — the existing helper assertion keeps binding the verification renders, and
  `module1Xba.ts`'s embedded macro constant is asserted to set the filter property, in the same
  style as the existing embedded-constant assertions. Both, or the branch is not done.

  **Contract §7's carve-out is widened to match.** It currently exempts `Module1.xba` /
  `module1Xba.ts` from "unchanged" only for the R3 page-index query; the filter-option fallback is a
  second, independent reason the same files can change, and an unnamed second reason is how a
  "nothing changes here" line goes stale.

- **The "+1 page" assumption behind the filler is not safe, so the confirmation render is
  mandatory on the `needsFiller` branch.** Inserting one blank flips the parity of every page
  after it, which can make LibreOffice add or drop an implicit page-usage blank upstream of the
  measurement point — so lesson 1 does not necessarily move by exactly one. FR-010's own logic
  settles this without a cost argument: the pre-insertion measurement is a _prediction_ about a
  document that is not the delivered one. The delivered document is the filler-carrying one, so
  its parity is re-measured on it. Only jobs that actually insert a filler pay the extra render;
  the rest still pay one. If the re-measurement still reports an even index, the job fails with
  the curated reason rather than delivering a book whose recto guarantee is unverified — a second
  filler is never inserted.
- **Budget**: that makes a third possible `soffice` invocation, so `ASSEMBLY_TIMEOUT_MS`'s
  structural sum (contract §5) gains a second `ASSEMBLY_RENDER_TIMEOUT_MS` term. All invocations
  stay strictly sequential, so the "never two LibreOffice processes" guarantee and the
  soffice-self-kills-first invariant are unchanged in kind.

### The parity is measured on a PDF, but the book is delivered as an ODT — and the two disagree about blank pages by default

[static-confirmed during red-team, `assembleQuarter.ts:293-296`] The deliverable is an **`.odt`**
retained at `<docs>/tmp/<timestamp>_<jobId>.odt`; the coordinator opens it and prints or exports it
herself. The FR-010 measurement pins its own export to **include** LibreOffice's automatically
inserted blank pages (`IsSkipEmptyPages` = `false`), so the measured index is a physical sheet
position **of that render**. Whether it is also a physical sheet position of the **printed** book is
a separate, per-document setting that nothing in this plan touches.

[AUTHORITATIVE — XML-parser probe of `settings.xml`, both assets and the committed corpus] ODF
carries that setting inside the document:
`<config:config-item config:name="PrintEmptyPages" config:type="boolean">`, LibreOffice's "Print
automatically inserted blank pages". Note the polarity runs opposite to the export option's:
`PrintEmptyPages` = **`true`** and `IsSkipEmptyPages` = **`false`** both mean _include the blanks_.
It is **not** uniform across the inputs:

| Document                                          | `PrintEmptyPages` |
| ------------------------------------------------- | ----------------- |
| `assets/quarter-styles-template.odt`              | `true`            |
| `assets/quarter-styles-template-monolingual.odt`  | `true`            |
| `Luke-2-14v01.odt` (lesson constituent)           | `true`            |
| `Luke-2-99v01.odt` (the `-99` front-matter / TOC) | **`false`**       |

The last row is the one that bites: `Luke-2-99v01` is the very constituent that pins
`Inside_20_cover` and therefore _causes_ the implicit `style:page-usage="left"` blank the recto
arithmetic depends on. And the assembled book does not inherit the template's `true`:
`loadStylesFromURL` loads **styles**, not document settings, so the merged document's value comes
from the base document `Module1.xba` merges into — i.e. from the per-job LibreOffice profile's
default, which is unestablished here and outside this feature's control.

If the delivered book ends up carrying `PrintEmptyPages` = `false`, its implicit blank is dropped at
print time, every page after it shifts by one, and lesson 1 opens **verso** in the printed
book — while every automated assertion, read off a render pinned the other way, reports odd and
passes. That is the passes-while-wrong shape this feature exists to kill, moved one step past the
last thing the plan asserts. SC-004 is a claim about the book the client holds, not about the PDF
the server rendered.

**Requirement**: finalize pins it in the delivered document, and the merged-output assertion
guards it. `finalizeAssembledQuarter` already unzips the whole package and patches `content.xml`,
`styles.xml`, and `meta.xml` before re-zipping
[static-confirmed during red-team, `finalizeAssembledQuarter.ts:80-107`], so this is a fourth entry
in an existing pass rather than a new mechanism: set `PrintEmptyPages` to `true` in the assembled
`settings.xml`, creating the `config:config-item` if absent and failing loudly with the curated
reason if the settings document has no configuration-settings set to create it in (contract §2.6).
`assembleQuarter.integration.test.ts` asserts the value on the **merged output** in both modes,
alongside the INV-1 and INV-6b merged-output guards it already carries, and for the same reason as
those two: it is a property of the delivered book that the merge decides, and asset-only validation
cannot observe it.

Three scope notes, so this does not grow:

- **The FR-009 filler is unaffected either way.** The setting governs only pages LibreOffice
  inserts _automatically_ to satisfy a left/right page usage. The filler is an explicit empty
  paragraph pinned to a master, so it is a content page and always prints. The exposure is confined
  to books that carry an implicit blank — the Luke-2 corpus among them.
- **The fixed points are unaffected.** Setting a config item to a constant is naturally idempotent,
  so INV-13 and INV-13a still hold byte-identically across the two-pass flow.
- **It gives research R4 a confounder to control — but only half of one, so say which half.** R4
  compares the headless render against an interactive PDF export of the same document. Pinning
  `PrintEmptyPages` governs the **print** path; the interactive **export** path is governed by the
  dialog's own "Export automatically inserted blank pages" checkbox, which is the same
  `IsSkipEmptyPages` the headless render pins as an argument and is **not** established to derive
  from the document's setting. So R4's instruction must name the checkbox explicitly (checked =
  blanks included = `IsSkipEmptyPages` `false`) rather than assuming a pinned document settles it.
  Left implicit, the two routes disagree on exactly the books carrying an implicit blank and R4
  records a spurious non-equivalence — the confounder this note claims to remove, surviving in the
  half it does not reach. Both are pinned before the spike exports anything.

### The filler must survive the second finalize pass

Contract §2.4 covers not double-inserting. The stronger requirement is that the filler — an
**empty** `<text:p>` — survives every _other_ pass that re-runs on the second finalize,
specifically `removeLeadingBlankParagraphs` and any normalization that treats contentless
paragraphs as noise. Guard with a fixed-point test: `finalize(finalize(doc))` is byte-identical
to `finalize(doc)` for both `insertRectoFiller` values.

**The fixed point covers every file finalize patches, not `content.xml` alone.** Scoping it to
`content.xml` under-covered the pass even before this feature — [static-confirmed during red-team,
`finalizeAssembledQuarter.ts:80-107`] finalize already rewrites `styles.xml` (`patchOutlineNumbering`,
and the monolingual restyle) and `meta.xml` (`patchBookMetadata`) — and §2.6 now adds
`settings.xml` as a fourth. Two of those four are load-bearing for this feature specifically: the
`PrintEmptyPages` pin (INV-7a) and, if the merged-output assertion forces it, the unconditional
offset strip in the styles pass (INV-1). A second pass that perturbed either would break a delivered
guarantee while a content-only fixed point stayed green — the passes-while-wrong shape one file over.
State the invariant as _every file finalize patches is a fixed point_, and assert all four.

All four are expected to hold, and `meta.xml` — the only one whose stability is not obvious — does
[static-confirmed during red-team, `finalizeAssembledQuarter.ts:268-310`]: `patchBookMetadata`'s
`upsert` removes each target element and re-appends it to `office:meta` in a fixed order, so the
first pass moves them to the end and every later pass reproduces that same arrangement. Order-stable
after one pass, hence a fixed point. The assertion is a regression guard, not a suspicion.

**The flag-constant fixed point is not the production path.** Assembly runs
`finalize(doc, false)` and then `finalize(·, true)` (contract §4) — a **mixed** pair that the
invariant above never exercises. The first pass has already applied the body restart and the
clone-and-repoint, so the second pass sees a different document than `finalize(doc, true)` sees:
its "first visible level-1 `text:h`" lookup runs against an already-normalized tree, and a
second clone-and-repoint risks forking the automatic style again — the same repoint code path
runs unconditionally on every finalize call, so it does not know it already ran once on this
document. Add the mixed assertion
explicitly — `finalize(finalize(doc, false), true)` yields the same patched files as
`finalize(doc, true)`, over the same four-file scope as the flag-constant fixed point above —
because it is the only sequence production actually executes.

### The body restart cannot inherit `normalizeLessonOpeningMasterPages`' skip conditions

Contract §2.2 says the restart uses clone-and-repoint "exactly as `normalizeLessonOpeningMasterPages`
already does". Read literally that is wrong in both directions, and both failure modes are silent
— the class of defect this feature exists to fix. [static-confirmed during red-team,
`finalizeAssembledQuarter.ts:192-240`] That function `continue`s — does nothing — in two cases the
restart cannot skip:

- **The heading rides a common _named_ style** (`if (!autoStyle) continue`). There is then no
  automatic style to carry `style:page-number="1"`, and patching the named style would restart
  numbering for every user of it. Skipping means FR-005 silently does not happen and the body
  sequence keeps whatever value it inherited — precisely the delivered defect.
- **The automatic style already carries a `style:master-page-name`** ("existing values are
  trusted"). No clone is made, so writing the restart onto that style writes it onto a style that
  may be shared with other paragraphs, restarting numbering wherever else it is used and violating
  INV-3 ("exactly one paragraph carries an explicit restart").

**Requirement**: the restart owns its isolation. Before setting `style:page-number="1"`, the pass
guarantees the target heading references an automatic style whose only referencers are that
heading — cloning and repointing where it is not, regardless of whether the style already carries
a master. Where isolation cannot be achieved (named style with no automatic style, and no
clone-and-repoint possible), it **throws** the curated reason rather than skipping. "Visible" is
the existing predicate: level-1 `text:h` whose automatic style does not carry
`style:text-properties/@text:display="none"` (the injected hidden heading).

**Clone naming must be deterministic, or the fixed points break.** The existing pass mints
`<name>_QA`, `<name>_QA_QA`, … by probing for a free name; a restart clone minted the same way
takes a _different_ name on the second finalize pass, and `finalize(finalize(doc, false), true)`
is then no longer byte-identical to `finalize(doc, true)` — INV-13a fails on the production path.
Either derive the restart clone's name deterministically from the heading's style name, or detect
an existing restart clone and reuse it. Asserted by the existing fixed-point tests, which is why
they must run against the restart, not only against the filler.

### Fallback if the filler's master page misbehaves

Research R3 leaves open whether two consecutive `First_20_Page` pages, with an explicit
`style:page-number="1"` restart on the second, behave as intended. If the spike shows it does
not, the fallback is to pin the filler to **`Standard`** — the other footer-less master, present
in both assets (R1).

The fallback master MUST render no footer. FR-009 requires the filler to print **nothing at all**,
not merely no page number.

**Footer rendering is a conjunction of two facts at two XML levels, and the last three passes each
got it wrong because each probed with a regex.** [AUTHORITATIVE — re-measured with an XML parser
(`ElementTree`), both assets; **supersedes every earlier footer claim in this plan, the contract,
and the data model**, including the "corrected predicate" installed one pass ago]

A master renders a footer **iff both** hold:

1. the master carries a `<style:footer>` element (the content), **and**
2. the page layout it references carries a **populated** `<style:footer-style>` — one containing a
   `<style:header-footer-properties>` child. LibreOffice emits an empty `<style:footer-style/>` on
   every switched-off layout, so the element's mere presence discriminates nothing.

Measured across both assets, the two conditions **coincide exactly** — every master with footer
content has a populated layout, and every master without has an empty one — so either test alone
happens to work on the assets today. State and assert the **conjunction** anyway: the two are
independent in ODF, they do **not** coincide in every constituent, and the merge mixes both levels.

| Master                            | Layout  | `<style:footer>` in master | `<text:page-number>` in it | `<style:footer-style>` | **Renders**                          |
| --------------------------------- | ------- | -------------------------- | -------------------------- | ---------------------- | ------------------------------------ |
| `First_20_Page`                   | `Mpm2`  | **no**                     | n/a                        | present but **empty**  | nothing                              |
| `Standard`                        | `Mpm1`  | **no**                     | n/a                        | present but **empty**  | nothing                              |
| `Inside_20_cover`                 | `Mpm13` | **no**                     | n/a                        | present but **empty**  | nothing                              |
| `Body_20_Pages`                   | `Mpm14` | **no**                     | n/a                        | present but **empty**  | nothing                              |
| `Cover_20_pages`                  | `Mpm15` | **no**                     | n/a                        | present but **empty**  | nothing                              |
| all ten other non-content masters | —       | **no**                     | n/a                        | present but **empty**  | nothing                              |
| `Coloring_20_Page`                | `Mpm10` | yes (branding, **×2**)     | **no**                     | **populated**          | branding twice, no number            |
| `Lesson_20_Content`               | `Mpm11` | yes                        | yes                        | **populated**          | marker + `Page <n>`                  |
| `Front_20_matter`                 | `Mpm12` | yes                        | yes (+ the offset)         | **populated**          | branding + Teacher's Guide + roman   |
| `Table_20_of_20_Contents`         | `Mpm16` | yes (bilingual only)       | yes                        | **populated**          | `Lessons from Luke: Teacher's Guide` |

**Exactly four masters of nineteen render a footer in the bilingual asset, three of fifteen in the
monolingual** (no `Table_20_of_20_Contents` there). Every other master carries **no footer element
at all** and an empty layout footer-style — dormant on both counts.

**The probe error, named so pass 18 does not repeat it.** Passes 14–16 probed `styles.xml` with
`<style:master-page style:name="X"(.*?)</style:master-page>`. Most masters here are **self-closing**
(`<style:master-page … />`), so that pattern runs past the named master and captures the body of the
next master that _does_ have a closing tag. `Standard` and `First_20_Page` are both self-closing and
are immediately followed by `Coloring_20_Page`, which is exactly how each acquired a phantom
"branding footer byte-identical to `Coloring_20_Page`'s". **Standing requirement**: every ODF
structural claim in these three artifacts is produced by an XML parser, never by a regex over the
serialized document. A `[static-confirmed]` tag on a regex-derived claim is not evidence.

Reinstated and struck, on that authority:

- **REINSTATED — "`First_20_Page` and `Standard` carry no `<style:footer>` at all."** True. Pass 14
  struck it on regex evidence and pass 16 propagated the strike; both were wrong. The
  definition of done "assert the filler's master carries no `<style:footer>`" is therefore
  satisfiable and correct on the chosen master and on its fallback — but it is only **half** the
  predicate, so generate the conjunction instead.
- **REINSTATED — "exactly three masters carry a `<text:page-number>` field."** True in the
  bilingual asset (`Lesson_20_Content`, `Front_20_matter`, `Table_20_of_20_Contents`) and two in
  the monolingual. The pass-14 "correction" to six — adding `Inside_20_cover`, `Body_20_Pages`,
  `Cover_20_pages` — is false: those three carry no footer element in **either** asset.
- **STRUCK — "`Mpm2` and `Mpm1` carry no `<style:footer-style>`."** Still false. Both carry one; it
  is empty. A DoD written from that wording fails on the chosen master and its fallback.
- **STRUCK — the mode-asymmetry claim that `Inside_20_cover`, `Body_20_Pages`, and `Cover_20_pages`
  "carry a page-number footer in the bilingual asset and no footer element at all in the
  monolingual", so "the same pinned paragraph yields a different rendered signature per mode."**
  They carry no footer element in either asset. Those three masters are footer-identical across
  modes, and that particular asymmetry does not exist. (FR-015's separate assertion still stands on
  the asymmetries that are real: the missing `Table_20_of_20_Contents` / `Front_20_cover` /
  `Back_20_cover` masters and the `-1` vs `-2` offset.)
- Confirmed unchanged: no `style:display` attribute appears on any footer element in either asset.

**Corrected predicate (the rendering conjunction)**, binding everywhere "footer-less" or "renders no
footer" appears in this plan, the contract, and the data model: **a master renders no footer when it
carries no `<style:footer>` element, or the layout it references has no populated
`<style:footer-style>`** — and a master is safe for the filler exactly then. `First_20_Page` and
`Standard` satisfy **both** disjuncts, so the design's choice and its fallback are correct with
margin. Any generated assertion tests the conjunction; asserting only one level is what produced
three passes of churn. `Coloring_20_Page` satisfies neither and would print
`Lessons from Luke … Quarter <n> Lesson <n>` on a page FR-009 says prints nothing. Sequence
membership — the spec calls the filler part of the front-matter run — is a requirement claim about
which number it consumes, **not** a licence to pin it to the front-matter master, which would print
a roman numeral on that page.

`Standard` is also the better fallback on the mechanism: it makes lesson 1's heading a genuine
master-page _transition_ rather than a same-master repeat, which is the most likely reason the
`First_20_Page`-on-`First_20_Page` arrangement would fail to honour the restart in the first
place. Naming the fallback now keeps the spike from re-deriving it.

**Sheet geometry checked, not assumed** [static-confirmed during red-team]: `Standard`'s layout
`Mpm1` and `First_20_Page`'s `Mpm2` declare identical `fo:page-width` (21.001 cm) and
`fo:page-height` (29.7 cm); they differ only in vertical margins (1.499 cm vs 1 cm), which is
invisible on a blank page. So the fallback introduces no mid-book sheet-size change in a duplex
print, and no new master needs cloning.

### Footer suppression on `First_20_Page` is merge-dependent, and every constituent re-enables it

The rendering conjunction above says the lesson title page and the FR-009 filler print nothing
because in the **template** `First_20_Page` has no footer content and `Mpm2` is unpopulated. That
is not a property of the delivered book — it is a property the merge has to win, and the inputs
push the other way, harder than earlier passes recorded.

[AUTHORITATIVE — XML-parser probe of `test/docs/serverDocs/`; the conclusion survives the pass-17
correction and its consequence sharpens] Every constituent sampled (`Luke-2-14v01`,
`Luke-2-99v01`, `Luke-1-01v03`) defines its own `First_20_Page` that satisfies **both** conditions —
footer content **and** a populated `Mpm2`. What that footer says is not branding: it is the
**copyright and licence block** (`Year of publication Publisher This work is licensed under the …`;
`2019 Wycliffe Bible Translators, Inc.; …` in `Luke-1-01v03`). `Luke-1-01v03` additionally renders a
footer on `Standard` — and aliases `Lesson_20_Content` to `Mpm1`, `Standard`'s own layout, a second
instance of the `Mpm<n>` corollary below. So a merge that fails to overwrite puts a **copyright
line** on every lesson title page and on the FR-009 filler, not a branding line. The assembled book's title pages are
footer-less only because `Module1.xba`'s
`loadStylesFromURL(OverwriteStyles=True, LoadPageStyles=True)` replaces the constituent layouts with
the template's.

This is the **same unstated dependency as INV-1**, one layer down, and it is load-bearing for far
more: FR-007 (lesson first pages print no number), FR-009 (the filler prints nothing), and the
entire page-class table the FR-010 locator and the FR-016 oracle are built on. A narrowing of the
style load, or a constituent introducing a layout the template does not overwrite, silently turns
every title page and the filler into **copyright-line** pages — and the locator's title-vs-coloring
discriminator degrades, because both classes then carry footer text where the table expects none.

**Requirement**: assert it on the merged output, in the same place and the same style as INV-1's
offset assertion. `assembleQuarter.integration.test.ts` asserts that in the assembled book's
`styles.xml` the `First_20_Page` and `Standard` masters **render no footer** under the conjunction —
the master carries no `<style:footer>`, **and** the layout it references (resolved by master name,
never by literal `Mpm<n>`) has no populated `<style:footer-style>` — in **both** modes. Assert both
conjuncts: each alone is true of the template today, but the constituents satisfy both, so a merge
that half-fails is exactly what this guard exists to catch. **Not** "carries no
`<style:footer-style>`": that phrasing fails on the merged output for the same reason it fails on
the template, since LibreOffice emits the empty element on every switched-off layout. Asset-only
validation cannot observe this, for exactly the reason it cannot observe a constituent-borne offset.

**Corollary — do not cite `Mpm<n>` as a cross-document identifier.** Automatic page-layout names
are only locally unique, the same weakness research R2 documents for automatic paragraph styles:
in the template `Mpm13` is `Inside_20_cover`'s layout, while in the TOC constituent
`Luke-2-99v01` `Mpm13` is `Coloring_20_Page`'s and `Inside_20_cover` rides `Mpm5`. Masters are
matched by master **name** at load, so the merge is unaffected — but every `Mpm<n>` in this plan
and in the contract names a **template** layout, and any check written against a constituent or
against the merged output must resolve the layout through its master name rather than by literal
`Mpm<n>`.

### The offsets are not asset-only on the input side — the constituents carry their own

[AUTHORITATIVE — XML-parser probe of the whole `test/docs/serverDocs/` corpus; **supersedes the
pass-13 attribution table, which was regex-derived and mis-assigned two of its three rows**]
Research R1's "the offsets are asset-only" is accurate about the two committed assets and
**inaccurate about the inputs**. Every committed lesson master together carries 30
`text:page-adjust` occurrences outside the assets — and **all thirty sit on `Front_20_matter`**:

| Master carrying the offset | Value | Occurrences | Where                                                |
| -------------------------- | ----- | ----------- | ---------------------------------------------------- |
| `Front_20_matter`          | `-3`  | 28          | lesson constituents                                  |
| `Front_20_matter`          | `-1`  | 2           | the `-99` front-matter constituents (Luke-1, Luke-2) |

**Struck**: the earlier rows attributing `-1` to `HTML` and `-3` to `Body_20_Pages`. Neither master
carries an offset anywhere in the corpus; the attribution came from the same boundary-spanning regex
that produced the phantom footers (see §2.5's probe-error note), which assigns each offset to
whichever master name happens to precede it in the serialized file. The **total of 30 is unchanged**,
so only the attribution was wrong.

This matters because the **entire corpus `assembleQuarter.integration.test.ts` assembles**
(`Luke-2-{14..26,99}v01.odt`) is offset-carrying: 13 lesson constituents at `-3` plus a TOC
constituent at `-1`, against a template at `-1`. Three competing values enter one merge — on **one**
master name, not three, which makes the overwrite story simpler and the assertion no weaker.

**Why the delivered book is probably still correct after the asset edit, and why that is not
enough.** `Module1.xba` merges into a blank base, then calls
`loadStylesFromURL(OverwriteStyles=True, LoadPageStyles=True)` from the template — the mechanism
whose whole purpose is that "the template's page styles win over whatever the constituents
brought in" (the macro's own comment, and why the footer-less `First_20_Page` master wins today).
All three offset-bearing master names above exist in **both** assets, so all three are expected to
be overwritten by offset-free definitions once the assets are fixed. FR-004/SC-005 then holds —
**by a dependency the plan never states and never asserts**, on a style-load call whose family
list and overwrite flag are one edit away from changing, and on the accident that no constituent
introduces a master name absent from the template. A client-created page style, or a future
narrowing of the load, silently reintroduces an offset into a delivered book.

Two consequences, both cheap:

- **INV-1 is verified on the merged output, not only on the assets.** The planned validation
  (`quarterStylesTemplate.test.ts` asserting no offset in either asset) cannot see a
  constituent-borne offset at all. `assembleQuarter.integration.test.ts` additionally asserts
  **zero** `text:page-adjust` occurrences in the assembled book's `styles.xml` and `content.xml`,
  in **both** modes. This is the assertion that actually corresponds to SC-005 (the client
  inspects the delivered book, not the asset), and it runs on the offset-carrying corpus above,
  so it is a real test rather than a tautology.
- **If that assertion fails, strip rather than re-tune.** The fix is an unconditional removal of
  every `text:page-adjust` attribute in the merged `styles.xml`, added to the existing
  `finalizeAssembledQuarter` styles pass — post-merge, so it is source-agnostic and makes INV-1
  true by construction regardless of what a constituent carries. Stripping per-constituent in
  `prepareConstituentForAssembly` (which already rewrites each constituent's `styles.xml` in
  place) is the weaker alternative: it is correct only for offsets the pipeline sees, and it
  edits 14 documents to fix one. Neither is added speculatively — the merged-output assertion
  decides, and the spike already produces an assembled book to run it against as a `grep`.

### The two front-matter masters do not number on the same basis today

[static-confirmed during red-team] In the bilingual asset the offset is not uniform across front
matter: `Front_20_matter` carries `text:page-adjust="-1"` while `Table_20_of_20_Contents` — also
roman (layout `Mpm16`, `style:num-format="i"`) and also carrying a page-number field — carries
**no** offset. Front matter therefore prints on two different bases today, and the discontinuity
lands exactly at the master boundary between them. (The monolingual asset has no
`Table_20_of_20_Contents` master at all and carries a single `-2` on `Front_20_matter`, so the
boundary exists only in bilingual — another instance of R5's non-parallelism.)

This sharpens contract §2.2's decision criterion for the conditional front-matter anchor. Reading
only "does physical page 2 print `ii`" on the offsets-zeroed spike variant is insufficient: page 2
rides `Front_20_matter`, so it says nothing about whether the sequence stays continuous across a
change of front-matter master. The criterion must additionally check every such boundary present in
the render for a repeated or skipped value. If the boundaries are clean with offsets removed, the
anchor is redundant (Principle VII) and is not added; if any is not, the anchor is added.

**But do not write that check against the `Table_20_of_20_Contents` boundary specifically — in the
committed corpus that boundary does not exist.** [static-confirmed during red-team, every
`.odt` in `test/docs/serverDocs/`] **No** constituent pins any paragraph to the
`Table_20_of_20_Contents` **master page**. The `-99` front-matter constituents pin only
`Front_20_matter` and `Inside_20_cover`; the rendered table of contents is a table riding
`Front_20_matter`. So in the corpus this feature assembles, front matter renders on **one**
numbering basis, not two, and the `Front_20_matter` → `Table_20_of_20_Contents` transition the
paragraphs above reason about never occurs. Three consequences:

- **A criterion keyed on that transition is vacuous.** It "passes" because there is nothing to
  check, the anchor is skipped, and the skip is recorded as evidence when none was gathered — the
  passes-while-wrong shape this feature exists to kill. Generalize instead: _the roman sequence is
  continuous across every front-matter master transition **present in the rendered output**;
  vacuously satisfied when front matter renders on a single master._ That phrasing survives any
  corpus shape and needs no master named in advance.
- **The drift attribution is struck.** A prior pass called the non-uniform offsets "the most likely
  reason the delivered book's numbering drifted"; a boundary that never occurs cannot have caused
  the drift. The cause reverts to open, and the spike's offsets-zeroed variant is what settles it.
- **`Table_20_of_20_Contents` is a name collision, and a string grep will conflate the two uses.**
  It is a **master-page** name in the template _and_ a **paragraph-style** name in the constituents
  (`Table_20_of_20_Contents`, `M.T._20_Table_20_of_20_Contents`,
  `Table_20_of_20_Contents_20_-_20_Table_20_heading`, `…_-_20_Scrip_20_references`), which is why
  the string appears in constituent `content.xml`/`styles.xml` while the master is unused. Any
  check for master usage matches `style:master-page-name`, never the bare string.

The asymmetry itself still stands and still matters for the assets: the bilingual asset's
`Table_20_of_20_Contents` master is roman, footer-rendering, and offset-free while `Front_20_matter`
carries `-1`. It is latent — a future front-matter master pinning it would immediately produce two
bases — so removing the offsets fixes it before it can fire.

### The kill-switch needs a named configuration mechanism, not just a shape

The switch is pinned as server-side-only and default-on above, but "server-side configuration"
names no mechanism, and this repo has two established and non-interchangeable ones: `secrets.json`

- `defaultSecrets` (`src/server/util/secrets.ts`) for credentials, and environment variables
  (`BETTER_AUTH_URL`, `NODE_ENV`, `TEST_DB`, `DEV_DB`) for deploy-time toggles. Left unnamed,
  `/sp:05-tasks` generates a task with no home for the value and the ambiguity survives into
  implementation.

**Decision**: an **environment variable**, `ASSEMBLY_RECTO_FILLER`. It is an operational toggle an
operator flips on the deploy host under a failing render, not a secret, and `secrets.json` is
credential-shaped and regenerated from `defaultSecrets`. Read through a single exported predicate
colocated with the module it gates (`measureLessonOneParity.ts`), evaluated **per call** rather
than at module load so tests can exercise both branches without module-cache manipulation.
Default on: only an explicit `off` / `false` / `0` disables it; any unset, empty, or unrecognized
value keeps the guarantee, so a typo cannot silently ship books without it.

**Where the predicate is consulted is a separate decision from where it lives, and only the first
is pinned so far.** "Colocated with the module it gates (`measureLessonOneParity.ts`)" fixes the
_home_; it says nothing about the _call site_, and the nearest reading — consult it inside
`measureLessonOneParity` — is not implementable against the signature contract §3 states.
`measureLessonOneParity` returns `LessonOneParity`, which has no representation for "skipped": an
off reading inside the pass would have to invent a sentinel index, a nullable return, or a thrown
sentinel, and all three put a second meaning into a value the filler decision consumes directly.
Left unstated, `/sp:05-tasks` generates a task that has to pick one.

**Decision**: `assembleQuarter` — the orchestrator that owns the branch — consults the predicate
**exactly once per job**, before the first measurement, and that single boolean governs all three
dependent steps (the measurement, the conditional re-finalize, and the mandatory confirmation
render). The predicate is never consulted inside `measureLessonOneParity`, whose contract is
unconditional: called, it measures. Reading it once per job also keeps the three steps from
disagreeing about whether FR-008 is being enforced — a job that measured, inserted a filler, and
then skipped the confirmation would deliver a filler-carrying book whose parity was never verified
on the delivered document, which is precisely what contract §4 makes the confirmation render
mandatory to prevent. Per-call evaluation stays a property of the **predicate** (so tests exercise
both branches without module-cache manipulation), not of the decision.

### A per-constituent automatic-style rename must rewrite every reference, not just `text:style-name`

Gated on research R2 — this constrains fix direction (a) if the spike selects it, and does not
prescribe the mechanism.

Contract §6 says direction (a) changes "only the automatic-style names inside the constituent
copy". That understates the blast radius twice over:

- **Automatic style names are referenced from many attributes**, not one. A rename pass that
  rewrites `text:style-name` alone leaves dangling references behind in
  `text:cond-style-name`, `draw:style-name`, `draw:text-style-name`, `table:style-name`,
  `table:default-cell-style-name`, `text:list-style-name`, and `style:parent-style-name` where one
  automatic style parents another. A dangling reference degrades silently to default formatting —
  the same class of defect this feature exists to fix.
- **The 007/009/013 machinery rides automatic styles by name.** `normalizeLessonOpeningMasterPages`
  clones and repoints automatic styles to pin `First_20_Page`, and the 013 style-application work
  keys on them too. Renaming underneath that machinery is a real interaction, so direction (a)
  re-runs the existing template-application and footer/master-page integration assertions as part
  of its own definition of done rather than assuming they are unaffected.

### Bounding the wait for the merge to exit

Security Considerations requires the merge's `soffice` process group to have exited before the
render starts. That check must be a **bounded** poll with its own budget slot, not an open
await. `assemblyBudget.ts`'s own rationale for `ASSEMBLY_ABANDON_MS` is that unbounded awaits
inside the runner can wedge the concurrency-1 slot for the life of the process; a naive
"wait until the group is gone" is exactly that shape, and LibreOffice's `oosplash` →
`soffice.bin` re-parenting is why the group-kill machinery exists at all. Poll the group with a
cap; on expiry, fail the job with the curated reason rather than starting a second `soffice`
alongside a live one.

**The cap needs a term in the budget sum, or the invariant it protects is unfunded.** Contract
§4 gives the poll "its own budget slot", but contract §5's sum is
`DEFAULT_TIMEOUT_MS + 2 × ASSEMBLY_RENDER_TIMEOUT_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS` — no poll
term exists in it. There are up to **three** polls per job (before render 1, before the
re-finalize, before the confirmation render), plus a second full unzip/patch/rezip of a ~100-page
book, all of which today would have to fit inside `ASSEMBLY_NON_SOFFICE_BUDGET_MS`
[static-confirmed during red-team, `assemblyBudget.ts:29`] — a flat 2 min sized for the pre-017
flow and asserted only `>= 60_000`. If they do not fit, the registry timeout fires while a poll
is legitimately still waiting on a live LibreOffice group, freeing the concurrency-1 slot with a
process alive: exactly the OOM shape on the 2 vCPU / 2 GB swapless box that the
soffice-self-kills-first invariant exists to prevent.

**Requirement**: name the cap as a constant (`ASSEMBLY_EXIT_POLL_CAP_MS`) and fold
`3 × ASSEMBLY_EXIT_POLL_CAP_MS` into `ASSEMBLY_TIMEOUT_MS`'s derived sum, carried
unconditionally like the render terms so the invariant stays structural rather than
branch-dependent. `assemblyBudget.test.ts` asserts the sum contains it, in the same style as
the existing derivation assertions.

### The confirmation render inherits the merge's preconditions, and must not read a stale PDF

Making the confirmation render mandatory turns a two-invocation sequence into a three-invocation
one, and two of the existing safeguards were written for the merge → render pair only.

- **The bounded exit-poll applies before _every_ render, not just the first.** The precondition
  "the previous `soffice` process group has fully exited" (Security Considerations) exists because
  the shared per-job profile is single-instance and its `.lock` wedges a second instance. Between
  render 1 and render 2 there is also a **re-finalize that rewrites the ODT in place** — unzip,
  patch, re-zip over the same path — while render 1's process may still hold the file open. The
  same capped poll (never an open await) runs before the re-finalize and before the confirmation
  render, failing the job with the curated reason on expiry.
- **Each render writes to its own output path, and the parse checks freshness.** If both renders
  target the same PDF path, a confirmation render that fails _after_ the file exists — or that
  fails to overwrite it — leaves the pre-filler PDF in place. Parsing that stale artifact reports
  the pre-filler index, which on the filler branch was **even**, so the check fails loudly; but the
  reverse ordering (a re-run, a retry, a job that reuses a work dir) can just as easily leave an
  odd stale index and _silently confirm a guarantee that was never verified_ — the exact
  passes-while-wrong failure this feature exists to correct. So: distinct, pass-tagged output paths
  per render, and the parse asserts the file it reads was produced by the invocation that just ran
  (path did not exist beforehand, or is unlinked before the render). **Distinctness comes from a
  per-pass `outDir`, not from naming the file**: `soffice --convert-to pdf --outdir <dir> <input>`
  derives the output filename from the input basename and offers no way to set it, and both renders
  read the same `odtPath` (the re-finalize rewrites it in place), so they derive the identical
  basename. `outDir` is therefore a parameter of the pass (contract §3).

### Both parity branches must be verified, and the measurement recorded

- The integration test MUST cover the **filler-inserted** branch, not only the no-filler happy
  path, with the same FR-016 absolute assertions. This is FR-016's own reasoning applied to
  US3: the delivered defect shipped because only relative assertions ran on one path.
- **How that branch is induced is a design decision, not an implementation detail**, because
  the mandatory confirmation render closes the obvious shortcut. The golden corpus lands the
  first lesson at one fixed parity; whichever it is, one branch is unreachable without a change.
  Forcing `insertRectoFiller: true` through `assembleQuarter` on a corpus that does not need a
  filler now makes the confirmation render report an **even** index and **fail the job** by
  design — so that route tests nothing. Two admissible routes, chosen once the spike reports the
  corpus's actual parity:
  - **Parity-flipped fixture** (preferred): assemble a constituent set whose front matter is one
    page longer or shorter than the golden corpus's, so the filler branch is entered for the real
    reason and the confirmation render is exercised as production runs it.
  - **Finalize-level assertion**: call `finalizeAssembledQuarter({ insertRectoFiller: true })`
    directly and assert on the resulting `content.xml` plus a standalone render, below
    `assembleQuarter`'s confirmation gate. Cheaper, but it does not exercise the orchestration,
    so it is a supplement rather than the coverage FR-016 asks for.
- `lessonOnePageIndex` and `renderedPageCount` are recorded in the job's diagnostics, so the
  next pagination complaint can be answered from a record rather than from a re-run. Per-job
  confirmation rendering after insertion stays optional (contract §4).
- **Where those diagnostics live**: server-side logging only. Contract §7 holds the assembly
  job status payload unchanged in shape, and the coordinator has no use for a page index, so
  these values must not be added to the status-poll response. Recording them in the
  `AssemblyJobRegistry` entry is acceptable **only** if the entry's serialized shape is
  unchanged.

### The kill-switch is a config surface, and needs pinning

The switch added above is new configuration, so its shape is a design decision rather than an
implementation detail:

- **Server-side configuration only** — never a request parameter. Contract §7 holds the HTTP
  API unchanged; a per-request override would add a caller-visible field and let any client
  opt out of a requirement.
- **Default on.** Off is the operator's deliberate choice under a failing render.
- **The off path is a branch, and is tested.** Claiming it "adds no untested branch" is only
  true once an integration test asserts the switched-off flow produces a book with no filler,
  with the numbering assertions still passing.
- **A forgotten flip must be visible.** If the only signal is one log line, books ship without
  the recto guarantee and the next client complaint arrives with no trace of why. The warning
  names FR-008 explicitly and is emitted once per job, not once per process.
- **The failure that most needs the switch must point at it.** The confirmation render fails the
  job when the post-insertion index is still even (contract §4), and that failure is
  **deterministic, not flaky**: a corpus whose parity does not flip by exactly one page fails
  every retry identically, hard-blocking delivery of US1 and US2 — the two defects the client
  actually reported — behind a P3 enhancement. The kill-switch is the intended remedy, but an
  operator only reaches it if something names it. So the **server-side log line** accompanying a
  measurement or confirmation-render failure names `ASSEMBLY_RECTO_FILLER` and the effect of
  switching it off (delivery without the recto guarantee). The **coordinator-facing** curated
  reason is unchanged — fixed-vocabulary and path-free, per the reason-hygiene contract; the
  remedy is an operator concern, not a client-visible one.
- **Accepted cost**: with the switch off, `ASSEMBLY_TIMEOUT_MS` still carries the render
  allowance, so a wedged job is marked failed later than strictly necessary. Documented and
  accepted rather than deriving the budget from the switch, which would make the
  soffice-self-kills-first invariant conditional instead of structural.

### The render's dependency on the merge's profile already holds — the three "changed" cleanup modules are not changed

Reusing the merge's warmed per-job profile (Security Considerations above) creates an ordering
dependency: the render runs **after** `sofficeAssemble` returns, so the profile directory must
outlive that return. Earlier passes assumed satisfying that meant moving teardown out of
`sofficeAssemble` and into `sweepAssemblyWork`, and re-tuning `reapOrphanedSoffice`. All three
claims are wrong against the code, and the `sweepAssemblyWork` one is actively dangerous — left
standing, `/sp:05-tasks` generates a task to route per-job teardown through a whole-root wipe.

- **`sofficeAssemble` owns no profile teardown, so nothing moves.**
  [static-confirmed during red-team, `sofficeAssemble.ts`] Its only `rmSync` is the stale
  `.lock` removal in `injectMacro`. `profileDirFor` returns `<workRoot>/<jobId>/profile`, which
  sits **inside** the `jobDir` that `assembleQuarter`'s own `finally` already `rm -rf`s
  (`assembleQuarter.ts`, "Working-dir lifecycle"). Profile lifetime is already job-scoped by
  construction. The requirement stands as a **regression guard**, not as new work: no task may
  introduce a merge-scoped profile reap, and the render must run before that `finally`.
- **`sweepAssemblyWork` is startup-only and must not be reused per job.**
  [static-confirmed during red-team] It has exactly one call site — `serverApp.ts:194`, at
  registry init — and its body `rm -rf`s **every** entry under `workRoot` after calling
  `reapOrphanedSoffice`, which SIGKILLs matching process groups. Its own doc comment pins it as
  safe "ONLY … before any new job can write under `workRoot`". Calling it at job end would
  delete other jobs' working dirs and kill live LibreOffice groups. It is unchanged, and the
  plan's prior "now owns per-job profile teardown" line is struck.
- **`reapOrphanedSoffice` cannot kill a live render, and the property to verify is the
  inverse.** [static-confirmed during red-team] It runs only inside that startup sweep, so no
  render is ever live when it runs. The real requirement is that a render **orphaned** by an
  abrupt Node death (a Capistrano `restart_passenger` mid-render) is still reapable — and
  `matchesAssemblyJob` already satisfies it, because the render carries the same
  `-env:UserInstallation=…/<jobId>/…` argument the reaper matches on and §3 mandates it reuse.
  Verified property, no code change. Corollary: the render MUST NOT be spawned against the
  shared default profile, or an orphaned render becomes unreapable — which is the same
  constraint Security Considerations already imposes, now with a second reason.

## Complexity Tracking

| Violation                                                                     | Why Needed                                                                                                                                                                                                                  | Simpler Alternative Rejected Because                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second `soffice` invocation per assembly job (render-and-measure)           | FR-010 makes recto placement depend on the _rendered_ page count, and Clarifications (2026-08-11) explicitly chose the rendered document over any internal counter                                                          | Counting the front-matter constituent alone is one cheaper render but measures a **different document** than the one delivered — the exact trust error FR-010 forbids. Trusting the ODF page counter is what produced the delivered defect. |
| A third `soffice` invocation on the filler branch (confirmation render)       | The pre-insertion measurement predicts the parity of a document that is not the delivered one, and inserting a blank can make LibreOffice add or drop an implicit `page-usage="left"` blank, so "+1 page" is not guaranteed | Trusting the prediction is the same class of error as trusting the ODF counter, one level up. Only filler-inserting jobs pay it, and it never inserts a second filler — an even index on re-measure fails the job.                          |
| A two-pass finalize (measure, then conditionally re-finalize with the filler) | Inserting the filler changes the document whose parity was measured; the measurement must run on a filler-free document                                                                                                     | A single pass would have to predict parity before rendering, which is the counter-trusting approach FR-010 rules out. The second pass is XML-only — no second merge.                                                                        |
| An optional `insertRectoFiller` flag on `finalizeAssembledQuarter`            | Expresses the two-pass flow without a second entry point or a duplicated finalize                                                                                                                                           | A separate `insertRectoFiller()` module would duplicate the unzip/patch/rezip cycle and risk the two passes diverging.                                                                                                                      |
