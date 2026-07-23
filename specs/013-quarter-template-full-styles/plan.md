# Implementation Plan: Quarter Template Full Style-Family Application

**Branch**: `013-quarter-template-full-styles` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-quarter-template-full-styles/spec.md`

## Summary

Assembled-quarter downloads must apply the quarter styles template across **all**
style families (paragraph, character, page, frame, list/numbering) with
overwrite, mirroring the curriculum owner's manual "Load Styles from Template,
all families checked, Overwrite on" process. This **supersedes 009 FR-003**,
which deliberately loaded only paragraph/character styles to protect the 007
chapterized footers. The technical change is small and localized: in the existing
assembly macro (`src/server/assembly/macro/Module1.xba`), flip three
`loadStylesFromURL` flags — `LoadPageStyles`, `LoadFrameStyles`,
`LoadNumberingStyles` — from `False` to `True`, rewrite the now-stale explanatory
comment, and regenerate the embedded macro constant (`module1Xba.ts`). No Node
signatures, options, or new files change.

The risk this feature carries is entirely at the LibreOffice round-trip: does
overwriting page styles remove the first-page CC footer (FR-002) while keeping
the per-lesson content footers, pagination, and TOC numbering intact (FR-004/
FR-005)? **Static inspection of the shipped assets answers the decisive
questions now** (research R2–R4): the template's `First Page` master is
footer-less while the constituent's carries the CC footer (FR-002 by
construction), and the template's `Lesson Content` master footer carries live
`text:chapter`/`text:user-defined`/`text:page-number` fields (so per-lesson
footers survive the overwrite — the exact fear that made 009 skip page styles).
The remaining round-trip claims are pinned by the golden-reference
`assembleQuarter.integration.test.ts`, extended with FR-002/FR-003 assertions for
both modes. Failure handling (FR-006) is inherited unchanged from 009.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-23-quarter-template-full-style-application-requirements.md](../brainstorms/2026-07-23-quarter-template-full-style-application-requirements.md)

### Key Decisions Carried Forward

- **Load all families with overwrite (reverse 009 FR-003).** Chris's manual
  LibreOffice process is the product-truth reference; the 009 restriction
  protected 007 footers but blocked the correct first-page/frame/page behavior.
  → The single macro flag flip (FR-001).
- **Drop the asset-refresh idea.** The 2026-07-23 attribute-level diff proved
  both committed assets already match Chris's latest masters for the styles in
  question. → Asset regeneration is an explicit non-goal (Scope Boundaries).
- **Chapterized-footer survival becomes a verification requirement, not a reason
  to hold back.** → Re-verified by static inspection (R4a) + the integration
  test (FR-004 axis).

### Deferred Questions (resolved during planning)

- **Does overwriting page styles break/duplicate the 007 chapterized footers?**
  → research R4a/R4b: **No** — the template's `Lesson Content` master footer
  carries the same live fields (static-confirmed); duplication is guarded by the
  re-verified "single clean master-page set" axis.
- **Which style family carries the lesson-opening spacing?** → research R3:
  **paragraph** styles, NOT frame/page (frame styles and page-layout margins are
  byte-identical between constituent and template). **Adjudicated 2026-07-23**:
  `LoadTextStyles`/`OverwriteStyles` (paragraph styles) are already `True` in
  current (pre-013) `Module1.xba` — the 5.1.2 flag flip only touches
  Page/Frame/Numbering, so FR-003 spacing is **flag-flip-invariant** and needs
  no 013 code change; it's a regression guard, confirmed empirically against a
  real round-trip (see `contracts/template-application.md` §4). **Still open
  (unaffected by this adjudication):** the monolingual template omits
  `M.T. Lesson Title`, so overwrite may not fully fix single-language spacing
  if a real lesson opening uses one of the 5 missing `M.T.`-prefixed styles —
  the mode the spec complains about most. Whether that residual, if it turns
  out to be real, is a monolingual template-asset deficiency (out of scope →
  **user decision**) or something else in scope is deferred to 5.2.2's
  discriminate-(a)-vs-(b) step at the round-trip (SC-002/SC-005). See Edge
  Cases.
- **Does `LoadNumberingStyles=True` disturb the outline/TOC numbering?** →
  research R4c: **No** — `finalizeAssembledQuarter` post-patches the outline
  start value in Node after soffice (finalize wins), and outline participation
  rides on heading paragraph styles already overwritten in 009.

## Applied Learnings

No `.specify/solutions/` entries are relevant to ODT/LibreOffice style-family
application (the catalogued solutions are Ralph/spec-kit tooling learnings). The
one operational learning that bears on this feature is in project MEMORY, not the
solutions store: `soffice` hangs inside the Bash sandbox — run the integration
suite with the sandbox disabled (captured in `quickstart.md`).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags),
Node 24 (nvm). The changed file itself is StarBasic (`Module1.xba`).
**Primary Dependencies**: existing 007/009 assembly pipeline
(`assembleQuarter` → `resolveTemplatePath`/`validateTemplateAsset` →
`sofficeAssemble` → `Module1.xba` macro → `finalizeAssembledQuarter`);
LibreOffice `soffice --headless` (existing prod dependency); `child_process`;
libxmljs2 (finalize only).
**Storage**: No new persistent storage, tables, columns, or migrations. The two
template assets are existing committed static files (`assets/`); not regenerated.
**Testing**: `*.integration.test.ts` (`yarn test:integration`, real `soffice`,
serialized, sandbox disabled) is the primary gate — it pins the round-trip
behavior (FR-002/FR-003/FR-004/FR-005) for both modes. No Node unit signatures
change, so unit suites are unaffected; `module1Xba.test.ts` guards macro drift.
**Target Platform**: Linux server (web deploy via Capistrano + Passenger).
Desktop and the isomorphic `core` are untouched.
**Project Type**: web — server-side only. No frontend or `core` changes.
**Performance Goals**: No new process or UNO call — same single
`loadStylesFromURL`, now with more families. Negligible vs. the ~40s merge.
**Constraints**: Must satisfy FR-002/FR-003 while preserving every FR-004/FR-005
guarantee (per-lesson footers, single clean page-style set, continuous
pagination + first-page suppression, correct outline/TOC numbering). Failure
handling unchanged (FR-006). Single-lesson downloads untouched (FR-007).
**Scale/Scope**: Change surface = the macro's `loadStylesFromURL` flag array +
its comment, the regenerated `module1Xba.ts`, and new integration-test
assertions (both modes). No asset, schema, or signature changes.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                     | Assessment                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Test-First Development** | PASS. The change is a StarBasic + ODT-round-trip behavior change → covered by the constitution's document-processing clause (`*.integration.test.ts` with real `soffice`), written RED-first (assert footer-less first page / spacing / preserved footers BEFORE the flag flip lands). No new imperative Node logic to unit-TDD. |
| **II. Type Safety**           | PASS. No TypeScript changes beyond the regenerated macro-string constant; strict typing untouched; no new `any`/lint surface.                                                                                                                                                                                                    |
| **III. Code Quality**         | PASS. The stale macro comment is rewritten to match new behavior (JSDoc-equivalent for the macro); naming/conventions unchanged.                                                                                                                                                                                                 |
| **IV. Pre-commit Gates**      | PASS. `yarn typecheck` + lint-staged + related jest unchanged; conventional commits. Integration suite run explicitly (must pass before merge; sandbox disabled).                                                                                                                                                                |
| **V. Warning/Deprecation**    | PASS. No new deprecations; zero-warning maintained.                                                                                                                                                                                                                                                                              |
| **VI. Layered Architecture**  | PASS. Confined to `src/server/assembly/`. No `core`/`frontend`/`desktop` change; isomorphic boundary and offline path untouched. Template is a static asset, not `Persistence` domain data. No tables/migrations.                                                                                                                |
| **VII. Simplicity**           | PASS. Three-flag flip + comment + regen. No new process, abstraction, file, or type. It even _removes_ special-casing (009's selective family exclusion) in favor of Chris's straightforward "load all" process. YAGNI/KISS honored.                                                                                             |

**Result**: PASS — no violations. Complexity Tracking table omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/013-quarter-template-full-styles/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R5 + cross-cutting)
├── data-model.md        # Phase 1 output (no persistent model changes)
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── template-application.md   # Phase 1 output (internal pipeline contract; supersedes 009 §3/§5)
└── tasks.md             # Phase 2 output (sp:05-tasks — NOT created here)
```

### Source Code (repository root)

```text
assets/
├── quarter-styles-template.odt              # bilingual template (existing, NOT regenerated)
└── quarter-styles-template-monolingual.odt  # monolingual template (existing, NOT regenerated)

src/server/assembly/
├── macro/
│   ├── Module1.xba          # EDIT — flip LoadPageStyles/LoadFrameStyles/LoadNumberingStyles to True; rewrite comment
│   ├── module1Xba.ts        # REGEN — embedded string (scripts/genMacroConstant.js)
│   └── module1Xba.test.ts   # drift guard (existing, unchanged)
├── sofficeAssemble.ts       # UNCHANGED (SPIKE_TEMPLATE_URL plumbing already in place)
└── quarterStylesTemplate.ts # UNCHANGED (mode-keyed asset resolution + validation)

src/server/actions/
├── assembleQuarter.ts                    # UNCHANGED (validation + threading already in place)
├── assembleQuarter.integration.test.ts   # EDIT — add FR-002/FR-003 axes; re-verify FR-004/FR-005 (both modes)
└── finalizeAssembledQuarter.ts           # UNCHANGED (outline/metadata post-patch still wins; confirm regex still matches)

scripts/
└── genMacroConstant.js       # existing — regenerates module1Xba.ts from .xba
```

**Structure Decision**: Server-side-only, single-file behavior change inside the
existing 007/009 assembly pipeline. The whole feature is a macro flag flip plus
its regenerated embedding plus integration-test coverage. No `core`/`frontend`/
`desktop` files change; no new modules or assets.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec will
> have a corresponding acceptance spec file created during `sp:05-tasks`. These
> live in `specs/acceptance-specs/` and follow the GWT format consumed by the
> acceptance pipeline.

| User Story                                          | Acceptance Spec File                                                | Scenarios |
| --------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| US1: Lesson first pages lose the stand-alone footer | `specs/acceptance-specs/US01-first-page-footer-removed.txt`         | 2         |
| US2: Layout and spacing match the quarter master    | `specs/acceptance-specs/US02-lesson-opening-spacing.txt`            | 2         |
| US3: Content-page footers and numbering survive     | `specs/acceptance-specs/US03-content-footers-numbering-survive.txt` | 2         |
| US4: Stand-alone lesson downloads unchanged         | `specs/acceptance-specs/US04-standalone-lesson-unchanged.txt`       | 1         |

**Both-mode note**: US1–US3 each assert against **both** the bilingual and
single-language assembled outputs (the two template assets carry different
master-page/style sets — spec Edge Cases). The integration suite already has a
monolingual describe-block seam.

**FR-003 open risk (from research R3 — escalate to user & red-team; do NOT
pre-adjudicate as out-of-scope)**: the lesson-opening spacing lives in
**paragraph** styles (frame styles and page margins are byte-identical). The
monolingual template does **not** define `M.T. Lesson Title`, so `OverwriteStyles`
may not fix a constituent's tighter version in single-language mode — the mode
the spec complains about most. The US2 acceptance is **outcome-based** (matches
the master, SC-002/SC-005). If single-language spacing is still wrong after the
flip, it is either **(a)** a monolingual template-asset deficiency — meaning the
"assets are current, no refresh" premise (established for 009's footer/highlight
styles, not 013's spacing styles) was wrong for this feature, and single-language
FR-003 is blocked on an out-of-scope asset fix that is a **user decision** — or
**(b)** the flag flip being genuinely insufficient (in scope, not done). A
still-tight single-language opening MUST NOT be silently accepted as "expected
gap"; discriminating (a) vs (b) requires confirming what Chris's manual "load
all + overwrite" produces on the current monolingual asset.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Edge Cases & Error Handling

_Adversarial review happens in sp:04-red-team; the design-impacting items already
surfaced by static inspection are recorded here and in
`contracts/template-application.md`._

### Overwrite reaches only same-named styles — monolingual style-set gap (OPEN RISK, from research R3)

`OverwriteStyles=True` replaces a constituent style **only when the template also
defines that name**. A style-name diff of both committed assets (`unzip` +
`style:name` extraction from `styles.xml`/`content.xml`, run 2026-07-23) confirms
the monolingual template omits exactly five `M.T.`-prefixed paragraph styles that
the bilingual template defines: `M.T. Lesson Title`,
`M.T. Lesson title - invisible`, `M.T. Coloring Page - Memory Verse`,
`M.T. Coloring Page - Truth`, and `M.T. Example text`. (Every other `M.T.`-
prefixed style — `M.T. Application`, `M.T. Bible Story`, `M.T. Text - *`, front-
matter, etc. — is present in **both** assets; the gap is scoped to lesson-opening
and coloring-page styles specifically, not `M.T.` styles generally.) A
constituent's tighter definition of any of these five would survive
`OverwriteStyles` in single-language mode. Flipping the flags is **necessary but
not yet proven sufficient** for FR-003 single-language spacing — the mode the
spec complains about most. This is an **open risk to escalate**, not a settled
out-of-scope call, for two reasons: (1) the five-name diff is static evidence,
but whether a real single-language lesson opening actually applies one of these
five styles (vs. the mode-neutral `Lesson Title` style, present in both assets)
is only confirmed by the round-trip test/rendered output; (2) the "assets are
current, no refresh" premise was established for 009's footer/highlight styles,
not 013's spacing styles — this five-style gap is direct evidence it may not
hold here. Resolution: verify FR-003 against the monolingual master
(SC-002/SC-005). If still tight, discriminate **(a)** a monolingual asset
deficiency (out of scope → **user/curriculum-owner decision**, since it reopens
the "no refresh" premise) from **(b)** an insufficient flag flip (in scope, not
done) by checking what Chris's manual "load all + overwrite" produces on the
current monolingual asset. Do NOT wave a still-tight single-language opening
through as "expected gap."

### Imported page/frame/numbering styles must not duplicate the clean page set (FR-004)

Importing page styles can add the template's own masters alongside the merged
book's. Same-named masters overwrite in place; template-only masters add under
unique names. The re-verified "single clean master-page set" axis (every display
name once, no `NN` suffix, no orphan page sets) is the guard — this is the exact
failure 009 avoided and FR-004 now requires solving.

### First-page suppression now depends on the template's `First Page` master

Today each constituent is force-broken onto a fresh page and its own `First Page`
master (with CC footer) governs the title page. After overwrite, the template's
footer-less `First Page` master governs it. The "each lesson's first page
suppresses its page number" axis must still hold with the template's master
driving suppression (re-verify).

### Template content footer is now authoritative AND field-driven — stale cached values must not survive (FR-004, from red-team static inspection)

Direct inspection of both committed assets' `Lesson_20_Content` master footer
(2026-07-23) shows the per-lesson content footer carries **no static book text** —
every non-literal part is a live field: `text:user-defined[Quarter]`,
`text:title` (book title), `text:chapter text:display="number"` (absolute lesson
number), `text:chapter text:display="name"` (lesson name, e.g. "Review Lesson"),
and `text:page-number`. Under 009 (page styles off) these fields lived in the
constituent's own page style; under 013 the **template's** master footer wins, so
these fields now resolve against the **merged book's** metadata/outline, which
`finalizeAssembledQuarter` patches: it upserts `//meta:user-defined[@meta:name='Quarter']`
(what `text:user-defined[Quarter]` reads), `dc:title` (what `text:title` reads),
and the level-1 outline `start-value` (the `text:chapter` number). The mechanism
is therefore sound — verified against `finalizeAssembledQuarter.patchBookMetadata`.

**The risk this introduces**: each committed asset ships with **stale cached
field values baked in** — mono footer caches "Quarter 4 / Lesson 51-52", bilingual
caches "Quarter 2 / Lesson 26". LibreOffice displays the cached value if a field
does not re-resolve. So if finalize's metadata patch is ever skipped, fails for a
mode, or does not cover a field the template footer references, every content
page would **silently** show the template asset's stale quarter/lesson instead of
the real one. The current FR-004 assertion only checks `text:chapter` (lesson
number) and would pass while shipping a wrong `Quarter`/title. **Resolution
(in-scope, no asset change)**: the FR-004 content-footer axis MUST additionally
assert, for **both** modes, that the assembled content footer resolves
`text:user-defined[Quarter]` to the real assembled quarter (not the asset-cached
4/2), that `text:title` renders the real book title (non-blank), and that
`text:chapter text:display="name"` resolves the per-lesson name — not merely the
lesson number. (This also retires the brainstorm's "monolingual master reads
Lessons from the Old Testament" worry as a **verification** concern rather than a
comms-only item: 013 makes the book-title field authoritative, and it resolves
from `dc:title`, which finalize sets from the first constituent's meta — so the
asserted title, not the asset's cache, is what must be checked.)

### List/numbering styles reach body-content lists, not only the outline (FR-005, red-team, deepen-plan pass)

`LoadNumberingStyles=True` overwrites same-named list styles wherever they are
used — including ordinary bulleted/numbered lists inside lesson body content, not
just the outline that drives the TOC. Template-wins is the intended behavior; the
open question was whether a same-named body-list style's template definition
differs from the constituent's in a way that would visibly change rendering.

**Resolved by direct comparison (2026-07-23)**: a real lesson constituent
(`test/docs/serverDocs/Luke-1-01v03.odt`) references list styles `WWNum1`–`WWNum20`,
`Bullet - checkmark`, `Bullet - Diamond`, and `Table Bullet - checkmark` from its
body-content paragraph styles (`Body`, `M.T. Text`, `Table Contents`, etc. via
`style:list-style-name`) — confirming these are body-list styles, not outline-only.
Byte-comparing every one of those 23 list-style definitions against the bilingual
template's `styles.xml` (`quarter-styles-template.odt`) shows:

- `Bullet - checkmark`, `Bullet - Diamond`, `Table Bullet - checkmark`: **byte-identical**.
- All 20 `WWNumN` styles: differ only in attributes that do not change rendering —
  either an added `text:style-name`/`loext:num-list-format` pair (a redundant
  paragraph-style link and a format-string mirror of the existing
  `style:num-suffix`/`style:num-format`, both non-visual), or the same bullet
  font expressed two equivalent ways (`style:font-name="Symbol"` vs.
  `fo:font-family="Symbol" style:font-charset="x-symbol"` — same font, same
  glyph). No bullet character, numbering format, suffix/prefix, or indent differs
  across any of the 23 styles.

This retires the earlier open hedge about body-list rendering: for the sampled
lesson and the full 20-style `WWNumN` family, the template overwrite is a no-op
on visual rendering (the same finding is expected to hold for the monolingual
template, which carries the identical 33-name list-style set per the FR-003
static diff above). The integration axis (`assembleQuarter.integration.test.ts`)
MUST still assert that a body-content bulleted/numbered list renders with the
expected bullet/numbering, per FR-005, as a regression guard against a future
asset edit reintroducing a real divergence — not because this research found a
discrepancy, but because the outline/TOC axis alone does not cover body lists.

### Corrupt / missing template (unchanged, FR-006)

Inherited verbatim from 009: `validateTemplateAsset` fast-fails a missing/empty
asset with a curated reason; the macro's pre-load hidden-doc open + `On Error
Goto TemplateFail` trap fails a corrupt template loudly with no output delivered.
No change — the flag flip does not touch the error path.

## Complexity Tracking

> No Constitution Check violations — table intentionally omitted.
