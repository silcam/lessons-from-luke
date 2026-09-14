---
date: 2026-08-11
topic: quarter-pagination-and-coloring-page-style
---

# Quarter Pagination and Coloring-Page Memory-Verse Style

## Problem Frame

Client review of an assembled quarter (feedback 2026-08-11) surfaced two defects in the
downloadable quarter ODT. Both originate in the assembly stage, and both are visible only
to the person who opens the finished book.

**Pagination.** Printed page numbers do not correspond to position in the book. The client
traced this to a page-number field offset in the footer and read it as leftover debris from
earlier work. It is not debris: the offsets are deliberate, live in the two shipped template
assets (`assets/quarter-styles-template.odt` at `-1`, `-monolingual.odt` at `-2`, on the
`Front_20_matter` master only), and were introduced in feature 007 to compensate for a
page-counter anomaly at the front-matter-to-lesson-1 boundary that 007 investigated and left
unresolved. The compensation is now visibly wrong to the reader, and the underlying scheme
was never what the curriculum actually needs.

**Coloring-page memory verse.** Each coloring page carries two copies of the memory verse by
design (two copies per printed sheet). In the source masters both copies carry the
memory-verse paragraph style. In the assembled quarter the second copy renders with the
formatting of the inline-graphic paragraph above it: bold, italic, centered.

Neither defect blocks the client from using the document, but both are visible in a printed
curriculum that goes to translators and teachers, and the pagination one makes the book hard
to navigate.

## Requirements

**Front matter numbering**

- R1. Front matter is numbered in lowercase roman numerals.
- R2. The first physical page of the assembled quarter counts as `i` and prints no page number.
- R3. The second physical page prints `ii`, and front matter continues `iii`, `iv`, and so on.
- R4. No page-number field offset is used to achieve this. The printed number equals the page's
  true position in its sequence.

**Body numbering**

- R5. The first page of the first lesson restarts numbering at arabic `1`.
- R6. Body numbering runs continuously and accurately from there to the end of the book,
  across all lessons.
- R7. The first page of each lesson prints no page number but still consumes its number, so the
  following page prints the next value in sequence.

**Duplex layout**

- R8. The first page of the first lesson falls on a recto (right-hand) page when the quarter is
  printed duplex.
- R9. Where front matter would leave the first lesson on a verso page, a blank page is inserted
  before it. The inserted page carries no content and prints no page number, but consumes a
  number in the front-matter sequence.

**Coloring-page memory verse**

- R10. Both copies of the memory verse on a coloring page render with the memory-verse paragraph
  style in the assembled quarter, matching what the source masters specify.
- R11. This holds across both style-naming families present in the corpus
  (`M.T. Coloring Page - Memory Verse` and the plain `Coloring Page - Memory Verse`) and where
  the style is reached indirectly through an automatic style's parent rather than named on the
  paragraph.

**Coverage**

- R12. All of the above hold for both the bilingual and the monolingual assembled quarter.

## Success Criteria

Checked by opening the assembled quarter and reading it, in both modes:

- Physical page 2 prints `ii`.
- The first page of lesson 1 prints nothing; the page after it prints `2`.
- The last page of the book prints a number equal to its position in the body sequence.
- The first page of lesson 1 is a recto page in a duplex print.
- Both memory verses on a coloring page look identical to each other and match the first one in
  the source master.
- The client can open the document, look at the footers, and find no page-number field offset
  set on any master.

## Scope Boundaries

- Forcing _every_ lesson to start recto is out of scope. Only the first lesson has that
  requirement.
- Removing or changing the intentional duplicate memory verse is out of scope. Two copies per
  coloring page is correct; only the styling of the second copy is wrong.
- Covers (feature 008) remain outside the assembled document and are unaffected.
- No change to how lessons are translated, uploaded, or stored. Both defects are assembly-stage.

## Key Decisions

- **This reverses feature 007's stated position, deliberately.**
  `specs/007-assembled-quarter-download/spec.md` FR-003 declares the page-number offset
  "expected, not a defect" and explicitly descopes odd-page lesson starts. Client feedback on
  2026-08-11 reverses both. The 007 spec should carry a back-annotation pointing here so the
  old doctrine is not inherited by later work.

- **Pin each numbering sequence explicitly rather than solving the phantom page.**
  The anomaly 007 could not explain inflates LibreOffice's running page counter. Restarting the
  body at arabic `1` and anchoring front matter at roman `i` makes each sequence independent of
  the counter's accumulated history, so the unexplained page stops affecting printed numbers.
  Root-causing it is no longer on the critical path.

- **Physical page position is the authority for recto, not the page-number field.**
  Standard book convention puts physical page 1 on recto, so an odd physical index is recto
  regardless of what the counter says. Recto placement is therefore a counting question against
  rendered pages.

- **Both defects ship together.** They share the assembly stage and the same verification
  round-trip, so splitting them would duplicate the spike setup.

## Dependencies / Assumptions

- Assumes the blank filler page (R9) is genuinely blank and counted-but-unnumbered, consistent
  with how lesson first pages already behave.
- Assumes numbering restarts per assembled quarter; nothing carries across quarters.
- Assumes the two memory-verse copies per coloring page remain intentional and stay.

## Leading Hypothesis for the Coloring-Page Defect

Not a requirement, recorded so planning does not re-derive it.

The source masters are clean: both verse paragraphs carry the memory-verse style, directly or
through an automatic style whose parent is that style. Nothing in the TypeScript pipeline
duplicates paragraphs or can emit a graphic style onto a verse paragraph. The strongest
remaining candidate is automatic-style name collision during the `soffice` merge: the assembly
merges fourteen constituents where automatic style names like `P12` are only locally unique, and
the merge dedupes by name with first-definition-wins. A `P12` that anchors a graphic in one
lesson can capture a `P12` that means memory verse in another.

This predicts the defect appears in the assembled quarter but not in an individually downloaded
lesson, which is a cheap discriminating check and should be the first thing the spike settles.

## The Spike

Both defects are verified by the same round trip: generate a document, open it in LibreOffice,
export to PDF, inspect. Each round trip costs a human sitting, so the spike is designed to
maximize information per artifact rather than test one hypothesis at a time.

- Build the pagination diagnostic with **first-page suppression disabled**, so every physical
  page prints its page-number field. The suppressed pages are exactly where the drift currently
  hides; with all pages printing, comparing field value against physical PDF index shows the
  precise page where drift begins.
- Ship variants in one batch: baseline as-is, offsets zeroed, and offsets zeroed plus an explicit
  arabic restart pinned at lesson 1. The third is the proposed fix, so a clean result makes the
  spike double as validation.
- Cover both modes. Bilingual and monolingual carry different offsets and may not share a cause.
- Include one individually downloaded lesson containing a coloring page, to settle the
  hypothesis above in the same sitting.

Findings land alongside the 007 precedent (`specs/007-assembled-quarter-download/spike/`).

## Outstanding Questions

### Resolve Before Specify

_None._

### Deferred to Planning

- [Affects R8, R9][Needs research] If the unexplained counted page is a real page rather than a
  display artifact, does it shift physical sheet parity? Explicit start values make numbering
  immune to it, but recto placement depends on physical position and could still be affected.
- [Affects R1-R7][Technical] Does the fix belong in the shipped template assets, in the
  post-merge finalize step, or both? The offsets live in the assets today; the numbering restart
  may not be expressible there.
- [Affects R10, R11][Needs research] Confirm the automatic-style collision hypothesis before
  designing a fix, via the single-lesson check in the spike.
- [Affects success criteria][Technical] Is LibreOffice's interactive PDF export authoritative,
  or is the headless `soffice` render the pipeline already uses equivalent? If equivalent, most
  verification rounds can run without a human.
- [Affects R7][Technical] No existing test asserts an _absolute_ printed page number, only that
  adjacent numbered pages increment by one. Absolute assertions need adding.

## Next Steps

-> `/sp:02-specify` to create the formal specification.

Done already: `specs/007-assembled-quarter-download/spec.md` FR-003 carries a superseded
banner pointing here.
