# Feature Specification: Quarter Pagination and Coloring-Page Style Fixes

**Feature Branch**: `017-quarter-pagination-fixes`
**Created**: 2026-08-11
**Status**: Draft
**Brainstorm**: `specs/brainstorms/2026-08-11-quarter-pagination-and-coloring-page-style-requirements.md`
**Beads Epic**: `lessons-from-luke-ipuf`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-ipuf.1`
- red-team: `lessons-from-luke-ipuf.2`
- tasks: `lessons-from-luke-ipuf.3`
- analyze: `lessons-from-luke-ipuf.4`
- implement: `lessons-from-luke-ipuf.5`
- harden: `lessons-from-luke-ipuf.6`

**Input**: User description: "Correct assembled-quarter page numbering (roman front matter, arabic restart at lesson 1, recto first lesson page, no page-number field offsets) and fix the second coloring-page memory verse losing its paragraph style during assembly."

## Context

Client review of a delivered assembled quarter book on 2026-08-11 raised two defects. Both are
visible only in the finished book, and both originate at the assembly stage rather than in
translation or upload.

This specification **supersedes** `specs/007-assembled-quarter-download/spec.md` FR-003 on two
points. That requirement declared the page-number offset "expected, not a defect" and dropped
odd-page lesson starts from scope, on the reasoning that the reference deliverable carried the
same behavior. The client, reading the actual printed book, disagrees. FR-003 now carries a
superseded banner pointing here.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Page numbers match the reader's position in the book (Priority: P1)

The curriculum coordinator opens a downloaded assembled quarter book, or prints it, and uses the
page numbers to navigate. Front matter is numbered in lowercase roman numerals, the lesson body
restarts at arabic `1`, and every printed number tells the reader truthfully where they are.

**Why this priority**: This is the client's primary complaint and the one that makes the book
hard to use. It also removes the compensating field offsets, which the client has already found
and (reasonably) read as a mistake.

**Independent Test**: Assemble a quarter, open it, and read the footers. No other change is
needed for this to deliver value.

**Acceptance Scenarios**:

1. **Given** an assembled quarter book, **When** the reader looks at the first page, **Then** no
   page number is printed, and that page counts as `i`.
2. **Given** an assembled quarter book, **When** the reader looks at the second physical page,
   **Then** it prints `ii`.
3. **Given** an assembled quarter book, **When** the reader looks at the first page of lesson 1,
   **Then** no page number is printed, and the following page prints `2`.
4. **Given** an assembled quarter book, **When** the reader looks at the first page of any later
   lesson, **Then** no page number is printed, and the following page prints the next value in
   the body sequence with no gap or repeat.
5. **Given** an assembled quarter book, **When** the client inspects any footer's page-number
   field, **Then** no offset is set on it.
6. **Given** either assembly mode, **When** the above checks are run, **Then** they hold
   identically for bilingual and single-language books.

---

### User Story 2 - Both memory verses on a coloring page look the same (Priority: P2)

A translator or teacher looks at a coloring page in the assembled quarter. The page carries two
copies of the memory verse by design, one per printed half-sheet. Both render in the memory-verse
paragraph style, as the source lesson master specifies.

**Why this priority**: Independently visible, independently fixable, and cosmetically obvious in
a printed curriculum. It does not block navigation the way the numbering defect does.

**Independent Test**: Assemble a quarter containing a coloring page and compare the two memory
verses on that page. Requires none of the numbering work.

**Acceptance Scenarios**:

1. **Given** an assembled quarter book containing a coloring page, **When** the two memory-verse
   paragraphs on that page are compared, **Then** they render identically.
2. **Given** a coloring page whose source master names the memory-verse style directly, **When**
   the assembled book is inspected, **Then** both copies carry that style.
3. **Given** a coloring page whose source master reaches the memory-verse style indirectly
   through an automatic style's parent, **When** the assembled book is inspected, **Then** both
   copies still render in the memory-verse style.
4. **Given** lesson masters using either style-naming family, **When** the assembled book is
   inspected, **Then** the result is the same for both families.

---

### User Story 3 - The first lesson opens on a right-hand page (Priority: P3)

The book is printed duplex. The first page of lesson 1 falls on a recto (right-hand) page, so the
body of the curriculum opens the way a printed book is expected to.

**Why this priority**: Added by the product owner rather than requested by the client, and it
carries the most technical risk, since it depends on physical sheet parity in a document whose
internal page counter is known to be unreliable.

**Independent Test**: Render an assembled quarter and check whether lesson 1's first page falls
at an odd physical position.

**Acceptance Scenarios**:

1. **Given** front matter whose length leaves lesson 1 on a right-hand page, **When** the book is
   assembled, **Then** no blank page is inserted.
2. **Given** front matter whose length would leave lesson 1 on a left-hand page, **When** the book
   is assembled, **Then** exactly one blank page is inserted before lesson 1.
3. **Given** an inserted blank page, **When** the reader looks at it, **Then** it carries no
   content and prints no page number, but consumes one number in the front-matter sequence.
4. **Given** either assembly mode, **When** the book is assembled, **Then** lesson 1 opens recto
   in both.

---

### Edge Cases

- **Front matter is already even-length**: no filler page is inserted, and the front-matter
  sequence ends where it naturally ends.
- **Front matter is a single page**: lesson 1 would fall on physical page 2 (verso), so a filler
  is inserted and lesson 1 opens on page 3.
- **The two style-naming families appear in the same quarter**: different lessons may use
  `M.T. Coloring Page - Memory Verse` and the plain `Coloring Page - Memory Verse`. Both must
  work in one assembled book.
- **A coloring page's verse paragraphs reach the style only through an automatic style's
  parent**: the fix must not depend on the named style appearing on the paragraph itself.
- **Empty spacer paragraphs carrying the memory-verse style**: present in at least one master
  (adjacent to a filled verse paragraph). These must not be mistaken for the duplicate copy.
- **A quarter with fewer than the full 13 lessons**: body numbering still runs continuously from
  arabic `1` across whatever lessons are present.

## Requirements _(mandatory)_

### Functional Requirements

**Front matter numbering**

- **FR-001**: The assembled quarter book MUST number its front matter in lowercase roman numerals.
- **FR-002**: The first physical page MUST count as `i` and MUST print no page number.
- **FR-003**: The second physical page MUST print `ii`, and front matter MUST continue in
  sequence from there.
- **FR-004**: The system MUST NOT use a page-number field offset to achieve correct numbering.
  Each printed number MUST equal the page's true position within its own sequence.

**Body numbering**

- **FR-005**: The first page of the first lesson MUST restart numbering at arabic `1`.
- **FR-006**: Body numbering MUST run continuously and accurately from lesson 1 to the end of the
  book, across all lessons present.
- **FR-007**: The first page of each lesson MUST print no page number while still consuming its
  number, so the following page prints the next value in sequence.

**Duplex layout**

- **FR-008**: The first page of the first lesson MUST fall on a recto page when the book is
  printed duplex.
- **FR-009**: Where front-matter length would otherwise place the first lesson on a verso page,
  the system MUST insert exactly one blank page before it. The inserted page MUST carry no
  content, MUST print no page number, and MUST consume one number in the front-matter sequence.
- **FR-010**: The system MUST determine recto placement from the rendered page count of the
  assembled document, not from any internal page counter.

**Coloring-page memory verse**

- **FR-011**: Both copies of the memory verse on a coloring page MUST render in the memory-verse
  paragraph style in the assembled quarter book, matching what the source lesson master specifies.
- **FR-012**: FR-011 MUST hold across both style-naming families present in the corpus
  (`M.T. Coloring Page - Memory Verse` and `Coloring Page - Memory Verse`).
- **FR-013**: FR-011 MUST hold where the style is reached indirectly through an automatic style's
  parent rather than named on the paragraph itself.
- **FR-014**: The system MUST NOT remove or deduplicate either copy of the memory verse. Two
  copies per coloring page is correct by design.

**Coverage**

- **FR-015**: All of the above MUST hold for both bilingual and single-language assembled quarter
  books.
- **FR-016**: Automated verification MUST assert absolute printed page numbers at known positions,
  not only that adjacent numbered pages increment by one.

### Key Entities

- **Front-matter sequence**: The roman-numbered run of pages from the start of the book up to and
  including any inserted blank filler page. Begins at `i`.
- **Body sequence**: The arabic-numbered run of pages from the first page of lesson 1 to the end
  of the book. Begins at `1`.
- **Blank filler page**: A contentless, unnumbered page inserted before lesson 1 only when needed
  to place it recto. Belongs to the front-matter sequence.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a delivered assembled quarter book, the second physical page prints `ii`.
- **SC-002**: The page after lesson 1's first page prints `2`.
- **SC-003**: For every printed page number in the book, the number equals the page's position
  within its own sequence — zero discrepancies across the whole document.
- **SC-004**: The first page of lesson 1 falls at an odd physical page position.
- **SC-005**: The client can inspect every footer's page-number field and find no offset set.
- **SC-006**: On a coloring page, the two memory-verse paragraphs are visually indistinguishable
  from each other.
- **SC-007**: SC-001 through SC-006 hold for both bilingual and single-language books.
- **SC-008**: The client confirms the two reported defects are resolved on the next delivered
  quarter, with no new pagination or styling complaints.

## Assumptions

- The blank filler page is genuinely blank and counted-but-unnumbered, consistent with how lesson
  first pages already behave.
- Numbering restarts per assembled quarter book; nothing carries across quarters.
- Two memory-verse copies per coloring page remain intentional and stay.
- Regeneration is on demand, so already-delivered books are corrected by re-assembling rather
  than by any migration.

### Known-unknown: the phantom page

Feature 007's spike established that the assembled document carries a page that is counted but
never rendered, at the front-matter-to-lesson-1 boundary. Both hypotheses it tested were
disproven and the cause was left unresolved. This specification deliberately routes around it:
pinning each numbering sequence to an explicit start value makes printed numbers independent of
the counter's accumulated history, and FR-010 makes recto placement depend on rendered pages
rather than the counter. Root-causing the phantom is **not** in scope.

### Verification approach

Both defects are verified by the same round trip: generate a document, open it, export to PDF,
inspect. Each human round trip is expensive, so a diagnostic spike should maximize information
per artifact. Planning should budget for one, built with first-page number suppression disabled
(so every physical page prints its field value and the drift's onset is visible), shipping
several variants in one batch across both assembly modes, and including one individually
downloaded lesson containing a coloring page to settle the hypothesis below in the same sitting.

### Leading hypothesis for the coloring-page defect

Recorded so planning does not re-derive it. The source masters are clean — both verse paragraphs
carry the memory-verse style, directly or through an automatic style whose parent is that style.
No code in the pipeline duplicates paragraphs or can emit a graphic style onto a verse paragraph.
The strongest remaining candidate is automatic-style name collision during the merge: assembly
combines fourteen constituents whose automatic style names (`P12` and similar) are only locally
unique, and the merge dedupes by name with first-definition-wins. A name meaning "graphic anchor"
in one lesson can capture the same name meaning "memory verse" in another. This predicts the
defect appears in the assembled book but not in an individually downloaded lesson, which is a
cheap discriminating check.

### Deferred to planning

- **[Needs research]** Confirm the automatic-style collision hypothesis before designing a fix.
- **[Technical]** Whether the numbering fix belongs in the shipped template assets, in the
  post-merge finalize step, or both. The offsets live in the assets today; explicit sequence
  restarts may not be expressible there.
- **[Technical]** Whether interactive PDF export and the headless render already used by the
  pipeline agree. If they do, most verification rounds can run without a human.
- **[Technical]** Where the rendered-page-count measurement (FR-010) fits in the assembly flow,
  given it implies a render pass before the document is final.

## Out of Scope

- Forcing lessons other than the first to begin recto.
- Removing or changing the intentional duplicate memory verse.
- Root-causing the counted-but-unrendered page from feature 007.
- Covers (feature 008), which remain outside the assembled document.
- Any change to how lessons are translated, uploaded, or stored.
- Making the recto guarantee survive client edits to the document after delivery (see
  Clarifications).

## Clarifications

### Session 2026-08-11

- Q: Should the recto guarantee survive the client editing front matter after delivery, or is
  correct-as-delivered enough? → A: **Correct as delivered.** Assembly counts front-matter pages
  and inserts a literal blank page when needed. If the client later edits front matter, the filler
  may be wrong and they correct it by hand. A self-maintaining page-style rule was considered and
  not chosen.
- Q: If the front-matter page count and true physical parity disagree because of the phantom page,
  what should the implementation trust? → A: **The rendered document.** Determine parity by
  rendering and counting actual pages rather than trusting any internal counter (FR-010).
- Q: How should the two defects be packaged? → A: **One feature, two requirement groups.** They
  share the assembly stage and the same verification round trip, so splitting them would duplicate
  the spike setup.
