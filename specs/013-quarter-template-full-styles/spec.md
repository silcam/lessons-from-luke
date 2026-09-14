# Feature Specification: Quarter Template Full Style-Family Application

**Feature Branch**: `013-quarter-template-full-styles`
**Created**: 2026-07-23
**Status**: Draft
**Beads Epic**: `lessons-from-luke-fn4x`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-fn4x.1`
- red-team: `lessons-from-luke-fn4x.2`
- tasks: `lessons-from-luke-fn4x.3`
- analyze: `lessons-from-luke-fn4x.4`
- implement: `lessons-from-luke-fn4x.5`
- harden: `lessons-from-luke-fn4x.6`

**Input**: User description: "Assembled quarter downloads must fully apply the quarter styles template across all style families (paragraph, character, page, frame, list) with overwrite, so lesson first pages lose the stand-alone CC footer and spacing matches the quarter masters. Supersedes 009 FR-003."
**Brainstorm**: specs/brainstorms/2026-07-23-quarter-template-full-style-application-requirements.md

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Lesson first pages lose the stand-alone footer (Priority: P1)

Chris (curriculum owner) downloads an assembled quarter (bilingual or
single-language). Each lesson's first page appears exactly as in his manually
assembled reference: **no footer** — in particular, no Creative Commons
license block. The CC information appears only where the quarter master
places it (the TOC section). Today, every lesson's first page still carries
the stand-alone lesson footer with the CC block, because the constituent
lessons' own page styles survive assembly.

**Why this priority**: This is the most visible defect Chris reported
(2026-07-23 feedback) and the clearest signal that the assembled quarter is
not print-ready. It repeats on all 13 lessons of every quarter.

**Independent Test**: Assemble any quarter in either mode and inspect the
first page of each lesson: no footer content present; CC text found only in
the TOC section.

**Acceptance Scenarios**:

1. **Given** a quarter whose lessons were uploaded with the stand-alone
   template (CC footer on first page), **When** the quarter is assembled,
   **Then** no lesson first page in the output shows any footer, and the CC
   license text appears only in the TOC section of the book.
2. **Given** an assembled quarter in single-language mode, **When** its first
   pages are inspected, **Then** the same footer-less result holds as in
   bilingual mode.

---

### User Story 2 - Layout and spacing match the quarter master (Priority: P1)

Chris downloads an assembled quarter and the layout around each lesson
opening — the spacing between the lesson-number graphic and the lesson
title/header, and related layout details — matches the corresponding quarter
master for that mode. Today the single-language output shows the stand-alone
layout's tighter spacing because some style families (notably those governing
frames and page layout) are never taken from the quarter template.

**Why this priority**: Same feedback round and same root cause as Story 1;
visible on every lesson opening. The two stories together define "the
template fully wins."

**Independent Test**: Assemble a single-language quarter and compare a lesson
opening against the same lesson in Chris's quarter master: spacing between
the number graphic, title, and overview bar matches the master, not the
stand-alone lesson.

**Acceptance Scenarios**:

1. **Given** a single-language quarter, **When** it is assembled, **Then**
   each lesson opening's spacing (number graphic ↔ title ↔ overview header)
   matches the single-language quarter master layout.
2. **Given** a bilingual quarter, **When** it is assembled, **Then** lesson
   openings match the bilingual quarter master layout.

---

### User Story 3 - Content-page footers and numbering survive (Priority: P2)

A reader flips through an assembled quarter: every lesson's content pages
still show the correct per-lesson footer (quarter/lesson identification and
page number), pagination is continuous and correct, and the table of contents
and lesson numbering are unchanged from today's correct behavior. Making the
template win everywhere must not regress what already works.

**Why this priority**: Preserving the per-lesson footers is the exact reason
the previous feature (009) deliberately did **not** apply page styles. This
story converts that protection from a design restriction into a regression
guarantee.

**Independent Test**: Assemble a quarter and verify content-page footers show
the correct lesson identification and page numbers for each lesson, and the
TOC lists all lessons with correct numbering.

**Acceptance Scenarios**:

1. **Given** an assembled quarter, **When** content pages of different
   lessons are inspected, **Then** each shows its own lesson's footer fields
   and correct continuous page numbers.
2. **Given** an assembled quarter, **When** the TOC and lesson-number
   sequence are inspected, **Then** they are identical to the pre-change
   correct behavior (all lessons present, correct order and numbering).

---

### User Story 4 - Stand-alone lesson downloads unchanged (Priority: P3)

A translator downloads a single lesson from the translation app. It still
uses the stand-alone template — including the CC license footer on its first
page — because a single lesson circulating on its own must carry its own
license information.

**Why this priority**: Explicit non-goal protection; the change is scoped to
assembled quarters only.

**Independent Test**: Download a single lesson and confirm its first-page CC
footer is still present.

**Acceptance Scenarios**:

1. **Given** a single-lesson download, **When** the document is opened,
   **Then** its first page still shows the stand-alone CC footer, unchanged.

---

### Edge Cases

- A constituent lesson defines a style name that does not exist in the
  quarter template: that style is left as-is (only same-named styles are
  overwritten); the lesson still renders.
- The quarter template is missing, unreadable, or the style-application step
  errors: the assembly job fails loudly with a human-readable reason and
  delivers nothing (inherited from 009 FR-004 — partial books are worse than
  errors).
- Applying page styles introduces the template's own page set alongside the
  lessons' pages: output must not contain duplicate/orphan page styles that
  alter pagination (this was the failure mode 009's restriction guarded
  against; it is now a required-to-solve case, not a reason to skip page
  styles).
- List/numbering styles from the template interact with the outline that
  drives the TOC and lesson numbering: numbering must remain correct (only
  level-1 headings participate in the outline).
- Bilingual and single-language modes use different template assets; each
  mode must apply its own template's full style set.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When assembling a quarter, the system MUST apply the
  mode-appropriate quarter styles template across **all style families** —
  paragraph, character, page (including master pages and their
  headers/footers), frame, and list/numbering — **overwriting** same-named
  styles carried in by the constituent lessons. This mirrors the curriculum
  owner's manual reference process ("load styles from template, all families
  checked, Overwrite on").
- **FR-002**: In the assembled output, lesson first pages MUST have no
  footer; in particular the stand-alone Creative Commons license footer MUST
  NOT appear on any lesson first page. CC license information appears only
  where the quarter template places it (the TOC section body content).
- **FR-003**: In the assembled output, lesson-opening layout and spacing
  (lesson-number graphic, lesson title, overview header) MUST match the
  corresponding quarter master for the selected mode (bilingual or
  single-language).
- **FR-004**: The per-lesson content-page footers (lesson identification
  fields and page numbers) and overall pagination MUST remain correct after
  full style application — no duplicated page sets, no lost or wrong footer
  fields, no pagination breaks.
- **FR-005**: The table of contents and lesson numbering MUST be unaffected:
  all lessons listed, correct order, correct numbers, with only level-1
  headings participating in the outline.
- **FR-006**: If template style application fails for any reason (asset
  missing, unreadable, style-load error), the assembly job MUST fail with a
  human-readable reason and MUST NOT deliver a result document (inherits 009
  FR-004 semantics).
- **FR-007**: Single-lesson (stand-alone) downloads MUST be unchanged,
  retaining the stand-alone template including its first-page CC footer.
- **FR-008**: This feature supersedes 009 FR-003. The invariant "template
  application must not change page styles, footers, or pagination" is
  replaced by: "the quarter template's styles win in every family; correct
  footers and pagination come from the template's master pages, whose
  per-lesson fields resolve for each lesson."

### Key Entities

- **Quarter styles template** (existing, two assets — bilingual and
  single-language): the committed style-source documents derived from the
  curriculum owner's quarter masters. Verified current (2026-07-23 diff
  against Chris's latest masters); no regeneration in scope.
- **Constituent lesson document** (existing): a per-lesson document uploaded
  with the stand-alone template; its same-named styles are now overwritten
  during assembly, while its content is preserved.
- **Assembled quarter** (existing): the single output book; after this
  feature its styling in every family reflects the quarter template.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 0 lesson first pages in an assembled quarter (either mode)
  show a footer; CC license text occurrences outside the TOC section: 0.
- **SC-002**: Lesson-opening spacing in assembled output matches the quarter
  master for the mode on 100% of lessons (verified against the reference
  layout).
- **SC-003**: 100% of content pages show the correct lesson footer fields
  and continuous page numbering; TOC lists 100% of lessons in correct order
  with correct numbers (no regression from current behavior).
- **SC-004**: The existing assembled-output round-trip verification
  continues to pass for both modes.
- **SC-005**: The curriculum owner confirms a sample assembled quarter
  (each mode) visually matches his manually assembled reference.
- **SC-006**: Single-lesson downloads are unaffected by the change in
  template-application behavior (first-page CC footer intact).

## Assumptions

Carried forward from the brainstorm (deferred to planning):

- Overwriting page styles is assumed compatible with the per-lesson
  chapterized footers because the template's lesson-content master page
  carries the same footer fields, which resolve per lesson. Planning must
  verify this and solve any duplicate-page-set fallout (the original reason
  009 skipped page styles — see specs/009-quarter-styles-template/research.md).
- The exact style family carrying the lesson-opening spacing difference
  (frame style for the number graphic vs. page layout) is unconfirmed;
  planning should identify it by diffing the stand-alone template's styles
  against the quarter template's. The requirement (FR-003) is outcome-based
  either way.
- Enabling list/numbering style loading is assumed safe for the
  outline/TOC numbering (level-1-headings rule); planning must verify.
- Template assets are current per the 2026-07-23 attribute-level diff
  against the curriculum owner's masters; asset regeneration is explicitly
  out of scope.
- Failure-handling semantics are inherited unchanged from 009 (fail loudly,
  deliver nothing).

## Scope Boundaries

- No template asset refresh or regeneration.
- No change to single-lesson download behavior (FR-007 protects this).
- The translation-app preview click regression (CSP) is separate work,
  already addressed.
- The mismatched-translation-content issue from the same feedback round is
  translation data, handled by the curriculum owner, not software scope.
- No new persistent storage, jobs, or UI.

## Clarifications

### Session 2026-07-23

- Q: Which of Chris's feedback items should become this feature? → A:
  Assembled-quarter styling only (footer/page styles + spacing); the preview
  click regression was a separate CSP bug, already addressed.
- Q: Should regenerating the template assets from Chris's masters be in
  scope? → A: Initially yes, but an attribute-level diff proved both
  committed assets already match his latest masters for the styles in
  question — refresh dropped from scope.
- Q: Given assets aren't stale, what is the fix? → A: Load all style
  families with overwrite (reversing 009 FR-003), mirroring Chris's manual
  LibreOffice process; chapterized-footer survival becomes a verification
  requirement rather than a reason to hold back.
