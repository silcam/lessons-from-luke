# Feature Specification: Auto-Populate Verse-Reference Strings

**Feature Branch**: `011-verse-reference-auto-population`
**Created**: 2026-07-14
**Status**: Draft
**Input**: User description: "WS-4 auto-populate verse-reference strings (split book name + numeric ref), as a new branch off 009-quarter-styles-template"
**Brainstorm**: specs/brainstorms/2026-07-13-verse-reference-auto-population-requirements.md
**Beads Epic**: `lessons-from-luke-2v47`

**Beads Phase Tasks**:

- plan: `lessons-from-luke-2v47.1`
- red-team: `lessons-from-luke-2v47.2`
- tasks: `lessons-from-luke-2v47.3`
- analyze: `lessons-from-luke-2v47.4`
- implement: `lessons-from-luke-2v47.5`
- harden: `lessons-from-luke-2v47.6`

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Verse references pre-fill when a new project is created (Priority: P1)

A translator (or administrator) creates a new project for a language. Every isolated verse
reference in the curriculum — the Table of Contents "Story" column entries and each lesson's
title scripture reference — has its numeric part (e.g. `1:5–25`, `18:35–19:10`) already filled
in from English, without any manual copy/paste. The only remaining work per reference is
translating the book name (`Luke`), which is a single translatable string shared across all
references, so translating it once completes every reference in that language.

**Why this priority**: This is the core value of the feature — eliminating the ~95 manual,
error-prone copy/paste operations per new project that translators routinely miss. It is the
minimum viable slice: normalization at upload plus auto-population at project creation together
deliver the pre-filled experience end to end.

**Independent Test**: Upload an English master, create a new project for a fresh language, and
verify that every numeric reference string is pre-filled verbatim from English while book-name
strings remain empty and translatable. Translating one occurrence of the book name completes
all references in that language.

**Acceptance Scenarios**:

1. **Given** an English master containing isolated verse references, **When** it is uploaded,
   **Then** each isolated reference paragraph is stored as a book-name string plus one or more
   numeric reference strings (e.g. `Luke 9:1–6 Luke 9:10–17` becomes `Luke`, `9:1–6`, `Luke`,
   `9:10–17`).
2. **Given** a normalized English master, **When** a new project is created for a language,
   **Then** every numeric reference string is auto-populated verbatim from English, alongside
   the existing picture/lesson-number auto-population.
3. **Given** a project whose numeric references are auto-populated, **When** the translator
   translates the book name once, **Then** every reference in that language shows the translated
   book name plus the pre-filled numeric part, with no per-reference manual entry.
4. **Given** an auto-populated numeric reference string, **When** the translator inspects it,
   **Then** it is an ordinary editable translation with the same provenance/history recording as
   existing auto-translated strings — not locked and not a special string type.

---

### User Story 2 - Prose containing a reference is never split or auto-filled (Priority: P1)

Translatable prose that happens to contain a verse reference (e.g. `Bible Story: Luke 10:25–37`)
must be left completely intact — never split into book-name and numeric parts, and never
auto-populated. The translator translates the whole sentence as one string, exactly as today.

**Why this priority**: Wrongly splitting or auto-filling prose would corrupt translatable
content and silently degrade the curriculum. Correct, conservative detection is as essential to
the feature's value as the auto-population itself; the two P1 stories together define "done"
for the detection behavior.

**Independent Test**: Upload a master containing both isolated references and prose strings that
embed a reference. Verify that only the isolated references are split/auto-filled and that every
prose string is untouched, using the Q1–Q4 corpus as the benchmark (95 isolated references
matched, 0 of 160 colon-bearing prose strings matched).

**Acceptance Scenarios**:

1. **Given** a paragraph whose entire text is one or more verse references, **When** the master
   is uploaded, **Then** it is normalized (split).
2. **Given** a paragraph where a reference is embedded in surrounding prose, **When** the master
   is uploaded, **Then** it is NOT split and NOT auto-populated — it remains a single translatable
   string.
3. **Given** the Q1–Q4 English Teacher's Guide corpus, **When** normalization runs, **Then**
   exactly the 95 known standalone reference strings (styles `M.T. Table of Contents` and
   `M.T. Text - Lesson Title Scrip Reference`) are matched and 0 of the 160 colon-bearing prose
   strings are matched.

---

### User Story 3 - Documents round-trip identically after normalization (Priority: P1)

When a normalized master (or a translated project built from it) is downloaded or merged, the
resulting document is visually identical to the original — same visible text, styles, and layout.
Splitting a reference into separate strings must not change what a reader sees on the page.

**Why this priority**: Normalization rewrites the source document structure. If round-tripping
altered rendering, it would break the published curriculum and violate the SOP red line against
modifying source presentation. This must hold for the feature to be shippable.

**Independent Test**: Normalize a master, download/merge it, and compare the rendered output to
the original for identical visible text, styles, and layout.

**Acceptance Scenarios**:

1. **Given** a master with isolated references, **When** it is normalized and then
   downloaded/merged, **Then** the rendered document is visually identical to the original.
2. **Given** a translated project built from a normalized master, **When** a lesson is
   downloaded/merged, **Then** the reference renders as the translated book name followed by the
   numeric part with the original spacing, styles, and layout.

---

### User Story 4 - Existing projects backfill missing numeric references without overwriting work (Priority: P2)

An operator runs a one-time re-normalization of all stored English masters, then runs a backfill
so existing in-progress projects receive the numeric reference strings they are missing. The
backfill fills only numeric references that have no translation yet; it never overwrites or
destroys any translation a translator already entered. Where re-normalizing a master changes a
project's strings, the change surfaces through the existing lesson-update-issues flow so
translators can carry over their prior combined-reference work, which remains visible as the
"from" side and is never destroyed.

**Why this priority**: The pain exists in existing in-progress projects too, but new-project
pre-fill (P1) delivers standalone value first. Backfill is a follow-on that extends the benefit
to work already underway. It is separable and independently testable.

**Independent Test**: Take an existing project with some references translated and some blank,
run re-normalization then backfill, and verify only the blank numeric references get filled,
every prior translation is preserved, and changed strings appear in the lesson-update-issues flow.

**Acceptance Scenarios**:

1. **Given** all stored English masters, **When** the operator runs the one-time
   re-normalization task, **Then** each master is re-processed through the normalization +
   lesson-update flow so its references are split, without requiring manual re-uploads.
2. **Given** an existing project with a mix of translated and untranslated references, **When**
   the operator runs the backfill after re-normalization, **Then** every missing numeric
   reference string is filled from English and every string that already has a translation is
   left unchanged.
3. **Given** a language whose master was re-normalized, **When** the translator opens the project,
   **Then** the changed strings appear through the existing lesson-update-issues flow with the
   prior combined-reference translation still visible as the "from" side.
4. **Given** the post-deploy operational sequence, **When** the operator runs it, **Then**
   re-normalization is run first and backfill second.

---

### Edge Cases

- **Multiple references in one paragraph**: `Luke 9:1–6 Luke 9:10–17` splits into `Luke`,
  `9:1–6`, `Luke`, `9:10–17` — the repeated book name deduplicates to a single master string.
- **Chapter-spanning ranges**: `18:35–19:10` is a single numeric reference string, not split
  further.
- **Hyphen vs en-dash**: both `1:5-25` and `1:5–25` are accepted as reference shapes; the
  original character is preserved in the rendered output.
- **Numbered book names** (e.g. `1 Corinthians 2:1–5`): the leading book number is part of the
  book-name string, not treated as a numeric reference; detection must not mistake it for the
  numeric part.
- **Unrecognized reference-like paragraph**: if a paragraph does not clearly match the isolated-
  reference shape, it is left unsplit and untranslated (conservative default — never split when
  in doubt).
- **A numeric reference already translated in a project**: backfill skips it; it is never
  overwritten.
- **Book name already translated**: newly split references in that language inherit the existing
  book-name translation automatically via shared master strings.
- **Re-running the one-time re-normalization or backfill**: re-processing an already-normalized
  master or already-backfilled project produces no destructive change and no duplicate strings.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When an English master document is uploaded, the system MUST normalize paragraphs
  that are isolated verse references so the book name and the numeric reference become separate
  translatable strings (e.g. `Luke` + `1:5–25`).
- **FR-002**: Normalization MUST be book-agnostic — future books (Acts and beyond, including
  numbered books like `1 Corinthians`) MUST split correctly without code changes.
- **FR-003**: A normalized document MUST render identically to the original (same visible text,
  styles, and layout) when downloaded or merged.
- **FR-004**: The system MUST NOT split or auto-populate strings where a verse reference is
  embedded in translatable prose (e.g. `Bible Story: Luke 10:25–37`).
- **FR-005**: When a new project (language) is created, numeric reference strings MUST
  auto-populate verbatim from English, alongside the existing picture/lesson-number
  auto-population.
- **FR-006**: Auto-populated numeric reference strings MUST be ordinary editable translations
  with the same provenance recording as existing auto-translated strings — no locking, no special
  string type.
- **FR-007**: Book-name strings MUST NOT be auto-populated; they are ordinary translatable
  strings. Because identical English text shares one master string, translating a book name once
  MUST complete it across all references in that language.
- **FR-008**: A paragraph MUST qualify as an isolated verse reference by shape, not by a hardcoded
  book list: the entire string is one or more references of the form _optional book word(s) +
  chapter:verse_ with optional verse/chapter ranges, accepting both hyphen and en-dash.
- **FR-009**: When re-normalizing an existing master changes a language's lesson strings, the
  change MUST surface through the existing lesson-update-issues flow, and existing combined-
  reference translations MUST NOT be destroyed (they remain visible as the "from" side).
- **FR-010**: The system MUST provide a manually-run backfill that gives existing projects the
  missing numeric reference strings, skipping any string that already has a translation — never
  overwriting translator work.
- **FR-011**: The system MUST provide a one-time, manually-run administrative task that
  re-processes all stored English master documents through the normalization + lesson-update flow,
  so existing masters gain split references without manual re-uploads.
- **FR-012**: The post-deploy operational sequence MUST be: run the re-normalization task first,
  then run the backfill.
- **FR-013**: The feature MUST NOT modify source-language translation data or destroy translation
  history (SOP §6.2 red line).
- **FR-014**: Re-running the one-time re-normalization task or the backfill MUST be safe — it MUST
  NOT create duplicate strings or destroy existing work.

### Key Entities _(include if feature involves data)_

- **Isolated verse reference**: A paragraph whose entire visible text is one or more verse
  references and nothing else (e.g. `Luke 1:5–25`). Qualifies for normalization and
  auto-population. Contrast with a reference embedded in prose, which does not qualify.
- **Book-name string**: The translatable book-name portion of a normalized reference (e.g.
  `Luke`). An ordinary translatable string; identical text shares one master string, giving
  translate-once propagation. Not auto-populated.
- **Numeric reference string**: The language-neutral chapter:verse portion of a normalized
  reference (e.g. `1:5–25`, `18:35–19:10`). Auto-populated verbatim from English at project
  creation and via backfill; an ordinary editable translation.
- **English master document**: The uploaded source document that is normalized. Its
  source-language data and history are never modified or destroyed by this feature.
- **Lesson-update issue**: The existing mechanism by which a change to an English master surfaces
  to a language's translators so they can carry over prior work; the vehicle for migrating
  existing combined-reference translations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Creating a new project pre-fills 100% of numeric reference strings from English,
  reducing the per-project manual copy/paste of the ~95 isolated references to zero.
- **SC-002**: Translating a book name once completes 100% of the references using that book name
  in the language, with no per-reference manual entry remaining.
- **SC-003**: Across the Q1–Q4 English Teacher's Guide corpus, exactly the 95 known standalone
  reference strings are normalized and 0 of the 160 colon-bearing prose strings are affected
  (100% precision and recall against the benchmark).
- **SC-004**: 100% of normalized documents round-trip visually identical to their originals (same
  visible text, styles, and layout).
- **SC-005**: A backfill run on an existing project fills only the missing numeric references and
  changes 0 already-translated strings (no translator work is overwritten or destroyed).

## Assumptions

- **Platform scope: web/server only.** Normalization at upload, the one-time re-normalization
  task, and the backfill are server-side. Auto-population rides the existing shared auto-translate
  path in the core layer, which the desktop application inherits without desktop-specific work.
  Desktop offline project creation is not a separately in-scope surface for testing or acceptance.
  (Session 2026-07-14 clarification.)
- English master strings match the sample corpus shapes verified against the Q1–Q4 English
  Teacher's Guides on 2026-07-13.
- The post-deploy operational steps (re-normalization task, then backfill) are run manually by an
  operator; this is captured in the acceptance criteria (US4 / FR-011, FR-012).
- This feature is independent of WS-2/WS-3 and parallel-safe per the publishing-automation
  roadmap; it branches off `009-quarter-styles-template`.

### Deferred to Planning

The brainstorm identified the following technical questions to resolve during `/sp:03-plan`; they
do not change feature scope or acceptance behavior:

- Exact span-normalization mechanics: which document span/style construction preserves rendering,
  and where in the upload path the pre-parse rewrite runs (affects FR-001, FR-003).
- Whether to extend the shared auto-translate predicate (also consumed by the update-issue
  filtering) or add a sibling numeric-reference predicate — extending the shared one changes
  update-issue filtering and needs its blast radius checked (affects FR-005, FR-008).
- Exact detection pattern: leading book words including numbered books (`1 Corinthians`), and
  punctuation/whitespace tolerance between multiple references in one paragraph (affects FR-008).
- How the lesson-update-issues diff presents a one-string→multi-string split in practice; verify
  the carry-over experience on a real re-normalized master (affects FR-009).
- Whether the backfill extends the existing manual auto-translate-all mechanism or gets a sibling
  script; the auto-translate pattern is currently duplicated in two files and should be unified
  (affects FR-010).

## Clarifications

### Session 2026-07-14

- Q: What platform scope should this feature target (upload-normalization and project-creation
  auto-population are server-side, but auto-translation also runs in core, which desktop shares)?
  → A: Web/server only. Normalization and backfill are server-only; auto-population rides the
  existing core auto-translate path, which desktop inherits for free without desktop-specific work.
