# FINDINGS-018 — quarter assembly restyles each constituent's final memory verse

Status: **fixed and verified** (Phases 0–3, branch `018-quarter-assembly-combined`).
Companion to `FINDINGS.md` (the 017 Gate-1 pagination spike) — this document records the
defect that spike walked past, the mechanism behind it, and the design that closes it.

## The defect

In an assembled quarter book, the **second copy of the coloring-page memory verse** lost its
own paragraph style and rendered in the wrong face — upright sans + correct metrics on the
left half-sheet, italic centered on the right. Client-visible on every affected lesson of the
delivered Kwasio Luke Q1 books.

The victim is always the **last `office:text` child** of a constituent: the M.T. (mother-tongue)
memory verse, styled `M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse`. In the assembled book
it came out carrying `Bible_20_Story_20_-_20_Graphic_20_Number` instead.

## Pinned mechanism

`insertDocumentFromURL` **mutates every inserted document's last body paragraph to the
PRECEDING paragraph's style.** That is the whole mechanism — nothing downstream is implicated.

Three independent discriminators pin it (Phase 0, full run table in the scratch findings):

1. The **last** constituent mutates too, so no following boundary-break paragraph can be the cause.
2. `SPIKE_MANUAL_BREAK=0` (no `insertControlCharacter` + `BreakType=PAGE_BEFORE` step) still repros.
3. A **single-file** merge — `nInserted == 0`, so the break code never executes at all — still repros.

Which side wins is the preceding paragraph's: here the empty
`Bible_20_Story_20_-_20_Graphic_20_Number` spacer that sits between the two verse copies.

## Why the 017 Gate-1 spike missed it

Three compounding reasons, all worth carrying forward as spike discipline:

- **Nobody inspected the last paragraph's style.** The spike's `inspect_p_style.py` was pointed
  at pagination-relevant paragraphs; the terminal body paragraph of each constituent was never
  in the sample, so a defect that only ever touches that one paragraph could not surface.
- **The working hypothesis was automatic-style collision**, inherited from 017 US2. That
  hypothesis is **falsified** here: in both source masters the verse paragraph names its style
  **directly** on the `text:p`, with no `P<n>` automatic-style indirection to collide.
- **The real-pipeline repro was skipped.** The spike worked on hand-built minimal ODTs, where
  the terminal paragraph happened not to be a styled memory verse. Running the actual
  `prepareConstituentForAssembly` → `soffice` merge path over the actual masters is what
  exposed it in Phase 0.

## Marker-survival evidence

The fix appends a **sacrificial terminal paragraph** to each constituent so the mutation lands
on it instead of the verse. `finalizeAssembledQuarter` must then remove it, which requires
identifying it post-merge. The merge destroys the obvious handles:

| Candidate handle                                                       | Fate across the merge                                                                                            | Verdict                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| The paragraph's own automatic style (`QuarterAssemblySacrificialTail`) | **Annihilated** — the paragraph inherits the memory-verse style, background highlight included                   | Unusable                             |
| `text:bookmark` child                                                  | **Survives but MIGRATES** — L1's bookmark left its own paragraph and ended up in the final paragraph beside L2's | Unusable (not positionally reliable) |
| Fixed marker **text** content                                          | **Stays in its own paragraph** at every position                                                                 | **Adopted**                          |

The empty-paragraph variant is not merely untidy: because the sacrificial paragraph inherits
the memory-verse style — which carries a highlight background — it renders as a **visible empty
highlighted band on every coloring page**. The text-carrying variant avoids this (with text
content present, the merge preserves the hidden formatting as an automatic style), but leaves
marker text in the XML that must never ship.

## Amended design

- `prepareConstituentForAssembly` appends a hidden terminal `text:p` carrying the fixed marker
  text, exported as `QUARTER_ASSEMBLY_SACRIFICIAL_MARKER = "QuarterAssemblySacrificialTail"`.
- `finalizeAssembledQuarter` strips **every** paragraph whose text equals that marker.
- The strip is **REQUIRED**, promoted from the plan's original "last resort". Both half-states
  are shippable-looking and both are wrong: without the marker text the book grows a highlight
  band per coloring page; without the strip the marker text ships to the client.

## Verification summary (Phases 1–3)

**Phase 1–2** — failing integration + unit tests first, then implementation. Full suites green:
default 1885/1885; integration 100 passed / 2 skipped.

**Phase 3** — real client data. Kwasio Luke Q1 regenerated from the dev DB in both modes through
the production `assembleQuarter` path, swept against the two delivered pre-fix books as baseline.

Because the delivered books are Kwasio while the pinned masters are English, per-lesson identity
is anchored on the **scripture reference** (`1:13`, `4:18-19`, …), which survives translation,
rather than on master verse text (which matches nothing in a translated book).

| Metric (Luke Q1)                                 | broken bilingual | fixed bilingual  | broken single-lang | fixed single-lang |
| ------------------------------------------------ | ---------------- | ---------------- | ------------------ | ----------------- |
| Affected lessons (master ends on a memory verse) | 11               | 11               | 11                 | 11                |
| Verse copies with a memory-verse style           | 1 per lesson     | **2 per lesson** | 1 per lesson       | **2 per lesson**  |
| Verse copies restyled to graphic-number          | 1 per lesson     | **0**            | 1 per lesson       | **0**             |
| Marker text anywhere in `content.xml`            | absent           | **absent**       | absent             | **absent**        |
| Empty memory-verse paragraphs                    | 0                | **0**            | 0                  | **0**             |
| PDF page count                                   | 99               | **99**           | 52                 | **52**            |

Page counts and per-lesson coloring-page numbers are **identical** pre- and post-fix in both
modes — the fix introduces no pagination shift.

**Acts spot-check** (Acts Q1, bilingual, same driver): 11 affected constituents, all 22 verse
copies keep a memory-verse style, 0 restyled to graphic-number, marker absent. 16 of those 22
are **empty** — traced to source data, not to the fix: the Acts Q1 Kwasio memory verses are
untranslated, and the single generated constituent for Acts lesson 2 already contains two empty
memory-verse paragraphs before any merge occurs. The style invariant holds regardless of whether
the paragraph has text.

Artifacts (regenerated ODTs, PDFs, per-lesson coloring-page PNGs at 150 dpi for both modes
fixed and broken, and the sweep JSON) are kept in the Phase 3 scratch directory.
