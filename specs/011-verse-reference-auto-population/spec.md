# Feature Specification: Auto-Populate Verse-Reference Strings

**Feature Branch**: `011-verse-reference-auto-population`
**Created**: 2026-07-14
**Revised**: 2026-07-14 (amendment — full-corpus ground-truth measurement corrected the mechanism, styles, and magnitudes; see Clarifications)
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

> **Amendment note (2026-07-14):** A full-corpus measurement of all 67 English master
> documents established that the book name and numeric reference are already stored as
> **separate text runs** (split by an ODT space element) for the large majority of
> references — so the parser already emits the numeric part (e.g. `1:5–25`) as its own
> translatable string. The feature therefore centers on **recognizing** those numeric
> strings as auto-populatable (no document mutation), with a **narrow splitter** only for
> the residual references still stored as a single unsplit run. This supersedes the earlier
> framing in which an at-upload span-rewrite was the mechanism for _all_ references. The
> just-completed `plan.md` red-team hardening was written against the superseded framing and
> must be regenerated via `/sp:03-plan`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Verse references pre-fill when a new project is created (Priority: P1)

A translator (or administrator) creates a new project for a language. Every isolated verse
reference in the curriculum — the Table of Contents entries, each lesson's title scripture
reference, and the matching sub-headings — has its numeric part (e.g. `1:5–25`, `18:35–19:10`)
already filled in from English, without any manual copy/paste. The only remaining work per
reference is translating the book name (`Luke`), which is a single translatable string shared
across all references, so translating it once completes every reference in that language.

**Why this priority**: This is the core value of the feature — eliminating the many manual,
error-prone copy/paste operations per new project that translators routinely miss. It is the
minimum viable slice: recognizing numeric references as auto-populatable delivers the pre-filled
experience end to end for the references the parser already splits (the large majority).

**Independent Test**: Upload an English master, create a new project for a fresh language, and
verify that every numeric reference string is pre-filled verbatim from English while book-name
strings remain empty and translatable. Translating one occurrence of the book name completes all
references in that language.

**Acceptance Scenarios**:

1. **Given** an English master whose reference paragraphs are stored with the book name and the
   numeric part as separate text runs, **When** a new project is created for a language, **Then**
   every numeric reference string is auto-populated verbatim from English, alongside the existing
   picture/lesson-number auto-population.
2. **Given** a numeric reference string that differs only by trailing whitespace or by dash
   character (`1:5–25` vs `1:5-25`), **When** the project is created, **Then** each such string is
   still recognized and auto-populated (recognition trims whitespace and accepts both hyphen and
   en-dash).
3. **Given** a project whose numeric references are auto-populated, **When** the translator
   translates the book name once, **Then** every reference in that language shows the translated
   book name plus the pre-filled numeric part, with no per-reference manual entry.
4. **Given** an auto-populated numeric reference string, **When** the translator inspects it,
   **Then** it is an ordinary editable translation with the same provenance/history recording as
   existing auto-translated strings — not locked and not a special string type.

---

### User Story 2 - Prose and non-references are never auto-filled (Priority: P1)

Translatable prose that happens to contain a verse reference (e.g. `Bible Story: Luke 10:25–37`)
must be left completely intact — never auto-populated. Likewise, no non-reference string may be
mistaken for a reference. The translator translates the whole sentence as one string, exactly as
today.

**Why this priority**: Wrongly auto-filling prose or a non-reference would corrupt translatable
content and silently degrade the curriculum. Correct, conservative recognition is as essential to
the feature's value as the auto-population itself; the two P1 stories together define "done" for
the recognition behavior.

**Independent Test**: Upload a master containing both isolated references and prose strings that
embed a reference. Verify that only standalone numeric-reference strings are auto-filled and that
every prose string is untouched, using the Q1–Q4 corpus as the benchmark (all standalone
numeric-reference masters matched; 0 prose paragraphs affected).

**Acceptance Scenarios**:

1. **Given** a paragraph where a reference is embedded in surrounding prose, **When** a project is
   created, **Then** the prose string is NOT auto-populated — it remains a single translatable
   string. (Structurally, the embedded numeric is part of the longer prose run and is never a
   standalone master, so recognition cannot reach it.)
2. **Given** the Q1–Q4 English Teacher's Guide corpus, **When** recognition runs, **Then** every
   standalone numeric-reference master is matched and 0 prose paragraphs are affected — the
   benchmark reference set is derived by extraction from the corpus, not from a hardcoded count.
3. **Given** the corpus contains no standalone numeric string that is not a real scripture
   reference, **When** recognition runs, **Then** it produces 0 false positives on the corpus.

---

### User Story 3 - Splitting the residual unsplit references round-trips identically (Priority: P2)

A small number of references are still stored as a single unsplit run (book name and numeric part
in one text run, e.g. `Luke 1:26–38` or the spaced-dash variant `Luke 1:26 – 38`), all in
source-language title/sub-heading styles. A targeted splitter converts these into a separate
book-name run and numeric run so the numeric becomes its own auto-populatable string. When a
document touched by the splitter is downloaded or merged, it renders visually identical to the
original.

**Why this priority**: The splitter is a narrow completion step — it extends auto-population to the
residual unsplit references, but the primary value (P1) lands without it for the references the
parser already splits. Because the splitter is the only part of the feature that mutates a
document, its round-trip fidelity is the hard safety gate for that mutation.

**Independent Test**: Take a master containing an unsplit reference run, run the splitter, then
download/merge and compare the rendered output to the original for identical visible text, styles,
and layout. Run the splitter a second time and confirm no further change.

**Acceptance Scenarios**:

1. **Given** a reference stored as a single unsplit run, **When** the splitter runs, **Then** it is
   split into a book-name run and a numeric run, and the numeric part becomes its own master string.
2. **Given** a document the splitter has modified, **When** it is downloaded or merged, **Then** the
   rendered document is visually identical to the original (same visible text, styles, spacing, and
   layout).
3. **Given** an already-split (or already-processed) master, **When** the splitter runs again,
   **Then** it makes no change and creates no duplicate strings — the operation is idempotent.
4. **Given** the splitter writes the document, **When** the write occurs, **Then** it is written
   atomically (no partially-written master is ever observable).

---

### User Story 4 - Existing projects backfill missing numeric references without overwriting work (Priority: P2)

An operator runs a one-time re-processing of all stored English masters (running the splitter over
each), then runs a backfill so existing in-progress projects receive the numeric reference strings
they are missing. The backfill fills only numeric references that have no translation yet; it never
overwrites or destroys any translation a translator already entered. Where re-processing a master
changes a project's strings, the change surfaces through the existing lesson-update-issues flow so
translators can carry over their prior combined-reference work, which remains visible as the "from"
side and is never destroyed.

**Why this priority**: The pain exists in existing in-progress projects too, but new-project
pre-fill (P1) delivers standalone value first. Backfill is a follow-on that extends the benefit to
work already underway. It is separable and independently testable.

**Independent Test**: Take an existing project with some references translated and some blank, run
re-processing then backfill, and verify only the blank numeric references get filled, every prior
translation is preserved, and changed strings appear in the lesson-update-issues flow.

**Acceptance Scenarios**:

1. **Given** all stored English masters, **When** the operator runs the one-time re-processing task,
   **Then** each master is run through the splitter + lesson-update flow so any residual unsplit
   references are split, without requiring manual re-uploads.
2. **Given** an existing project with a mix of translated and untranslated references, **When** the
   operator runs the backfill after re-processing, **Then** every missing numeric reference string
   is filled from English and every string that already has a translation is left unchanged.
3. **Given** a language whose master was re-processed, **When** the translator opens the project,
   **Then** the changed strings appear through the existing lesson-update-issues flow with the prior
   combined-reference translation still visible as the "from" side.
4. **Given** the post-deploy operational sequence, **When** the operator runs it, **Then**
   re-processing is run first and backfill second.

---

### Edge Cases

- **Multiple references in one paragraph**: where a paragraph holds more than one reference, each
  numeric part is its own string; a repeated book name deduplicates to a single master string.
- **Chapter-spanning ranges**: `18:35–19:10` is a single numeric reference string, not split
  further. All references in the current corpus are ranges (no bare single verses, comma-lists, or
  em-dashes were found).
- **Hyphen vs en-dash**: both `1:5-25` and `1:5–25` are accepted as reference shapes and recognized
  for auto-population; the original character is preserved in the rendered output. The same
  reference stored with different dash characters yields distinct master strings, and each is
  auto-populated independently.
- **Trailing/leading whitespace**: recognition trims whitespace before matching, so `1:5–25` and
  `1:5–25 ` are both recognized (they are stored as distinct masters but both auto-populate).
- **Numbered book names** (e.g. `1 Corinthians 2:1–5`): the leading book number is part of the
  book-name run, not the numeric reference; the splitter must not mistake it for the numeric part.
- **Standalone non-reference numeric (future risk)**: a standalone numeric string that merely looks
  like a reference (e.g. a time `3:00`) would be recognized and auto-populated. The current corpus
  contains zero such standalone strings, and this residual risk is explicitly accepted in favor of
  the simpler text-shape recognizer (see Assumptions).
- **A numeric reference already translated in a project**: backfill skips it; it is never
  overwritten.
- **Book name already translated**: newly recognized/split references in that language inherit the
  existing book-name translation automatically via shared master strings.
- **Re-running the one-time re-processing or backfill**: re-processing an already-split master or
  already-backfilled project produces no destructive change and no duplicate strings.

## Requirements _(mandatory)_

### Functional Requirements

**Mechanism 1 — Recognize and auto-populate numeric references (no document mutation)**

- **FR-001**: When a new project (language) is created, numeric reference strings MUST auto-populate
  verbatim from English, alongside the existing picture/lesson-number auto-population.
- **FR-002**: A master string MUST qualify as an auto-populatable numeric reference by **text shape,
  not by a hardcoded book list**: its trimmed text is a chapter:verse reference with a range
  (verse range or cross-chapter range). Recognition MUST trim leading/trailing whitespace before
  matching and MUST accept both hyphen (`-`) and en-dash (`–`) as the range separator.
- **FR-003**: Auto-populated numeric reference strings MUST be ordinary editable translations with
  the same provenance recording as existing auto-translated strings — no locking, no special string
  type.
- **FR-004**: Book-name strings MUST NOT be auto-populated; they are ordinary translatable strings.
  Because identical English text shares one master string, translating a book name once MUST
  complete it across all references in that language.
- **FR-005**: Recognition MUST NOT auto-populate a verse reference embedded in translatable prose
  (e.g. `Bible Story: Luke 10:25–37`). This holds structurally: an embedded reference is part of a
  longer run and is never a standalone master, so a text-shape recognizer over master strings cannot
  reach it.

**Mechanism 2 — Split the residual unsplit references (document mutation, narrow)**

- **FR-006**: When an English master is uploaded (and during the one-time re-processing task), any
  reference stored as a **single unsplit run** (book name + numeric part in one text run, including
  the spaced-dash variant) MUST be split into a book-name run and a numeric run, so the numeric part
  becomes its own master string that flows into Mechanism 1. Most references already arrive split
  from the parser; the splitter handles only the residual unsplit ones.
- **FR-007**: The splitter MUST be book-agnostic — future books (Acts and beyond, including numbered
  books like `1 Corinthians`) MUST split correctly without code changes.
- **FR-008**: A document modified by the splitter MUST render identically to the original (same
  visible text, styles, spacing, and layout) when downloaded or merged.
- **FR-009**: The splitter MUST be idempotent (re-processing an already-split master makes no change
  and creates no duplicate strings) and MUST write the document atomically (no partially-written
  master is ever observable).

**Safety, migration, and operational sequence**

- **FR-010**: When re-processing an existing master changes a language's lesson strings, the change
  MUST surface through the existing lesson-update-issues flow, and existing combined-reference
  translations MUST NOT be destroyed (they remain visible as the "from" side).
- **FR-011**: The system MUST provide a manually-run backfill that gives existing projects the
  missing numeric reference strings, skipping any string that already has a translation — never
  overwriting translator work.
- **FR-012**: The system MUST provide a one-time, manually-run administrative task that re-processes
  all stored English master documents through the splitter + lesson-update flow, so existing masters
  gain split references without manual re-uploads.
- **FR-013**: The post-deploy operational sequence MUST be: run the re-processing task first, then
  run the backfill.
- **FR-014**: The feature MUST NOT modify source-language translation data or destroy translation
  history (SOP §6.2 red line). Splitting an unsplit run changes document structure only; visible
  rendering (FR-008) and translation data/history are preserved.
- **FR-015**: Re-running the one-time re-processing task or the backfill MUST be safe — it MUST NOT
  create duplicate strings or destroy existing work.

**Recognition precision (empirical invariant)**

- **FR-016**: Recognition relies on the measured corpus invariant that **every standalone
  numeric-reference-shaped master is a real scripture reference** (zero standalone non-reference
  numerics exist in the corpus). Recognition therefore uses text shape alone, with **no** parse-time
  book-name-adjacency guard. The accepted residual risk is that a future document introducing a
  standalone reference-shaped non-reference (e.g. a time `3:00`) would be auto-populated; this
  tradeoff is deliberately accepted in favor of simplicity.

### Key Entities _(include if feature involves data)_

- **Numeric reference string**: The language-neutral chapter:verse portion of a reference (e.g.
  `1:5–25`, `18:35–19:10`), stored as its own master string. Auto-populated verbatim from English at
  project creation and via backfill; an ordinary editable translation. Recognized by trimmed text
  shape.
- **Book-name string**: The translatable book-name portion of a reference (e.g. `Luke`). An ordinary
  translatable string; identical text shares one master string, giving translate-once propagation.
  Not auto-populated.
- **Reference-bearing style**: An ODT paragraph style under which isolated references appear. The
  corpus uses four: `M.T. Text - Lesson Title Scrip Reference`, `Sub-Head 1`, `M.T. Table of
Contents`, and the source-language `Lesson Title Scrip Reference`.
- **Unsplit reference run**: A reference still stored as a single text run containing both book name
  and numeric part (e.g. `Luke 1:26–38`). The splitter (Mechanism 2) targets these.
- **English master document**: The uploaded source document. Its source-language translation data and
  history are never modified or destroyed by this feature; only run structure of unsplit references
  is changed, and rendering is preserved.
- **Lesson-update issue**: The existing mechanism by which a change to an English master surfaces to a
  language's translators so they can carry over prior work; the vehicle for migrating existing
  combined-reference translations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Creating a new project pre-fills 100% of numeric reference strings from English,
  reducing the per-project manual copy/paste of the isolated references to zero.
- **SC-002**: Translating a book name once completes 100% of the references using that book name in
  the language, with no per-reference manual entry remaining.
- **SC-003**: Across the Q1–Q4 English Teacher's Guide corpus, 100% of the standalone
  numeric-reference masters are recognized and auto-populated, and 0 prose paragraphs are affected
  (100% precision and recall). The benchmark reference set — the reference-bearing paragraphs across
  the four reference styles and their distinct numeric tokens — MUST be derived by extraction from
  the corpus at test time, not asserted as a hardcoded literal count.
- **SC-004**: 100% of documents modified by the splitter round-trip visually identical to their
  originals (same visible text, styles, spacing, and layout).
- **SC-005**: A backfill run on an existing project fills only the missing numeric references and
  changes 0 already-translated strings (no translator work is overwritten or destroyed).
- **SC-006**: Recognition produces 0 false positives against the corpus (no non-reference standalone
  master is auto-populated), verified by extraction over the corpus.

## Assumptions

- **Platform scope: web/server only.** The splitter, the one-time re-processing task, and the
  backfill are server-side. Auto-population rides the existing shared auto-translate path in the core
  layer, which the desktop application inherits without desktop-specific work. Desktop offline
  project creation is not a separately in-scope surface for testing or acceptance. (Session
  2026-07-14 clarification.)
- **Corpus measurement is authoritative.** The mechanism, style list, and magnitudes are grounded in
  a full-corpus measurement of all 67 English master documents (2026-07-14): references appear under
  four styles; ~141 reference paragraphs already store the numeric part as a separate run (156 token
  occurrences, 50 distinct trimmed numeric references, all ranges); ~15 references remain as a single
  unsplit run, all in source-language title/sub-head styles; 49 of 50 distinct numeric masters are
  shared across styles (one population fills every occurrence); there are zero standalone
  non-reference numerics and zero reference↔prose master collisions.
- **Accepted recognition risk.** Recognition uses text shape alone (no book-name-adjacency guard).
  The residual risk — a future document introducing a standalone reference-shaped non-reference such
  as a time `3:00` — is explicitly accepted in favor of simplicity (FR-016). Revisit only if such a
  string is ever observed in the corpus.
- **Superseded design elements.** The earlier broad at-upload span-rewrite as _the_ mechanism for all
  references, the style-aware `3:00` log guard, and the "no-op byte-identical" clause on the upload
  path are moot under this corrected scope and must not be carried into the regenerated plan.
- This feature is independent of WS-2/WS-3 and parallel-safe per the publishing-automation roadmap;
  it branches off `009-quarter-styles-template`.

### Deferred to Planning

The following technical questions are resolved during `/sp:03-plan`; they do not change feature scope
or acceptance behavior:

- Exact recognizer placement: whether to extend the shared auto-translate predicate (also consumed by
  the update-issue filtering) or add a sibling numeric-reference predicate — extending the shared one
  changes update-issue filtering and needs its blast radius checked (affects FR-001, FR-002).
- Exact splitter mechanics for the unsplit runs: which run/style construction preserves rendering,
  handles the spaced-dash variant, and where in the upload path the pre-parse rewrite runs (affects
  FR-006, FR-008, FR-009).
- The precise text-shape pattern for recognition and for the splitter's book/numeric boundary,
  including numbered books (`1 Corinthians`) and dash/whitespace tolerance (affects FR-002, FR-007).
- How the lesson-update-issues diff presents a one-string→multi-string split in practice; verify the
  carry-over experience on a real re-processed master (affects FR-010).
- Whether the backfill extends the existing manual auto-translate-all mechanism or gets a sibling
  script; the auto-translate pattern is currently duplicated in two files and should be unified
  (affects FR-011).

## Clarifications

### Session 2026-07-14 (amendment)

- Q: The corpus was re-measured in full. What is the actual mechanism — an at-upload span-rewrite
  that produces all references, or something already present? → A: The parser already stores the book
  name and numeric part as separate runs for ~141 of the reference paragraphs, so the numeric is
  already its own master. The feature centers on recognizing those numeric masters as
  auto-populatable; only ~15 residual unsplit references (all in source-language styles) need a
  narrow splitter.
- Q: How should recognition decide a numeric master is an auto-translatable verse reference —
  text-shape only, or text-shape plus a parse-time book-name-adjacency guard? → A: Text-shape only.
  Zero standalone non-reference numerics exist in the corpus, so a text-shape recognizer has zero
  measured false positives; the simpler approach is chosen and the future `3:00`-style risk is
  accepted (FR-016).
- Q: The ~15 references stored as a single unsplit run (all in source-language styles) — leave them
  out of scope or handle them? → A: Handle them, via a narrow splitter (Mechanism 2) that splits the
  run so the numeric becomes its own master and flows into Mechanism 1. The splitter is idempotent
  and writes atomically.
- Q: Reference-bearing styles and magnitudes? → A: Four styles (`M.T. Text - Lesson Title Scrip
Reference`, `Sub-Head 1`, `M.T. Table of Contents`, `Lesson Title Scrip Reference`), not two.
  ~141 reference paragraphs / 156 token occurrences / 50 distinct trimmed references, all ranges. The
  SC-003 benchmark is derived by extraction from the corpus, not hardcoded.

### Session 2026-07-14

- Q: What platform scope should this feature target (upload-side work is server-side, but
  auto-translation also runs in core, which desktop shares)? → A: Web/server only. Splitter and
  backfill are server-only; auto-population rides the existing core auto-translate path, which desktop
  inherits for free without desktop-specific work.
