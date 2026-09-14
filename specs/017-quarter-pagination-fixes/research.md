# Phase 0 Research: Quarter Pagination and Coloring-Page Style Fixes

**Feature**: `017-quarter-pagination-fixes` | **Date**: 2026-08-11 |
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Six research items. R1–R4 are the spec's own "Deferred to planning" questions; R5 and R6
were surfaced during planning (asset asymmetry, budget). Every claim below is tagged
**[static-confirmed]** (verified against the committed assets/fixtures during planning),
**[code-confirmed]** (verified by reading the shipped pipeline), or **[open — spike]**
(must be settled empirically before the corresponding implementation task closes).

---

## R1. Where the numbering fix belongs: template assets, finalize step, or both?

**Decision: both, split by kind of change.**

- **The offsets are asset-only.** `text:page-adjust` lives on the footer page-number field
  of the `Front_20_matter` master inside the two committed template assets, at `-1`
  (bilingual) and `-2` (monolingual). **[static-confirmed]** Nothing in the TypeScript
  pipeline writes or reads it. Removing it is an asset edit (FR-004).
- **The sequence restarts are finalize-only.** ODF expresses "restart numbering here" as
  `style:page-number="<n>"` on the _paragraph properties of the paragraph that opens the
  page_, paired with a `style:master-page-name`. That attribute belongs to the assembled
  book's `content.xml`, which does not exist until after the merge, so it cannot be
  expressed in a styles template at all. `finalizeAssembledQuarter` already patches exactly
  this shape — `normalizeLessonOpeningMasterPages` pins lesson-opening headings to
  `First_20_Page` — so the restart rides the same pass. **[code-confirmed]**

**Supporting facts** (all **[static-confirmed]** against `assets/*.odt` `styles.xml`):

| Master page               | Layout  | `style:num-format` | Footer | Page-number field                       |
| ------------------------- | ------- | ------------------ | ------ | --------------------------------------- |
| `Front_20_matter`         | `Mpm12` | `i` (roman)        | yes    | yes, **with the offset**                |
| `Table_20_of_20_Contents` | `Mpm16` | `i` (roman)        | yes    | yes, no offset (bilingual only)         |
| `Lesson_20_Content`       | `Mpm11` | `1` (arabic)       | yes    | yes, no offset                          |
| `First_20_Page`           | `Mpm2`  | `1` (arabic)       | **no** | n/a (suppression is by footer-lessness) |
| `Coloring_20_Page`        | `Mpm10` | `1` (arabic)       | yes    | **no** page-number field                |
| `Standard`                | `Mpm1`  | `1` (arabic)       | no     | n/a                                     |

Two consequences worth pinning:

1. **Roman front matter (FR-001) already holds by construction** — the front-matter masters
   are roman today. The defect is the offset, not the format.
2. **First-page suppression (FR-007, FR-002) is structural, not a field property** — a
   lesson's first page uses the footer-less `First_20_Page` master, so it prints nothing
   while still consuming its number. The same mechanism serves the blank filler page (R3).

**Alternatives considered.** Putting the restart in the assets via a page-style
`style:first-page-number`-style attribute: rejected — ODF has no such per-master attribute;
the restart is a property of a paragraph, not of a page style. Keeping the offsets and
tuning their values: rejected by FR-004 and by SC-005 (the client inspects the field).

---

## R2. Coloring-page memory verse: is it automatic-style name collision?

**Status: hypothesis strongly corroborated statically; the causal mechanism is [open — spike].**

**What planning established [static-confirmed]** by inspecting the five committed lesson
fixtures (`test/docs/serverDocs/Luke-1-0{1..5}v03.odt`, `content.xml`):

- Every coloring page carries **two** memory-verse paragraphs, and they are **asymmetric**:
  the first names the memory-verse style **directly** (`text:style-name="Coloring_20_Page_20_-_20_Memory_20_Verse"`),
  the second uses an **automatic style** (`P3`/`P4`/`P5`/`P7`/`P34`, …) whose
  `style:parent-style-name` is the memory-verse style. This asymmetry alone explains why
  exactly one of the two copies loses its formatting — only one of them depends on an
  automatic-style name surviving the merge.
- Those automatic style names **collide across constituents with incompatible meanings**.
  Observed in the fixture set:

  | Auto style | Means "memory verse" in | Means "graphic anchor" in |
  | ---------- | ----------------------- | ------------------------- |
  | `P3`       | Luke-1-02               | Luke-1-05                 |
  | `P4`       | Luke-1-02, Luke-1-05    | —                         |
  | `P5`       | Luke-1-04               | Luke-1-05                 |
  | `P7`       | Luke-1-03               | Luke-1-01                 |

  A merge that dedupes automatic styles by name, first-definition-wins, therefore has real
  collisions available to it, of exactly the shape the client reported (a verse paragraph
  rendering as the inline-graphic paragraph: bold, italic, centred).

**What is NOT established.** Whether `insertDocumentFromURL` actually dedupes automatic
styles by name or renames them on insert. Planning deliberately does **not** assert the
mechanism from memory of LibreOffice behaviour. **[open — spike]**

**Discriminating check (cheap, headless, no human sitting).** Merge two fixture lessons
whose automatic style names collide with opposite meanings — insert `Luke-1-05v03.odt`
first (its `P5` anchors a graphic) then `Luke-1-04v03.odt` (its `P5` is the second memory
verse) — and inspect the merged `content.xml`:

- If `P5` appears once with the graphic definition and lesson 04's verse paragraph still
  references it → **collision confirmed**, and the whole defect is reproducible in a
  ~2-constituent, ~20 s headless merge with no PDF and no human.
- If the insert renamed lesson 04's automatic styles → the hypothesis is dead and the spike
  must widen (next candidates: the template `loadStylesFromURL` overwrite pass introduced by
  013, and — monolingual only — `restyleMonolingualParagraphs`, which rewrites
  `style:parent-style-name` on automatic styles).

Planning attempted this run and could not complete it: headless `soffice` does not run to
completion inside the planning agent's sandbox (LibreOffice on macOS is effectively
single-instance and the run wedged past a 5-minute budget). The check is scripted-ready and
carries **no** dependency on the human PDF round trip — it is the **first** task of the
spike and must run in a normal shell.

**Fix direction, conditional on confirmation.** Make the second copy not depend on a
merge-fragile automatic style name. Two candidates, to be decided by the spike's evidence:

- **(a) Pre-merge, per constituent** in `prepareConstituentForAssembly`: rename each
  constituent's automatic styles into a per-constituent namespace (e.g. `P5` → `P5_07`), or
  flatten verse paragraphs onto the named parent style where the automatic style adds
  nothing. Fixes the whole class, not just memory verses.
- **(b) Post-merge, in finalize**: repoint memory-verse paragraphs whose automatic style no
  longer parents to a memory-verse style. Narrow, targeted, and blind to the same class of
  bug elsewhere in the book.

(a) is preferred on Principle VII grounds _if_ the spike shows the collision is general; (b)
is the fallback if renaming destabilises the 007 footer/master-page machinery, which also
rides automatic styles. **[open — spike]**

FR-012 (both style-naming families) and FR-013 (indirect parent reference) are both already
exercised by this shape: the fixtures show the `M.T.`-prefixed and plain families both in
use, and the second copy is _always_ the indirect one. **[static-confirmed]**

FR-014 is a "do not regress" constraint: neither fix direction may delete a paragraph.

---

## R3. Where does the rendered-page-count measurement (FR-010) fit?

**Decision: a dedicated render-and-measure pass between finalize and the move to
`docStorage`, using the assembled document itself, followed by a conditional re-finalize.**

The ordering constraint is unavoidable: inserting the filler page _changes the document_, so
parity must be measured on a document that does not yet contain it. The flow becomes:

1. `sofficeAssemble` → `assembled.odt` (unchanged).
2. `finalizeAssembledQuarter` — patches metadata, outline numbering, master pages, and now
   the sequence restarts (R1), **without** a filler page.
3. **New: `measureLessonOneParity`** — render `assembled.odt` to PDF headlessly
   (`soffice --convert-to pdf`, same binary and profile discipline as `sofficeAssemble`),
   extract per-page text, and locate lesson 1's first physical page.
4. If that index is **even** (verso), re-run the filler-insertion patch and re-finalize; if
   **odd**, do nothing. FR-001 of the "no unnecessary work" kind: the common case costs one
   render, the uncommon case costs one render plus one cheap XML pass.

**How lesson 1's first page is located.** The book's live per-lesson footers already print a
unique `Quarter <S> Lesson <N>` marker on every numbered page of a lesson, and the
integration test already locates lesson pages this way (`footerMarkerFor`,
`assembleQuarter.integration.test.ts`). **[code-confirmed]** Lesson 1's first page is the
page immediately _before_ the first page carrying lesson 1's marker (its own title page is
footer-less). This reads the _rendered_ document, which is exactly what FR-010 demands, and
it is immune to the phantom page: a counted-but-unrendered page does not appear in the PDF
at all, so PDF page indices _are_ physical sheet positions.

**Alternative considered and rejected**: rendering the front-matter constituent alone and
counting its pages. Cheaper, but it measures a different document than the one being
delivered — precisely the trust error FR-010 was written to forbid (Clarifications,
2026-08-11: "the rendered document" is the authority).

**Open**: whether `pdftotext` is available on the deployed box, or whether the measurement
should use `pdfinfo`/a page-count-only path plus a marker search. The integration test
already requires `soffice`, `pdftotext` and `pdfinfo` locally; production currently requires
only `soffice`. If `pdftotext` cannot be assumed in production, the measurement must either
ship with it as a documented dependency or fall back to a UNO-side page-index query inside
the assembly macro. **[open — spike]** — decide before the FR-010 task closes.

**Filler page shape.** An empty paragraph inserted immediately before lesson 1's opening
heading, whose automatic style pins `style:master-page-name` to a **footer-less** master so
it prints no number while still consuming one (FR-009). `First_20_Page` and `Standard` are
both footer-less in both assets. **[static-confirmed]** `First_20_Page` is preferred: same
page geometry as the body, and it is already the master the next paragraph (lesson 1's
heading) pins to, so no geometry change is introduced mid-book. Whether two consecutive
`First_20_Page` pages with an explicit `style:page-number="1"` restart on the second behave
as intended is a round-trip question. **[open — spike]**

---

## R4. Is the headless render equivalent to interactive PDF export?

**Status: [open — spike], and it is the highest-leverage question in the feature.**

If they agree, every verification round after the first runs headless in the integration
suite with no human sitting, and SC-001..SC-007 become automated assertions. If they
disagree, the client-visible truth is the interactive export and the automated assertions
are only a proxy.

**How the spike settles it**: the same assembled `.odt` is exported both ways —
`soffice --headless --convert-to pdf` and File → Export as PDF in the GUI — and the two
PDFs are compared on page count and on the per-page printed footer tokens. Identical
sequences ⇒ equivalent for this feature's purposes. This costs the human one extra export
in a sitting they are already having.

Note the pipeline already relies on headless render agreeing with reality elsewhere
(`webifyLesson`, and the 011 reference-splitter integration test's PDF round trip), so the
prior is favourable but untested for pagination specifically. **[code-confirmed]** that the
reliance exists; **[open]** that it extends to page numbering.

---

## R5. Asset asymmetry between the two modes

**[static-confirmed]**, and it changes the shape of the FR-015 work.

The two committed templates are **not** structurally parallel:

|                                    | bilingual `quarter-styles-template.odt` | monolingual `-monolingual.odt` |
| ---------------------------------- | --------------------------------------- | ------------------------------ |
| Master pages                       | 18                                      | 16                             |
| `Table_20_of_20_Contents`          | present (roman, footer + page number)   | **absent**                     |
| `Front_20_cover` / `Back_20_cover` | present                                 | absent                         |
| `Front_20_matter` offset           | `-1`                                    | `-2`                           |

The differing offsets are themselves evidence that the two modes paginate differently at the
front-matter boundary, so **every numbering claim must be verified separately per mode** —
FR-015 is not a formality here. In particular, which master the monolingual TOC constituent
lands on (and therefore whether its pages are roman) is not answerable statically, because
the master is chosen by the constituent's own content after the template overwrite.
**[open — spike]** — the spike batch must include a monolingual variant, which the spec
already requires.

---

## R6. Absolute page-number assertions and the time budget

**Test gap [code-confirmed].** `assembleQuarter.integration.test.ts` asserts only that
_adjacent numbered pages increment by one_ and that lesson first pages suppress their
number. Both assertions pass under a uniformly-shifted sequence, which is exactly the
delivered defect. FR-016 closes this: assert **absolute** values at known positions —
physical page 2 prints `ii`; the page after lesson 1's first page prints `2`; the last page
prints its position in the body sequence; and no `text:page-adjust` survives anywhere in the
assembled book. The existing `pageNumberFooterOn` helper already extracts the token; the new
assertions are additions to the same file, in both modes.

**Budget [code-confirmed].** `ASSEMBLY_TIMEOUT_MS = DEFAULT_TIMEOUT_MS (180 s) +
ASSEMBLY_NON_SOFFICE_BUDGET_MS (120 s)`, with a structural invariant (asserted in
`assemblyBudget.test.ts`) that the registry timeout may fire only _after_ every `soffice`
has self-killed. The R3 render pass is a **second** `soffice` invocation, so it needs its
own self-kill budget added into that sum — a new `ASSEMBLY_RENDER_TIMEOUT_MS` folded into
`ASSEMBLY_TIMEOUT_MS`, keeping the invariant structural rather than numeric. The render is
sequential within the job, so the concurrency-1 "never two soffice processes" guarantee is
preserved. Measured cost to fill in during implementation; a ~100-page book on the 2 vCPU
deploy box is the sizing case.

---

## Consolidated decisions

| #   | Decision                                                                                                          | Rationale                                                                                   | Alternatives rejected                                |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| D1  | Delete `text:page-adjust` from both template assets                                                               | FR-004/SC-005; offsets are asset-only                                                       | Re-tuning offset values                              |
| D2  | Express both sequence restarts in `finalizeAssembledQuarter` via `style:page-number` on opening paragraphs        | Only expressible in the merged `content.xml`; finalize already patches this shape           | Encoding restarts in the assets (not expressible)    |
| D3  | Suppression and the filler page ride the footer-less `First_20_Page` master                                       | Already how lesson first pages suppress; no new mechanism                                   | A "no number" field variant per page                 |
| D4  | Measure recto parity by rendering the finalized book to PDF and locating lesson 1 via its live footer marker      | FR-010 "the rendered document"; PDF indices are physical sheets, immune to the phantom page | Counting the front-matter constituent alone          |
| D5  | Add a dedicated render timeout into `ASSEMBLY_TIMEOUT_MS`                                                         | Preserves the structural soffice-self-kills-first invariant                                 | Widening the existing merge timeout                  |
| D6  | Settle the automatic-style collision headlessly with a 2-constituent merge before designing the coloring-page fix | Cheapest possible discriminator; no human round trip                                        | Designing (a) or (b) on the hypothesis alone         |
| D7  | Verify every numbering claim per mode                                                                             | R5 asset asymmetry; the modes already carry different offsets                               | Verifying bilingual and assuming monolingual follows |

## Still open at the end of Phase 0

All are **[open — spike]** and are carried into the plan's spike task, not into
implementation-by-assumption:

1. Does `insertDocumentFromURL` collide or rename automatic styles? (R2 — headless, first)
2. Does headless PDF export agree with interactive export on page numbering? (R4)
3. Is `pdftotext` available in production, or must the page-index query move into UNO? (R3)
4. Do two consecutive `First_20_Page` pages with an explicit restart behave as intended? (R3)
5. Which master does the monolingual TOC land on after the template overwrite? (R5)
