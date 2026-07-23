# Feature Specification: Automated Quarter-Styles Template Application

**Feature Branch**: `009-quarter-styles-template`
**Created**: 2026-07-11
**Status**: Draft
**Beads Epic**: `lessons-from-luke-uoxq`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-uoxq.1`
- red-team: `lessons-from-luke-uoxq.2`
- tasks: `lessons-from-luke-uoxq.3`
- analyze: `lessons-from-luke-uoxq.4`
- implement: `lessons-from-luke-uoxq.5`
- harden: `lessons-from-luke-uoxq.6`

**Brainstorm**: specs/brainstorms/2026-07-11-quarter-styles-template-requirements.md
**Input**: User description: "Automated quarter-styles template application (WS-2c): every assembled quarter ODT has the quarter styles template applied during assembly, removing the M.T. highlight and making the book print-ready without Chris's manual Load Styles step."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Downloaded quarter book arrives print-styled (Priority: P1)

The publishing operator (Chris) requests an assembled quarter book for a
(language, book, quarter, assembly mode) and downloads the result. The document
he opens already carries the quarter styles template: the mother-tongue
(`M.T.*`) paragraph styles show no background highlight, and the book is ready
for his visual-QA pass without any manual Format → Styles → Load Styles step.

**Why this priority**: This is the entire feature — eliminating the last manual
styling step between "assembled download" and "print-ready book". Without it,
every quarter still requires hand work that the assembled-quarter feature was
built to remove.

**Independent Test**: Assemble a quarter from the existing series-2 test
masters, open/unzip the resulting document, and verify the `M.T.*` paragraph
style definitions carry no background highlight while the document remains a
valid, editable assembled quarter book.

**Acceptance Scenarios**:

1. **Given** a language with a complete quarter of lessons, **When** the
   operator requests an assembled quarter book and the job completes, **Then**
   the delivered document has the quarter styles template applied — in
   particular, no `M.T.*` paragraph style in the document defines a background
   highlight.
2. **Given** the same request, **When** the styled book is delivered, **Then**
   all existing assembled-quarter guarantees still hold: a single clean,
   un-suffixed page-style set; per-lesson footers; continuous pagination with
   per-lesson first-page number suppression; full editability (no protected or
   linked sections); and the book metadata written by finalization.
3. **Given** any (language, book, quarter, assembly mode), **When** a book is
   assembled, **Then** the mode-appropriate template (bilingual or monolingual)
   is always applied — there is no unstyled variant and no user-facing toggle;
   mode selection is automatic, keyed off the assembly's majority-language id.

---

### User Story 2 - Template failure fails the job loudly (Priority: P2)

If the quarter styles template cannot be applied — the asset is missing,
unreadable, or the style-load step errors — the assembly job fails with a
human-readable reason surfaced to the caller, exactly like other assembly
failures. No unstyled book is ever delivered as though it were print-ready.

**Why this priority**: "Partial books are worse than errors" (007 lineage). A
silently unstyled book would be trusted as print-ready and could reach
publication with the working highlight intact.

**Independent Test**: Point the assembly at a missing/unreadable template asset
and verify the job reports failed with a reason, and no result document is
offered for download.

**Acceptance Scenarios**:

1. **Given** the template asset is missing or unreadable, **When** an assembly
   job runs, **Then** the job ends in the failed state with a human-readable
   reason, and no document is delivered.
2. **Given** the style-load step itself errors mid-assembly, **When** the job
   runs, **Then** the same failure behavior applies — the operator never
   receives a book that skipped the template step.

---

### User Story 3 - Swapping in the real template is a file replacement (Priority: P3)

Chris's actual monolingual master files have since been received and ship
directly as the single-language asset; his real bilingual template has not yet
arrived, so bilingual mode still ships a stand-in style source derived from his
hand-assembled reference (`English_Luke-Q2-Master-bilingual.odt`). Whenever a
real file (or an updated master) arrives, a maintainer replaces the shipped
asset file and the next assembled book uses the new styles — no code change
required.

**Why this priority**: Keeps the feature shippable now and makes the real
template a drop-in later. Valuable, but the mechanism (US1) and its failure
mode (US2) come first.

**Independent Test**: Replace the template asset with a different valid style
source, re-run an assembly, and verify the output reflects the new styles
without any code modification.

**Acceptance Scenarios**:

1. **Given** a replacement template file dropped in place of the shipped
   asset, **When** the next assembly job runs, **Then** the output carries the
   replacement's styles, with no code change.
2. **Given** the shipped assets, **When** any quarter is assembled, **Then**
   one and the same global template applies to all languages, books, and
   quarters within an assembly mode — the bilingual asset for bilingual
   assemblies, the monolingual asset for single-language assemblies.

---

### Edge Cases

- Template asset present but not a readable document (corrupt, truncated,
  wrong format): assembly job fails with a reason (US2), never delivers.
- Source masters contain `M.T.*` styles the template does not define: styles
  are mapped by name; any master style not overridden by the template remains
  as authored — the observable guarantee is pinned to the `M.T.*` highlight
  removal, not to exhaustive restyling.
- Template defines page styles: application must not reintroduce duplicated or
  suffixed page styles, and must not break the per-lesson footer/pagination
  behavior established by the assembled-quarter feature.
- Concurrent assembly jobs: template application is per-job and read-only on
  the shared asset; simultaneous jobs must not interfere with each other.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST apply the quarter styles template to every
  assembled quarter book during assembly, before the book is made available
  for download. Application is always-on: there is no user-facing toggle, and
  the template-styled book is the one canonical output per (language, book,
  quarter, assembly mode).
- **FR-002**: With either shipped template (bilingual stand-in or monolingual
  master), the delivered book's `M.T.*` paragraph-style family MUST carry no
  background highlight (the print-readiness effect the template exists to
  deliver, per SOP §16).
- **FR-003**: Template application MUST NOT regress any existing
  assembled-quarter guarantee: single clean un-suffixed page-style set,
  per-lesson footers, continuous pagination with per-lesson first-page number
  suppression, full editability (no protected or linked sections), and the
  book metadata written by finalization.
  <!-- SUPERSEDED by specs/013-quarter-template-full-styles/spec.md FR-008
       (2026-07-23): the mechanism for honoring this guarantee changed from
       "skip loading page/frame/numbering styles" to "load all style families
       with overwrite, relying on the template's own master pages to carry the
       correct footers/pagination." The guarantee itself (no regression) is
       carried forward as 013 FR-004/FR-005, re-verified by 013's integration
       tests; added by sp:06-analyze cross-artifact fix. -->
- **FR-004**: If the template step fails — asset missing, unreadable, or the
  style-load errors — the assembly job MUST fail with a human-readable reason
  surfaced to the caller, and no document may be delivered. An unstyled book
  is never presented as print-ready.
- **FR-005**: The quarter styles template MUST be a swappable application
  asset: replacing the asset file changes the applied styles with no code
  change. The template is selected by assembly mode — one asset for bilingual
  assemblies and one for single-language (monolingual) assemblies — each a
  single global asset applying to all languages, books, and quarters within
  its mode. Mode selection keys off the majority-translation language id
  (`0` == single-language), which is already available at the assembly call
  site; no per-quarter or per-book variants exist.
- **FR-006**: The system MUST ship a committed style source per assembly mode.
  For single-language mode the operator's real monolingual master has arrived
  and is shipped directly (`assets/quarter-styles-template-monolingual.odt`,
  from `English_Luke-Q4-Master-monolingual.odt`). For bilingual mode, until the
  operator's real bilingual template is received, the system ships a stand-in
  style source derived from the hand-assembled reference
  (`test/docs/references/English_Luke-Q2-Master-bilingual.odt`). Any real file
  MUST remain usable as a drop-in replacement (per FR-005).

### Key Entities

- **Quarter styles template**: A global, swappable application asset — a style
  source document whose named styles are applied onto every assembled quarter
  book during assembly. Ships as two mode-keyed assets: a bilingual template
  (`quarter-styles-template.odt`) for bilingual assemblies and a monolingual
  template (`quarter-styles-template-monolingual.odt`) for single-language
  assemblies. The assembly picks one by the majority-language id; neither is
  user-managed.
- **Assembled quarter book** (existing): The deliverable of feature 007; this
  feature changes its styling (template applied) but none of its structural
  guarantees.
- **Assembly job** (existing): Gains one new failure cause — template
  application failure — reported through its existing failed-with-reason state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The operator performs zero manual styling steps (no Load Styles,
  no highlight removal) between downloading an assembled quarter book and
  starting visual QA — down from one mandatory manual pass per book today.
- **SC-002**: 100% of delivered assembled quarter books have the template
  applied; zero unstyled books are ever delivered (failures surface as failed
  jobs with a reason).
- **SC-003**: In every delivered book, no `M.T.*` paragraph style defines a
  background highlight.
- **SC-004**: Rendered-output parity with the pre-template assembled quarter
  on pagination, footers, page-style cleanliness, and editability — the
  existing assembled-quarter verification checks continue to pass unchanged in
  what they assert.
- **SC-005**: Swapping the template asset for the real file requires zero code
  changes — file replacement only.

## Assumptions

- The operator's real template maps styles by name onto the same style
  families the source masters use (confirmed by his report of applying it by
  hand via Load Styles).
- The bilingual stand-in derived from the Q2 reference master is acceptable to
  ship; the real monolingual masters have since arrived and ship directly for
  single-language mode. Requesting the real bilingual template from Chris
  remains a non-blocking, long-lead item tracked outside this feature.
- The template asset is a build/deploy-time artifact, so its absence is a
  deployment bug — justifying fail-the-job (FR-004) rather than graceful
  degradation.

### Deferred to Planning (from brainstorm)

- Stand-in form: point style loading at the Q2 reference master directly vs.
  extracting a cleaned template document from it. [Affects FR-002/FR-006]
- Which style-family load options to use so template styles win without
  clobbering the assembled book's page-style set and footers. [Affects FR-003]
- Verify style loading is orthogonal to the outline-numbering patch and the
  metadata written by finalization, and that pagination parity holds after
  template application (roadmap flags this for spike verification). [Affects
  FR-003]
- Where the template asset lives in the deployed tree and whether its presence
  is validated at startup vs. per-job. [Affects FR-004]

## Scope Boundaries

**Out of scope:**

- UI changes of any kind: no working-vs-print-ready toggle, no template upload
  or admin management screen. The asset ships with the application.
- Per-language, per-book, or RTL template variants (deliberately deferred;
  cheap to add later if ever needed).
- PDF export (WS-2d: won't do).
- Per-lesson download endpoints and the translation interface.

## Clarifications

### Session 2026-07-11

- Q: Should WS-2c be a new feature spec or extend the existing
  007-assembled-quarter-download feature? → A: New feature based off the 007
  branch, numbered 009 (008 is a separate covers feature).
