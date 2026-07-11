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
(`OverwriteStyles=True, LoadTextStyles=True, LoadPageStyles=False, LoadNumberingStyles=False, LoadFrameStyles=False`)
so template paragraph styles win while the 007 clean page-style set is untouched.
The OFF page & numbering flags protect the page-style set and the `text:outline-style`
(chapter numbering) by construction; the chapterized footers and per-lesson outline
participation — which depend on `style:default-outline-level` carried on the
overwritten heading **paragraph** styles (see Edge Cases § "Overwrite scope") — are
pinned by the golden-reference integration test, not guaranteed by the flags alone. If the
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
LoadTextStyles=True, LoadPageStyles=False, LoadNumberingStyles=False,
LoadFrameStyles=False`.
- Style-load orthogonality to outline-numbering + finalize metadata, and
  pagination parity → **research R2 + cross-cutting**: the OFF page & numbering
  flags protect the page-style set and the chapter-numbering (`text:outline-style`)
  by construction. But `LoadTextStyles=True + OverwriteStyles=True` overwrites
  **every** paragraph/character style by name — including the heading styles the
  007 footer/outline mechanism depends on (`style:default-outline-level` lives on
  the paragraph style, not the numbering style). So footer-value resolution and
  outline participation are **pinned by the golden-reference integration test**,
  not proven by the flags. See Edge Cases § "Overwrite scope".
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
| US1: Downloaded quarter book arrives print-styled        | `specs/acceptance-specs/US13-quarter-book-print-styled.txt`     | 3         |
| US2: Template failure fails the job loudly               | `specs/acceptance-specs/US14-template-failure-fails-loudly.txt` | 2         |
| US3: Swapping in the real template is a file replacement | `specs/acceptance-specs/US15-template-drop-in-swap.txt`         | 2         |

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

## Edge Cases & Error Handling

_Adversarial review (sp:04-red-team). Design-impacting items are propagated to
`contracts/template-application.md` and `data-model.md`; the mitigations below are
authoritative._

### Macro error-handler scope (HIGH)

StarBasic `On Error Goto <label>` is **procedure-scoped, not block-scoped** — once
set before `loadStylesFromURL` it stays live through `storeToURL` and the `.done`
write unless explicitly reset. The `Assemble` sub today has **no** error handler,
so a `storeToURL` failure crashes the macro → non-zero exit → `settleReject`
(hard fail). Adding a naïve `On Error Goto TemplateFail` around the load would
**silently swallow a later `storeToURL` failure** into the fail path; worse, a
partial non-zero-length write could pass the `existsSync + size>0` guard in
`assembleQuarter` and be delivered as a "valid" but corrupt book (a new FR-003/
FR-004 regression the template step would introduce). Mitigations (see contract
§3):

- Reset with `On Error Goto 0` **immediately after** a successful
  `loadStylesFromURL`, so `storeToURL` errors still hard-fail as they do today.
- Place an `Exit Sub` before the `TemplateFail:` label so the success path does
  not fall through into it.
- `TemplateFail` MUST call `StarDesktop.terminate()` (and write no output / no
  `.done`), or a load failure lingers until the ~100 s hard timeout instead of
  failing fast.

### Overwrite scope — non-M.T. paragraph styles (HIGH)

`LoadTextStyles=True + OverwriteStyles=True` overwrites **every** paragraph and
character style **by name**, not just the `M.T.*` family. The stand-in derives
from Chris's Q2 master, so it also carries `Standard`, `Heading 1..N`, footer,
and cover styles. The 007 chapterized footers resolve positionally from **hidden
level-1 outline headings**, and `style:default-outline-level` is a property of the
**heading paragraph style** — which this load overwrites. `LoadNumberingStyles=False`
protects the `text:outline-style` (chapter-numbering definition) but **not** the
outline-level carried on the overwritten heading paragraph styles. The existing
"outline start-value = 14" assertion would still pass even if headings dropped out
of the outline (the numbering definition survives); the assertion that actually
catches this is **per-lesson footer-value resolution after overwrite**. The spec
Assumption ("template maps styles by name onto the same style families the source
masters use") makes a clobber low-probability but unverified. Mitigation: the
golden-reference integration test MUST assert footer chapter-number values still
resolve per-lesson **after** template application (see contract §5, made explicit);
do not rely on the numbering-start assertion as the outline-level guard.

### Highlight must be style-based, not direct-formatted (MEDIUM)

SC-003 and every planned assertion are scoped to **style definitions**
(`M.T. Text = transparent`). `loadStylesFromURL` only touches style definitions —
so if any **constituent** carries the M.T. highlight as **direct paragraph
formatting** rather than via the style, the overwrite will not remove it and the
style-scoped test still passes while the rendered book shows the highlight. Chris's
manual "Format → Styles → Load Styles" workflow (which only affects style
definitions) strongly implies the highlight is style-based, but the current test
cannot see direct formatting. Mitigation: confirm the highlight in the series-2
constituents is style-based (no `fo:background-color` in direct run/paragraph
properties on M.T. content); if a constituent direct-formats it, this style-only
approach does not deliver FR-002 and the design must widen.

### Corrupt (present-but-unreadable) template (MEDIUM)

US2's independent test conflates **missing** (Node `validateTemplateAsset`
fast-fails with the specific curated reason) with **corrupt/truncated/wrong-format**
(passes the exists+non-empty gate, then `soffice` must handle it). A corrupt source
fails **safe** — either `loadStylesFromURL` raises a trappable Basic error (fast
fail → generic "assembly produced no result") or, worst case, `soffice` blocks on a
modal until the ~100 s hard timeout — but neither delivers a bad book. Mitigations
(see contract §3/§5): add an integration case that feeds a deliberately **corrupt**
template (distinct from missing) and asserts a failed job; confirm `--headless`
makes the load raise a trappable runtime error rather than block on an interactive
dialog.

### Non-Latin mother tongues vs. an English-derived template (MEDIUM)

Verified directly against the reference master's `styles.xml` (extracted 2026-07-11):
every `M.T.*` **paragraph** style that sets `style:font-name` points to a Latin
font (`Andika4`/`Andika`/`Andika1`/`Andika New Basic`); the base style
`M.T. Text` additionally carries `fo:language="en"`. None of the `M.T.*`
**paragraph** styles set `style:font-name-complex` or `style:language-complex` —
so there is no explicit CTL override to lose, only the implicit western default
carried on `M.T. Text`. (The one `M.T.*` style that _does_ carry an explicit CTL
font — `M.T. Text highlight`, `style:font-name-complex="Times New Roman2"`,
`style:language-complex="hi"`/`"IN"` — is style-**family="text"**, i.e. a
character style, out of scope for the run/character formatting propagated by
this feature's paragraph-only concern; it is unaffected by which mother tongue
is assembled since `LoadTextStyles=True` overwrites it identically for every
job regardless of the source document's language.) Since the single global
template's paragraph styles are overwritten by name onto books of **any**
mother tongue (per-language/RTL variants are explicitly out of scope),
overwriting **replaces** whatever CTL/CJK font settings a non-Latin
mother-tongue master's own `M.T.*` paragraph styles may have carried with the
stand-in's implicit Latin default — a regression invisible to the English
series-2 test masters, which already match the stand-in's language. Mitigation:
treat non-Latin fidelity as an accepted risk tied to the deferred
per-language-variant scope (no code change delivers this feature can safely
avoid it — the overwrite-by-name semantic is inherent to `OverwriteStyles=True`);
document it explicitly for the operator when the real template is dropped in,
and flag it as a follow-up spec question for a future per-language-variant
template feature.

### Live asset swap atomicity (LOW)

FR-005/US3 make the real template a drop-in: a maintainer replaces
`assets/quarter-styles-template.odt` on a running server with no restart, and
per-job validation (research R4) deliberately re-reads the asset each job so the
swap takes effect without a bounce. That creates a swap-during-read window on a
**concurrent** job: a non-atomic copy (`cp` over the file) can leave the asset
truncated exactly when another job's `validateTemplateAsset` runs or `soffice`
opens it. This fails **safe** — a truncated read is just a corrupt template, which
the corrupt-template path (contract §5: `soffice` → trappable load error →
`TemplateFail` → no output → `failed` job) already routes to a failed job, never a
bad book. The blast radius is at most one spurious job failure during a rare
one-time maintainer swap. Mitigation is operational, not code: document that the
swap MUST be atomic (write a temp file in the same directory, then `mv`/rename
into place) so no job ever observes a partial file. No interface or data-shape
impact — plan-only; contracts and data-model unchanged.

## Performance Considerations

### Style-source document size (LOW)

`loadStylesFromURL` ignores the source document's body, but `soffice` must still
open, unzip, and parse the entire style-source **each job**. Shipping the raw
~4.4 MB reference master (research R3 "acceptable for correctness") costs ~1–2 s of
per-job parse against the ~40 s merge baseline — small, but avoidable. Prefer the
content-stripped, style-only variant (research R3 already permits it) so the per-job
load stays minimal and the committed asset stays lean.

## Complexity Tracking

> No Constitution Check violations — table intentionally omitted.
