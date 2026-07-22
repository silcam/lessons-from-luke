# Feature Specification: Covers in the Platform

**Feature Branch**: `008-covers-in-platform`
**Created**: 2026-07-09
**Status**: Draft
**Beads Epic**: `lessons-from-luke-l96d`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-l96d.1`
- red-team: `lessons-from-luke-l96d.2`
- tasks: `lessons-from-luke-l96d.3`
- analyze: `lessons-from-luke-l96d.4`
- implement: `lessons-from-luke-l96d.5`
- harden: `lessons-from-luke-l96d.6`

**Brainstorm**: specs/brainstorms/2026-07-09-covers-in-platform-requirements.md
**Input**: User description: "Bring quarter covers into the platform as reserved lesson numbers (97=A4, 98=A3, TOC=99 precedent) so cover text populates from existing translations and translated covers download from the language page, per specs/brainstorms/2026-07-09-covers-in-platform-requirements.md"

## Overview

Quarter covers are the last hand-edited text artifact in the publishing workflow
(SOP §22). Today the operator copies an English cover document from Google Drive,
renames it per language/book/quarter/format, and hand-edits every text field —
title, subtitle, copyright, publisher address — even though most of that text
already exists as translated strings in the platform. With two formats per quarter
(A4 cut-sheet and A3 full-spread booklet), that is 8 hand-edited documents per book
per language.

This feature brings covers into the platform the way the Table of Contents was
brought in (reserved lesson number 99): cover masters upload through the existing
English-document path, their text is extracted for translation, shared strings
auto-populate from existing translations, and translated covers download from the
language page ready for the manual PDF export and print handoff.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Upload English cover masters (Priority: P1)

An operator uploads the English cover masters (one per book, series, and format)
through the existing English-document upload page. The upload form recognizes cover
files by their filename, pre-selects the book, series, and cover format, and offers
a manual override. On upload, all translatable cover text (title, subtitle,
copyright line, publisher address lines) is extracted as translatable strings, and
the cover appears in document lists under a human-readable name such as
"Cover (A4)" — never as "Lesson 97".

**Why this priority**: Nothing else in this feature can happen until cover masters
exist in the platform with their text extracted. It is independently valuable: the
cover text becomes visible and translatable even before download exists.

**Independent Test**: Upload a real English cover master file; confirm the form
pre-selected book/series/format from the filename, the document is stored under the
correct reserved lesson number, its text strings appear for translation, and lists
show "Cover (A4)"/"Cover (A3)" naming.

**Acceptance Scenarios**:

1. **Given** the English-document upload page, **When** the operator selects a file
   named `English-Luke-Q1-Cover-A4.odt`, **Then** the form pre-selects book Luke,
   series 1, and cover format A4, with a visible manual override control.
2. **Given** a cover master file whose name uses the `T` series prefix
   (`English-Luke-T1-Cover-A4.odt`), **When** the operator selects it, **Then** the
   series is detected identically to the `Q` prefix form.
3. **Given** a valid cover master upload, **When** processing completes, **Then**
   the title, subtitle, copyright line, and publisher address lines are all
   extracted as translatable strings for that cover.
4. **Given** an uploaded A4 cover for Luke series 1, **When** the operator views
   document or lesson lists, **Then** it displays as "Cover (A4)" (or equivalent
   human-readable name), never as a bare lesson number.

---

### User Story 2 - Cover text auto-populates from existing translations (Priority: P2)

A translator opens a freshly uploaded cover for a language that already has a
translated Table of Contents. The cover's shared strings (e.g. the title "Lessons
from Luke" and subtitle "Teacher's Guide") are already translated because the same
English text was translated before. Only cover-only strings (copyright line,
publisher address) need new translation, and they remain ordinary editable strings
thereafter (e.g. updating the publication year).

**Why this priority**: Auto-population is the core payoff over hand-editing — most
cover text should never be re-typed. It depends on Story 1 existing but delivers
its value in the normal translation workflow.

**Independent Test**: For a language with a fully translated TOC, upload a cover
master and open the language's translation view; verify shared strings show
existing translations and cover-only strings appear untranslated and editable.

**Acceptance Scenarios**:

1. **Given** a language with the title and "Teacher's Guide" already translated via
   the TOC, **When** a cover master is uploaded, **Then** those cover strings show
   the existing translations without any translator action.
2. **Given** an untranslated cover-only string (e.g. the copyright line), **When**
   the translator translates it in the normal translation UI, **Then** the
   translation is saved and remains editable like any other string.
3. **Given** a translated copyright line, **When** the publication year changes,
   **Then** the translator updates it as an ordinary string edit with no special
   workflow.

---

### User Story 3 - Download translated covers from the language page (Priority: P3)

An operator visits a language page and downloads a translated cover for a given
book, quarter, and format. The downloaded document has all text fields populated
from the language's translations — no hand-editing in LibreOffice — and its
filename follows the established output naming convention (e.g.
`<Language>_Luke-Q1-Cover-A4.odt`). Both bilingual and monolingual output are
supported, matching how lessons behave.

**Why this priority**: This completes the workflow (SOP §22.2–§22.4 become
obsolete), but it depends on Stories 1 and 2 for content to exist.

**Independent Test**: For a language with translated cover strings, download each
format from the language page; open the files and confirm text fields are
translated and filenames follow the convention.

**Acceptance Scenarios**:

1. **Given** a language with translated cover strings, **When** the operator
   downloads the A4 cover for Luke quarter 1, **Then** the file is named
   `<Language>_Luke-Q1-Cover-A4.odt` and contains the translated title, subtitle,
   copyright, and publisher address text.
2. **Given** a bilingual language configuration, **When** a cover is downloaded,
   **Then** the output contains the mother-tongue/majority-language paragraph pairs
   exactly as lessons do; **Given** a monolingual configuration, **Then** the
   output is monolingual, as lessons are.
3. **Given** a language page listing downloadable documents, **When** covers are
   listed, **Then** their download links use human-readable cover names.

---

### User Story 4 - Covers never affect quarter assembly (Priority: P4)

An operator assembles a quarter (feature 007) for a language. Whether or not covers
have been uploaded or translated, the assembled quarter output is exactly the same
as today: covers are never merged into the assembled document, and quarter
completeness is never gated on covers (covers are printed separately in color per
SOP §22.1).

**Why this priority**: This is a protective guarantee rather than new capability,
but it must be explicitly verified because covers now live inside the lesson-number
space that assembly reads.

**Independent Test**: Assemble the same quarter with and without covers present;
confirm identical assembly output and identical completeness reporting.

**Acceptance Scenarios**:

1. **Given** a quarter with all lessons translated and no covers uploaded, **When**
   completeness is evaluated, **Then** the quarter reports complete (covers are not
   missing parts).
2. **Given** the same quarter after covers are uploaded and translated, **When**
   the quarter is assembled, **Then** the assembled output is unchanged from the
   no-covers case and contains no cover content.

---

### Edge Cases

- Cover filename does not match the recognition convention → no pre-selection; the
  operator sets book, series, and format manually via the override controls (same
  pattern as the TOC checkbox today).
- Filename uses the `T` series prefix instead of `Q` (both occur in the real master
  files) → both must be recognized as the same series.
- Re-uploading a cover master for the same (book, series, format) → follows the
  existing English-document re-upload/versioning behavior for lessons; no special
  cover handling.
- Downloading a cover for a language with partially translated cover strings →
  follows the existing lesson-download behavior for untranslated strings; no
  cover-specific rule.
- A language page for a quarter whose covers were never uploaded → no cover
  download links appear for that quarter; lessons and TOC are unaffected.
- Cover text that coincidentally matches unrelated existing English text → shares
  that master string and its translations by design (content-based deduplication);
  accepted trade-off given the small, distinctive cover string set.
- Anywhere lesson numbers are displayed (lists, links, filenames), reserved numbers
  97/98 must render as cover names — a raw "Lesson 97"/"Lesson 98" appearing
  anywhere is a defect.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Covers MUST be modeled as reserved lesson numbers within each
  (book, series): **97 = A4 cover, 98 = A3 cover**, following the TOC = 99
  precedent. No new document-kind entity, no schema migration, and no change to the
  storage abstraction contract.
- **FR-002**: English cover masters MUST be uploadable through the existing
  English-document upload path used for lessons and the TOC.
- **FR-003**: The upload form MUST recognize cover files by filename convention
  (e.g. `English-Luke-Q1-Cover-A4.odt`), accepting both `Q` and `T` as the series
  prefix, and pre-select book, series, and cover format.
- **FR-004**: The upload form MUST provide a manual override for cover detection,
  format, and series when the filename is not recognized or the detection is wrong.
- **FR-005**: Uploading a cover master MUST extract all translatable cover text —
  title, subtitle, copyright line, and publisher address lines — as translatable
  strings, including text styled with the cover masters' actual style names (which
  differ from the style names currently recognized).
- **FR-006**: Where a cover's English text is identical to an existing English
  master string, the existing translations MUST apply automatically through
  content-based string deduplication — no new mapping mechanism.
- **FR-007**: Cover-only strings (copyright line, publisher address lines) MUST be
  translatable once per language in the normal translation UI and MUST remain
  editable afterward as ordinary strings.
- **FR-008**: Both bilingual and monolingual cover output MUST be supported, with
  identical semantics to lesson output.
- **FR-009**: Translated covers MUST be downloadable per (language, book, quarter,
  format) from the language page.
- **FR-010**: Downloaded cover filenames MUST follow the SOP §11 output convention:
  `<Language>_<Book>-Q<quarter>-Cover-<format>.odt` (e.g.
  `Espanol_Luke-Q1-Cover-A4.odt`).
- **FR-011**: Covers MUST display with human-readable names (e.g. "Cover (A4)",
  "Cover (A3)") in all lists, download links, and generated filenames — never as a
  bare reserved lesson number.
- **FR-012**: Covers MUST NOT affect quarter completeness evaluation or the
  assembled-quarter output: a quarter with no covers assembles exactly as today,
  and cover content is never merged into the assembled document.
- **FR-013**: All domain data access for covers MUST go through the existing
  storage abstraction; because covers are lessons with reserved numbers, all
  existing storage implementations MUST work without modification to their
  contracts.

### Key Entities

- **Cover**: A per-(book, series, format) document stored as a lesson with a
  reserved lesson number (97 = A4, 98 = A3). Carries translatable strings like any
  lesson; identified to users by a human-readable cover name, never its number.
- **Cover Format**: One of two physical print formats per quarter — A4 (cut-sheet)
  and A3 (full-spread booklet). Each format is a separate cover document.
- **Cover String**: A translatable text unit extracted from a cover master (title,
  subtitle, copyright line, publisher address line). Shared strings reuse existing
  master strings and their translations; cover-only strings are translated once per
  language.
- **Reserved Lesson Number**: A lesson number outside the real lesson range used
  for non-lesson artifacts within a (book, series): 97 = A4 cover, 98 = A3 cover,
  99 = Table of Contents.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An operator can produce translated A4 and A3 cover documents for a
  language and quarter entirely from the platform, hand-editing zero text fields in
  LibreOffice — SOP §22.2–§22.4 (copy, rename, hand-edit) become obsolete; §22.5
  (PDF export) stays manual.
- **SC-002**: Uploading the 8 English Luke cover masters requires no per-file
  manual metadata entry beyond confirming the auto-detected book/series/format —
  100% of the real master filenames (both `Q` and `T` prefixed) are auto-detected.
- **SC-003**: For a language with a fully translated Table of Contents, a freshly
  uploaded cover shows its shared strings (title, subtitle) already translated with
  zero translator effort.
- **SC-004**: Quarter assembly output and completeness reporting are byte-for-byte
  identical with and without covers present.
- **SC-005**: No surface in the application (lists, links, filenames) ever shows a
  cover as "Lesson 97" or "Lesson 98".

## Assumptions

- The feature branch stacks off `007-assembled-quarter-download` (complete and
  hardened) per the repo's stacked-PR convention.
- The 8 English cover masters for Luke come from the maintainer's Drive copy; test
  fixtures analogous to the existing TOC fixtures will be created from them.
- Content-based string deduplication links identical English text across documents
  to the same master string; FR-006 relies on this and it must be verified early in
  planning (deferred item below).
- Re-upload, versioning, partial-translation download behavior, and desktop
  (Electron) behavior all follow the existing generic lesson pipeline unchanged; no
  cover special-casing.
- No PDF export, no A3 imposition or compression automation, no bundling of covers
  into the assembled quarter, no auto-populated quarter-number text (quarter
  identity lives in per-quarter artwork, not text), and no metadata-driven field
  mapping — all explicitly out of scope per the brainstorm.

### Deferred to Planning (from brainstorm)

- [Affects FR-006] Verify that uploading a document whose English text matches an
  existing master string reuses that master ID (and its translations) rather than
  minting a new string; if not, FR-006 needs a dedup-on-upload adjustment, not a
  mapping layer.
- [Affects FR-005] Exact known-style additions for the cover masters' style names
  (`M.T._20_-_20_Cover_20_Title`/`subtitle` hyphen variants, `Copyright_20_text`,
  `Book_20_number`) and whether non-mother-tongue copyright/address paragraphs
  extract correctly as majority-language strings under existing bilingual pairing
  rules.
- [Affects FR-001/FR-012] Confirm quarter completeness logic ignores extra lesson
  numbers 97/98 without modification, or add an explicit exclusion; confirm the
  document/lesson naming logic covers FR-011.
- [Affects FR-003] Upload filename-recognition handling for the `T` vs `Q`
  series-prefix inconsistency in the real master filenames.

## Clarifications

### Session 2026-07-09

- Q: Use the brainstorm doc `specs/brainstorms/2026-07-09-covers-in-platform-requirements.md` as input for this specification? → A: Yes.
- Q: Which reserved lesson numbers should the spec lock in for covers? → A: 97 = A4, 98 = A3 (as proposed; keeps 99 = TOC as the highest reserved number).
