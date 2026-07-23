# Research: Quarter Template Full Style-Family Application (013)

Resolves the three "Deferred to Planning" questions carried from the brainstorm
(`specs/brainstorms/2026-07-23-quarter-template-full-style-application-requirements.md`)
and the spec's Assumptions section. Each entry uses Decision / Rationale /
Alternatives considered. Where the spec asked planning to _verify_ a claim, the
verification was done **statically** by unzipping and inspecting the two shipped
template assets and a representative constituent lesson (`no soffice required`):

- `assets/quarter-styles-template.odt` (bilingual)
- `assets/quarter-styles-template-monolingual.odt` (single-language)
- `test/docs/serverDocs/Luke-2-14v01.odt` (a constituent lesson, the integration
  fixture)

The **static / round-trip line** is drawn explicitly in each section: what the
asset bytes prove now vs. what only a real LibreOffice merge can confirm (pinned
by the golden-reference `assembleQuarter.integration.test.ts`, RED-first).

---

## R1. The change: flip three load flags to `True` (reverses 009 FR-003)

**Decision**: Change the existing `loadStylesFromURL` call in the assembly macro
(`src/server/assembly/macro/Module1.xba` → `Assemble`) to load **all** style
families with overwrite:

| Property              | 009 value | 013 value  | Family                        |
| --------------------- | --------- | ---------- | ----------------------------- |
| `OverwriteStyles`     | `True`    | `True`     | (unchanged — template wins)   |
| `LoadTextStyles`      | `True`    | `True`     | paragraph + character         |
| `LoadPageStyles`      | `False`   | **`True`** | page / master pages / footers |
| `LoadFrameStyles`     | `False`   | **`True`** | frame / graphic anchors       |
| `LoadNumberingStyles` | `False`   | **`True`** | list / numbering              |

Then regenerate the embedded macro constant
(`src/server/assembly/macro/module1Xba.ts`) via `scripts/genMacroConstant.js`
(drift-guarded by `module1Xba.test.ts`) and update the now-stale explanatory
comment (it currently claims page/frame/numbering are left off to protect
footers). No new process, no new UNO call, no signature change — this is a
flag flip plus a comment rewrite plus a regen.

**Rationale**: This mirrors the curriculum owner's manual reference process in
LibreOffice — "Format → Styles → Load Styles from Template, all families
checked, Overwrite on" — which is the product-truth reference (SC-005). 009
deliberately did _less_ than that to protect the 007 chapterized footers; this
feature converts that protection from a restriction into a verification
obligation (FR-004/FR-008).

**Alternatives considered**:

- _Post-merge libxmljs2 page-style surgery in `finalizeAssembledQuarter`_:
  rejected for the same reason 009 rejected it (research R1) — it re-derives in
  imperative XML what LibreOffice's own importer does correctly, and makes the
  template file decorative. The template file _is_ the mechanism.
- _Only flip `LoadPageStyles`/`LoadFrameStyles`, leave `LoadNumberingStyles`
  off_: rejected — the manual reference process checks all families, and R4
  below shows `LoadNumberingStyles=True` is safe. Matching Chris's process
  exactly is the lowest-surprise path and keeps the mechanism a faithful
  automation of his workflow.

---

## R2. FR-002 — lesson first pages lose the CC footer (STATIC: confirmed)

**Decision / Finding (static)**: Overwriting page styles delivers FR-002 **by
construction**. Inspection of the `<style:master-page>` set proves:

| Source               | `First Page` master footer                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| Constituent lesson   | **has** a `<style:footer>` with CC text (`"…This work is licensed under the…"`) |
| Bilingual template   | **no** header/footer children on `First Page`                                   |
| Monolingual template | **no** header/footer children on `First Page`                                   |

Both templates and the constituent all name the master `"First Page"`, so
`OverwriteStyles=True` + `LoadPageStyles=True` replaces the merged book's
footer-bearing `First Page` master with the template's **footer-less** one. The
CC block text lives in the TOC constituent's body content (not a page style), so
it is untouched — satisfying FR-002 ("CC only in the TOC section").

**Static vs round-trip**: The overwrite-produces-a-footer-less-First-Page claim
is proven statically. That the _rendered_ first page of every lesson then shows
no footer (and CC text appears **only** in the TOC section) is the round-trip
assertion — pinned by a new integration axis (SC-001).

---

## R3. FR-003 — lesson-opening spacing matches the master (STATIC diff — carrier identified, with a caveat)

**Finding (static)**: The spec's Assumption guessed the spacing lived in a
**frame** style or **page layout**. The asset diff shows that is **not** where
the residual single-language difference lives:

- **Frame/graphic styles identical.** `Lesson_Number`, `Number_Graphic`,
  `Badge_Graphic` (the lesson-number graphic frames) are byte-identical between
  the constituent and both templates (same `y`, `vertical-pos`,
  `vertical-rel="page-content"`, `wrap`, margins). `LoadFrameStyles` changes
  nothing for these.
- **Page-layout margins identical.** The `First Page` (`Mpm2`) and
  `Lesson Content` (`Mpm11`) page layouts have identical
  top/bottom/left/right/gutter margins across constituent and both templates.
  `LoadPageStyles` does not move the number graphic via page margins.
- **Paragraph spacing DOES differ, and the monolingual template has a style-set
  gap.** The lesson-opening title paragraph styles carry the spacing:
  - `M.T. Lesson Title` — margin-top **0.4cm** in the bilingual template vs
    **0.3cm** in the constituent (tighter). The **monolingual** template does
    **not define `M.T. Lesson Title` at all**.
  - `Lesson Title` — margin-top **0.9cm** in the templates; the constituent's
    definition does not carry that top margin.

**Decision**: FR-003 is treated as **outcome-based** (as the spec states) and
delivered by the same "load all families + overwrite" step. Paragraph styles are
already loaded since 009 (`LoadTextStyles=True`), so the _bilingual_ spacing
should already be correct or become correct once the full family set is applied.

**OPEN RISK — single-language FR-003 (design-impacting; escalate to user &
red-team, do NOT pre-adjudicate as out-of-scope):**
`OverwriteStyles` only replaces styles the **source template also defines**. The
monolingual template omits `M.T. Lesson Title`, so a constituent's tighter
`M.T. Lesson Title` (0.3cm) would **survive** in single-language mode. This makes
flipping the family flags **necessary but possibly not sufficient** for FR-003 in
single-language mode — which is the mode the spec complains about most. Two
evidence gaps keep this an **open risk**, not a settled scope call:

1. **Carrier is a hypothesis, not a proven fact.** The `M.T. Lesson Title`
   attribute diff identifies a _candidate_ carrier; confirming the rendered
   opening actually applies that style needs `content.xml` inspection or the
   round-trip. "It's an omitted paragraph style" is provisional in both
   directions.
2. **The "assets are current, no refresh needed" premise was established for
   009's styles, not 013's.** The 2026-07-23 diff proved the assets match "for
   the styles in question" — and 009's question was **footers/highlights**, not
   lesson-title spacing. The monolingual template missing `M.T. Lesson Title`
   (plus the known monolingual defect: OT footer text, per the brainstorm) is
   direct evidence the premise may **not** hold for the spacing styles _this_
   feature targets.

**Honest disjunction to resolve at the round-trip (SC-002/SC-005).** If
single-language spacing is still wrong after the flag flip, it is either:

- **(a) a monolingual template-asset deficiency** — in which case the "no
  refresh" premise was wrong for 013's styles, and single-language FR-003 is
  blocked on an out-of-scope asset fix (a **user/curriculum-owner decision**, not
  a silent "expected gap"); or
- **(b) the flag flip being genuinely insufficient** — in scope, feature not
  done.

Discriminating between (a) and (b) requires confirming what Chris's manual "load
all + overwrite" produces on the **current** monolingual asset. Until then, a
still-tight single-language opening MUST NOT be waved through as "expected,
out-of-scope" — that would be a false success on the mode the feature exists to
fix.

**Static vs round-trip**: The candidate carrier (paragraph styles, not
frame/page) and the monolingual style-set gap are proven statically. Whether the
rendered single-language opening matches the master, and which branch of the
disjunction applies, is the round-trip assertion (SC-002) plus Chris's visual
confirmation (SC-005).

---

## R4. FR-004/FR-005 — footers, pagination, and outline numbering survive (STATIC + finalize reasoning)

### (a) Per-lesson content-page footers (STATIC: confirmed viable)

**Finding (static)**: The template's `Lesson Content` master footer carries
**live fields**, not baked-in static text: `text:chapter`,
`text:user-defined[Quarter]`, and `text:page-number`. This is the **same field
shape** the constituent's own `Lesson Content` footer uses. So overwriting the
page style with the template's version preserves the per-lesson field-resolution
mechanism the 007 chapterized footers depend on (FR-004). The rendered text
snapshot in the asset (`"Quarter 2 Lesson 26 … Page 108"`) is just the
last-saved field cache; the fields re-resolve on the merged book.

This resolves the exact question 009 was afraid of (why it set
`LoadPageStyles=False`): the template's `Lesson Content` master was **built to
carry the per-lesson fields**, so importing it does not replace live fields with
frozen text.

**Static vs round-trip**: That the fields _exist_ in the template footer is
static-proven. That they _resolve to each lesson's own absolute number_ in the
merged output after overwrite is the round-trip guard (the discriminating
FR-004 assertion, inherited from 009 contract §5) — pinned RED-first.

### (b) Duplicate / orphan page sets (round-trip)

The master-page **name sets** align (constituent and both templates share
`First Page`, `Lesson Content`, `Coloring Page`, `Body Pages`, `Left/Right
Page`, etc.); the bilingual template adds a few TOC/cover masters
(`Table of Contents`, `Front cover`, `Back cover`, `Inside cover`). Same-named
masters overwrite in place (no duplication); template-only masters are added
under unique names. The existing "single clean master-page set" integration axis
(every display name appears once, none carries a numeric `NN` suffix) must be
**re-verified** now that page styles _are_ imported — it moves from
"protected by construction" to "actively verified." This is the failure mode 009
guarded against and FR-004 now requires solving.

### (c) Outline / TOC numbering with `LoadNumberingStyles=True` (finalize reasoning: safe)

**Decision**: `LoadNumberingStyles=True` is safe for the outline/TOC numbering,
on two independent grounds:

1. **Finalize post-patches in Node, after soffice.** `finalizeAssembledQuarter`
   rewrites the `text:outline-style` level-1 `num-format`/`start-value` in
   `styles.xml` **after** the merge, so whatever `text:outline-style` the
   template's numbering import produces, finalize deterministically overwrites
   the start value to the quarter's first absolute lesson number. Finalize wins
   regardless of the imported numbering. (Confirm during implementation that the
   finalize regex still matches the post-import `text:outline-style` shape.)
2. **Outline _participation_ rides on paragraph styles, already overwritten.**
   Whether a heading counts in the outline is `style:default-outline-level` on
   the **heading paragraph style** — which `LoadTextStyles=True` already
   overwrote in 009. `LoadNumberingStyles` governs **named list styles**
   (`text:list-style`), a different mechanism. Flipping it does not change which
   headings participate (only level-1 headings, per commit 860936b).

**Static vs round-trip**: The finalize-wins argument is code-structural. The
"TOC lists all 13 lessons, correct order, correct numbers" outcome (FR-005,
SC-003) is the round-trip assertion, pinned by the existing outline/footer axes
re-run after the flag flip.

---

## R5. Failure handling — inherited unchanged from 009 (no change)

**Decision**: The macro-level `On Error Goto TemplateFail` trap, the
`On Error Goto 0` reset immediately after the load, the pre-load hidden-document
open that forces a trappable parse of a corrupt template, and the Node-side
`validateTemplateAsset` per-job check all remain **exactly as 009 shipped them**
(FR-006 explicitly inherits 009 FR-004 semantics: fail loudly, deliver nothing).
No change is needed — flipping the family flags does not alter the failure
surface. The existing corrupt-template and missing-asset integration/unit axes
continue to apply unchanged.

**Rationale**: FR-006 is a pure inheritance; touching the error path would add
risk for no requirement. YAGNI.

---

## Cross-cutting: orthogonality with `finalizeAssembledQuarter`

Unlike 009 (where `LoadNumberingStyles=False` made the style load provably
orthogonal to finalize's outline patch), 013 imports numbering styles — so
orthogonality is now argued from **execution order** (R4c): finalize runs in
Node after soffice and overwrites the outline start value last. The metadata
patch (`meta.xml` `Quarter`/`dc:title`/`dc:subject`) is untouched by any style
load. The leading-blank-paragraph strip is a content operation, also unaffected.
All of this is asserted end-to-end by the golden-reference integration test
(the FR-004/FR-005 re-verification axes).
