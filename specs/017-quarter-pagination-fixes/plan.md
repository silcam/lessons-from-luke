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
    ├── sofficeAssemble.ts                   # CHANGED — profile teardown moves to job scope
    ├── sweepAssemblyWork.ts                  # CHANGED — now owns per-job profile teardown
    ├── reapOrphanedSoffice.ts                # CHANGED — must not reap the live render
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
  `odtPath`, `workDir`, and the PDF output path are derived from job-scoped paths; a shell
  string breaks on spaces and turns any future path component into an injection surface.
  This applies equally to the `pdftotext` / `pdfinfo` calls (the integration test already uses
  `execFileSync` with array args — match it).
- Pass `-env:UserInstallation=file://<profileDir>` using the **same per-job profile directory**
  the merge already warmed (`profileDirFor(workRoot, jobId)`). The two invocations are strictly
  sequential within one job, so profile reuse is safe and avoids a second warm; what is not
  safe is falling back to LibreOffice's shared default profile, which is single-instance and
  would let the render collide with a concurrent `webifyLesson` or a lingering merge.
- Confirm the merge's `soffice` process group has fully exited before the render starts. A
  render launched against a profile whose `.lock` is still held either attaches to the running
  instance or wedges until its own timeout.
- Spawn `detached` (own process group) and kill with `process.kill(-pid, "SIGKILL")` on
  timeout or `AbortSignal`, so `reapOrphanedSoffice` is not the only thing standing between a
  hung render and a wedged concurrency-1 slot.

### Log and error hygiene

The measurement pass reads the **rendered text of unpublished translation content**. Curated
errors and diagnostics MUST NOT include extracted page text, and MUST NOT include absolute
filesystem paths — extending the existing path-free curated-reason rule
(`"assembly failed to finalize the merged book"`) to the new failure modes. Recording the
numeric `lessonOnePageIndex` / `renderedPageCount` (see Edge Cases below) is fine; recording
the page text that produced them is not.

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
  output instead of inferred from position:

  | Page class          | `Quarter <Q> … Lesson <N>` | `Page <n>` | Other signature      |
  | ------------------- | -------------------------- | ---------- | -------------------- |
  | Lesson title page   | absent                     | absent     | no footer at all     |
  | Coloring page       | present (twice)            | absent     | `Lessons from Luke`  |
  | Lesson content page | present                    | present    | —                    |
  | Front matter        | absent                     | present    | `Teacher's Guide`    |
  | Table of contents   | absent                     | present    | book title + subject |

  Lesson 1's title page is the first page satisfying the **whole conjunction**: it carries no
  footer at all, the page after it belongs to lesson 1 (coloring or content class, marker matched
  on a whole-token boundary so `Lesson 1` cannot match `Lesson 10`..`13`), and the page before it
  is absent or of front-matter or table-of-contents class. This makes the locator independent of
  where a coloring page falls inside a lesson.

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

### The filler must survive the second finalize pass

Contract §2.4 covers not double-inserting. The stronger requirement is that the filler — an
**empty** `<text:p>` — survives every _other_ pass that re-runs on the second finalize,
specifically `removeLeadingBlankParagraphs` and any normalization that treats contentless
paragraphs as noise. Guard with a fixed-point test: `finalize(finalize(doc))` is byte-identical
to `finalize(doc)` for both `insertRectoFiller` values, asserted on the merged `content.xml`.

**The flag-constant fixed point is not the production path.** Assembly runs
`finalize(doc, false)` and then `finalize(·, true)` (contract §4) — a **mixed** pair that the
invariant above never exercises. The first pass has already applied the body restart and the
clone-and-repoint, so the second pass sees a different document than `finalize(doc, true)` sees:
its "first visible level-1 `text:h`" lookup runs against an already-normalized tree, and a
second clone-and-repoint risks forking the automatic style again — the same repoint code path
runs unconditionally on every finalize call, so it does not know it already ran once on this
document. Add the mixed assertion
explicitly — `finalize(finalize(doc, false), true)` yields a `content.xml` identical to
`finalize(doc, true)` — because it is the only sequence production actually executes.

### Fallback if the filler's master page misbehaves

Research R3 leaves open whether two consecutive `First_20_Page` pages, with an explicit
`style:page-number="1"` restart on the second, behave as intended. If the spike shows it does
not, the fallback is to pin the filler to **`Standard`** — the other footer-less master, present
in both assets (R1).

The fallback master MUST be footer-less. FR-009 requires the filler to print **no** page number.
[static-confirmed during red-team, both assets] Exactly three masters carry a page-number field:
`Front_20_matter`, `Table_20_of_20_Contents` (bilingual only — absent from the monolingual asset,
per R5), and `Lesson_20_Content`. Every other master in both assets is page-number-less, so R1's
"only `First_20_Page` and `Standard` qualify" is too strong as stated. The accurate claim needs a
second criterion: FR-009's filler must print **nothing at all**, not merely no number, and
`Coloring_20_Page` — the third master reachable in the assembled page flow — carries a branding
footer (`Lessons from Luke … Quarter <n> Lesson <n>`) with no page-number field, so it is
page-number-less yet not blank. `First_20_Page` and `Standard` are the only masters that are both
reachable in the flow and carry no `<style:footer>` at all, which is what makes them the safe
fallbacks. Sequence membership — the spec calls the filler part of the front-matter
run — is a requirement claim about which number it consumes, **not** a licence to pin it to the
front-matter master, which would print a roman numeral on a page FR-009 says prints nothing.

`Standard` is also the better fallback on the mechanism: it makes lesson 1's heading a genuine
master-page _transition_ rather than a same-master repeat, which is the most likely reason the
`First_20_Page`-on-`First_20_Page` arrangement would fail to honour the restart in the first
place. Naming the fallback now keeps the spike from re-deriving it.

**Sheet geometry checked, not assumed** [static-confirmed during red-team]: `Standard`'s layout
`Mpm1` and `First_20_Page`'s `Mpm2` declare identical `fo:page-width` (21.001 cm) and
`fo:page-height` (29.7 cm); they differ only in vertical margins (1.499 cm vs 1 cm), which is
invisible on a blank page. So the fallback introduces no mid-book sheet-size change in a duplex
print, and no new master needs cloning.

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
rides `Front_20_matter`, so it says nothing about whether the sequence stays continuous across the
`Front_20_matter` → `Table_20_of_20_Contents` transition. The criterion must additionally check
that boundary for a repeated or skipped value. If the boundary is clean with offsets removed, the
anchor is redundant (Principle VII) and is not added; if it is not, the anchor is added — and the
non-uniform offsets are the most likely reason the delivered book's numbering drifted in the first
place.

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

### Both parity branches must be verified, and the measurement recorded

- The integration test MUST cover the **filler-inserted** branch, not only the no-filler happy
  path, with the same FR-016 absolute assertions. This is FR-016's own reasoning applied to
  US3: the delivered defect shipped because only relative assertions ran on one path.
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
- **Accepted cost**: with the switch off, `ASSEMBLY_TIMEOUT_MS` still carries the render
  allowance, so a wedged job is marked failed later than strictly necessary. Documented and
  accepted rather than deriving the budget from the switch, which would make the
  soffice-self-kills-first invariant conditional instead of structural.

### The render depends on state `sofficeAssemble` used to own

Reusing the merge's warmed per-job profile (Security Considerations above) creates an ordering
dependency that did not exist before: the render runs **after** `sofficeAssemble` returns, so
the profile directory must outlive that return.

- Profile teardown is pinned to **job** lifetime (the job's `finally` / `sweepAssemblyWork`),
  not to the merge call's completion. If `sofficeAssemble` currently reaps
  `profileDirFor(workRoot, jobId)` on its own way out, that reap moves.
- `reapOrphanedSoffice` must not kill the live render. It sweeps LibreOffice processes that
  look abandoned; a second, legitimately long-running `soffice` in the same job is exactly the
  shape it targets. Its criteria are re-verified against the render before this ships.

## Complexity Tracking

| Violation                                                                     | Why Needed                                                                                                                                                         | Simpler Alternative Rejected Because                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second `soffice` invocation per assembly job (render-and-measure)           | FR-010 makes recto placement depend on the _rendered_ page count, and Clarifications (2026-08-11) explicitly chose the rendered document over any internal counter | Counting the front-matter constituent alone is one cheaper render but measures a **different document** than the one delivered — the exact trust error FR-010 forbids. Trusting the ODF page counter is what produced the delivered defect. |
| A two-pass finalize (measure, then conditionally re-finalize with the filler) | Inserting the filler changes the document whose parity was measured; the measurement must run on a filler-free document                                            | A single pass would have to predict parity before rendering, which is the counter-trusting approach FR-010 rules out. The second pass is XML-only — no second merge.                                                                        |
| An optional `insertRectoFiller` flag on `finalizeAssembledQuarter`            | Expresses the two-pass flow without a second entry point or a duplicated finalize                                                                                  | A separate `insertRectoFiller()` module would duplicate the unzip/patch/rezip cycle and risk the two passes diverging.                                                                                                                      |
