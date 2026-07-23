---
date: 2026-07-23
topic: quarter-template-full-style-application
---

# Assembled Quarter: Full Style-Family Application of the Quarter Template

## Problem Frame

Chris Jackson (curriculum owner / domain authority) reviewed assembled quarter
downloads (2026-07-23 feedback) and reports both the bilingual and
single-language outputs do not reflect the quarter master template:

1. The first page of each lesson still shows the stand-alone lesson footer
   with the Creative Commons license block. The correct assembled quarter has
   **no footer on lesson first pages**; CC info appears only in the TOC
   section.
2. Spacing between the lesson-number graphic and the lesson header (and
   elsewhere) matches the stand-alone layout, not the quarter layout.

Root cause (confirmed in code + asset diff): the 009 assembly macro applies
the quarter styles template with `OverwriteStyles=True` but loads **only
paragraph/character styles** (`LoadPageStyles=False`,
`LoadFrameStyles=False`, `LoadNumberingStyles=False`), per 009 FR-003.
Footers live in page styles and the lesson-number graphic layout involves
frame styles, so the constituent lessons' stand-alone definitions survive
verbatim. Chris's manual reference process in LibreOffice is "Load Styles
from Template with **all families checked + Overwrite**" — the current
pipeline deliberately does less than that.

Asset staleness was investigated and **ruled out**: the committed template
assets match Chris's latest masters attribute-for-attribute for the styles
in question ("Lesson Title" identical; "First Page" footer-less in all
four files; CC text is body content, not a footer style).

## Requirements

**Template application semantics**

- R1. Assembled quarter output (bilingual and monolingual) MUST reflect the
  quarter styles template across **all style families** — paragraph,
  character, page (master pages), frame, and list/numbering — with
  same-named styles from constituent lessons **overwritten** by the
  template's definitions, mirroring Chris's manual "check all + Overwrite"
  process.
- R2. After assembly, the first page of each lesson MUST NOT show the
  stand-alone CC-license footer (the template's footer-less "First Page"
  page style wins).
- R3. After assembly, lesson-title spacing (lesson-number graphic ↔ header,
  and related layout) MUST match the corresponding quarter master layout in
  each mode (bilingual vs monolingual).
- R4. The per-lesson chapterized footers on lesson content pages
  (lesson/chapter fields + page number, from 007) MUST still render
  correctly after page styles are overwritten by the template.

**Supersession**

- R5. This supersedes 009 FR-003 ("template application must not change page
  styles / footers / pagination"). The new invariant is: template styles win
  everywhere; correct footers come from the template's master pages (whose
  chapter fields resolve per lesson), not from preserving lesson page
  styles.

## Success Criteria

- An assembled quarter (both modes) visually matches Chris's manually
  assembled reference: no footer on lesson first pages, quarter-correct
  title spacing, intact chapterized content-page footers, CC info present
  only in the TOC section.
- Round-trip verification (existing `soffice --headless` check) still
  passes for assembled output.
- Chris confirms the next assembled samples look right.

## Scope Boundaries

- **No template asset refresh.** Committed assets are verified current
  against Chris's 2026-07 masters; regeneration is out of scope.
- **Preview click-to-select regression** (CSP blocking inline `onclick` in
  the translate preview) — already addressed separately; not part of this
  feature.
- **Mismatched-content issue** from Chris's feedback item 2 — translation
  data, Chris is resolving it himself; not software scope.
- No changes to per-lesson (stand-alone) download behavior — single lessons
  keep the stand-alone template with CC footer.

## Key Decisions

- Load all style families with overwrite (reversing 009 FR-003): Chris's
  manual LibreOffice process is the product-truth reference; the 009
  restriction was protecting 007 footers but also blocks the correct
  first-page/frame/page behavior.
- Drop the asset-refresh idea: diff proved assets are not stale; refresh
  would change nothing and the monolingual master currently has a defect
  (see below).

## Dependencies / Assumptions

- Assumes the template's "Lesson Content" master page footer (chapter
  fields + page number) reproduces the 007 chapterized footers once page
  styles are overwritten. Must be verified (R4) — this was the original
  reason for `LoadPageStyles=False`.
- Items to relay to Chris (communication, not code):
  - His Q1 **monolingual** master's footers read "Lessons from the Old
    Testament" instead of "Lessons from Luke" (apparently rebuilt from an
    OT template).
  - The screenshot referenced in his feedback item 2 was never attached to
    the document.
  - Worth confirming his reviewed samples were generated **after** the 009
    template feature deployed (alternative partial explanation).

## Outstanding Questions

### Resolve Before Specify

- (none)

### Deferred to Planning

- [Affects R4][Technical] Verify that overwriting page styles does not
  break or duplicate the 007 chapterized footers / pagination — the exact
  failure 009's flag choice guarded against (`specs/009-quarter-styles-template/research.md:48-77`).
- [Affects R3][Needs research] Confirm which style family actually carries
  the spacing difference (frame style for the lesson-number graphic vs page
  layout) by diffing the stand-alone lesson template's styles against the
  quarter template's.
- [Affects R1][Technical] Whether `LoadNumberingStyles=True` has side
  effects on the outline/TOC numbering the assembly relies on
  (level-1-headings outline participation, commit 860936b).

## Next Steps

-> `/sp:02-specify` to create the formal specification from this document.
