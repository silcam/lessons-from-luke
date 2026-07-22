# Phase 0 Research: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Date**: 2026-07-14
**Framing**: Two-mechanism model (per the 2026-07-14 spec amendment). This
document is regenerated from scratch against the amended spec; the superseded
"span-rewrite as the mechanism for all references" framing, the two-style
corpus counts, the `3:00` style-aware log guard, and the "no-op byte-identical
upload" clause are moot and are **not** carried forward.

This document resolves every "Deferred to Planning" question from the amended
spec with evidence from the codebase. Each decision is grounded in the existing
upload → parse → merge → auto-translate pipeline so the plan does not
manufacture confidence (Zeroth Principle).

## Pipeline facts established by code reading (framing-independent — still valid)

- **Upload (English master)**: `documentsController` → `uploadEnglishDoc`
  (`src/server/actions/uploadDocument.ts`) → `docStorage.saveDoc` persists the
  uploaded `.odt`, then `parseDocStrings` (`updateLesson.ts`) unzips and calls
  `parse()` per `content|meta|styles` xml, then `saveDocStrings` maps each
  `DocString` to a master string via `addOrFindMasterStrings` (identical text →
  one master id) and writes `lessonStrings` (bumping `version`).
- **Parse** (`src/server/xml/parse.ts`): finds styled `text:p`/`text:h` nodes,
  then recurses to **text nodes**, emitting one `DocString` per non-whitespace
  text node with `xpath = node.path()` and **trimmed** text. A whitespace-only
  text node yields nothing. **Key consequence**: a paragraph whose book name and
  numeric part are two separate text runs (split by an ODT `<text:s/>` space
  element) already emits `Luke` and `1:5–25` as two independent `DocString`s.
- **Merge** (`src/server/xml/mergeXml.ts`): reads the **persisted source odt**,
  looks up each `xpath`, and replaces the trimmed element text with the
  translation. Round-trip identity depends on parse and merge running against
  the **same** persisted odt structure.
- **Auto-translate on project create**: `languagesController` POST
  `/api/admin/languages` → `defaultTranslations(storage, languageId)`
  (`src/server/actions/defaultTranslations.ts`) copies every English master
  string where `canAutoTranslate(text)` is true into the new language verbatim,
  recording `source`/`sourceLanguageId` provenance.
- **`canAutoTranslate`** (`defaultTranslations.ts`): `/^[\d–\-[\]()\s]*$/` —
  digits, dashes, brackets, whitespace only. The **colon is excluded**, which is
  exactly why numeric references (`1:5–25`) are not auto-populated today. The
  identical predicate is **duplicated** verbatim as `shouldAutoTranslate` in
  `src/server/tasks/defaultTranslateAll.ts` (the existing backfill script).
- **Update-issues flow** (FR-010 trigger): `lessonsController` GET
  `/api/admin/lessons/:lessonId/lessonUpdateIssues` → `findTSubs`
  (`src/server/actions/findTSubs.ts`). It diffs the current lesson strings
  against the previous version (`oldLessonStrings(lessonId, version-1)`) and
  keeps a sub only if its English "from" side contains at least one
  **non-auto-translatable** string: `usefulEngSub` requires
  `engFrom.some(tStr => tStr && !canAutoTranslate(tStr.text))`.
- **Existing manual maintenance scripts** (the precedents this feature extends):
  - `src/server/tasks/defaultTranslateAll.ts` — backfills auto-translatable
    strings into every existing language, skipping masters a language already
    has. Run manually on the server.
  - `src/server/tasks/reparseEnglish.ts` — copies each stored master to a new
    version, re-parses, and `saveDocStrings`, driving the version bump that the
    update-issues flow diffs against. Run manually when a parse change requires
    reprocessing existing masters.

## Corpus ground truth (authoritative — from the amended spec)

The amended spec's magnitudes come from a full-corpus measurement of all 67
English master documents (2026-07-14) and **supersede** the brainstorm's
"95 refs / 160 prose / 2 styles" and the earlier research's "96 paragraphs /
2 styles". Use only these numbers:

- References appear under **four** styles: `M.T. Text - Lesson Title Scrip
Reference`, `Sub-Head 1`, `M.T. Table of Contents`, and the source-language
  `Lesson Title Scrip Reference`.
- **~141 reference paragraphs** already store the numeric part as a **separate
  run** (156 token occurrences, **50 distinct** trimmed numeric references, all
  ranges).
- **~15 references** remain as a single **unsplit** run (book + numeric in one
  text run), all in source-language title/sub-head styles.
- **49 of 50** distinct numeric masters are shared across styles (translate/
  populate once fills every occurrence).
- **Zero** standalone non-reference numerics; **zero** reference↔prose master
  collisions.

The SC-003 benchmark reference set MUST be derived by **extraction from the
corpus at test time** (reference-bearing paragraphs across the four styles and
their distinct numeric tokens), never asserted as a hardcoded literal count.

## Decision 1 — Recognizer placement: extend shared `canAutoTranslate` (FR-001, FR-002)

**Decision**: Extend the single shared predicate `canAutoTranslate`
(`defaultTranslations.ts`) to additionally accept a **numeric verse-reference
range shape**, and **unify** the duplicated `shouldAutoTranslate` in
`defaultTranslateAll.ts` to import the same function (removing the copy). Do
**not** introduce a sibling predicate.

**Rationale**:

- `canAutoTranslate` is the one place the auto-translate decision lives; it is
  consumed by both the new-project path (`defaultTranslations`) and the
  update-issue filter (`findTSubs.usefulEngSub`). Extending it delivers FR-001
  (new-project pre-fill) and the backfill (FR-011) from a single change, and
  removing the duplicate satisfies the spec's "unify the duplicated predicate"
  note and the DRY principle.
- **Blast-radius check on `usefulEngSub` (FR-010)** — verified against the code:
  when a residual unsplit reference `Luke 1:26–38` is split (Mechanism 2), the
  update-issue "from" side is the **old combined master** `Luke 1:26–38`, whose
  text contains letters and is therefore **never** auto-translatable regardless
  of the predicate change. `usefulEngSub`'s `some(... !canAutoTranslate ...)`
  stays true, so the split still surfaces as a lesson-update issue and the prior
  combined-reference translation remains visible as the "from" side. Making the
  numeric part (`1:26–38`) auto-translatable does not suppress the sub. FR-010 is
  preserved.
- For references the parser **already** splits, there is no version bump / diff —
  the numeric master simply becomes auto-translatable, so new projects and the
  backfill pick it up. No update-issue is generated (nor needed) for those.

**Alternatives considered**:

- _Sibling numeric-reference predicate_ used only by `defaultTranslations`:
  rejected. It would leave `findTSubs` unaware that numeric references are now
  auto-translatable and, worse, fork the auto-translate decision into two
  divergent definitions — the exact duplication the spec asks to remove.

## Decision 2 — Recognizer shape (FR-002, FR-007, FR-016)

**Decision**: A trimmed master string qualifies as an auto-populatable numeric
reference when, after trimming leading/trailing whitespace, it matches a
**chapter:verse reference with a range separator**: `chapter:verse`, then a
hyphen (`-`) or en-dash (`–`), then either a bare end verse or a cross-chapter
`chapter:verse` end. Concretely (illustrative, to be finalized in
implementation): `^\d+:\d+\s*[-–]\s*\d+(?::\d+)?$`.

**Rationale**:

- FR-002 requires a **range** (verse range or cross-chapter range); the corpus
  contains only ranges (no bare single verses, comma-lists, or em-dashes). A
  range separator is therefore part of the shape, and a bare `chapter:verse`
  with no range is **not** matched. This is deliberately narrower than "add a
  colon to the existing predicate".
- Accepting both hyphen and en-dash, and trimming first, satisfies the
  hyphen/en-dash and whitespace edge cases (US1 scenario 2). The **original**
  dash character is preserved in the stored master text and in rendering; two
  masters differing only by dash character remain distinct and each
  auto-populates independently.
- **Text-shape only, no book-name-adjacency guard** (FR-016): the measured
  corpus invariant is that every standalone numeric-reference-shaped master is a
  real scripture reference (zero standalone non-reference numerics), so a
  shape-only recognizer has zero measured false positives. The residual `3:00`
  time risk is explicitly accepted; note that `3:00` has **no range separator**
  and so would **not** match FR-002's shape anyway — implement FR-002's shape as
  written and do not try to reconcile the spec's illustrative `3:00` example
  against it.
- Book-agnostic (FR-007): because recognition keys on the **numeric** part only
  and never on a book list, Acts and numbered books (`1 Corinthians`) need no
  code change — the book number/name is a separate run and is never matched.

**Alternatives considered**:

- _Reuse the existing `/^[\d–\-[\]()\s]_$/` by just permitting a colon\*:
  rejected. It would match non-range colon strings (times, ratios) and does not
  express the required range shape; FR-002 wants a range specifically.

## Decision 3 — Splitter mechanics for the residual unsplit runs (FR-006, FR-008, FR-009)

**Decision**: Add a narrow, **pre-parse** content.xml rewrite that runs on the
persisted master before `parseDocStrings`, targeting only paragraphs in the
reference-bearing styles whose text run is a **single unsplit reference**
(`<book words> <chapter:verse range>`, including the spaced-dash variant
`Luke 1:26 – 38`). It splits the single text run into a book-name run + an ODT
space element (`<text:s/>`) + a numeric run, matching the structure the parser
already emits for the majority. The book/numeric boundary is the **whitespace
immediately preceding the `chapter:verse` numeric token**, so a leading book
number (`1 Corinthians`) stays with the book-name run (FR-007). The rewrite is a
no-op when the paragraph is already split (idempotent, FR-009) and the document
is written **atomically** (write to a temp path, then rename) so no
partially-written master is ever observable (FR-009).

**Rationale**:

- Splitting **before** parse means the parser's existing "one DocString per
  non-whitespace text run" behavior does the rest: the numeric becomes its own
  master string and flows into Mechanism 1 with no parser or merge change.
- Reproducing the exact run structure the parser already handles for ~141
  paragraphs (book run + `<text:s/>` + numeric run) is what makes the modified
  document render identically (FR-008): the visible text, styles, and the single
  space between book and numeric are all preserved. LibreOffice `soffice
--headless` round-trip is the honest verification layer for FR-008/SC-004
  (constitution Principle I, document-processing integration tests).
- Idempotency is structural: the splitter only fires on a **single** reference
  run and leaves an already-split paragraph untouched, so re-running the
  one-time re-processing task creates no duplicate strings (FR-009, FR-015).

**Alternatives considered**:

- _Post-parse DocString splitting_ (split the `Luke 1:26–38` DocString into two
  DocStrings): rejected. `mergeXml` looks up each DocString by `xpath` against
  the persisted odt; two DocStrings pointing into one text run would corrupt the
  merge round-trip. The mutation must happen in the document, before parse.
- _Hand-editing the ~15 masters once_: rejected per the brainstorm — every future
  master with an unsplit reference would silently miss auto-population; the
  splitter makes it automatic and book-agnostic.

## Decision 4 — Update-issues carry-over for the one-string→two-string split (FR-010)

**Decision**: Rely on the existing lesson-update-issues flow unchanged. When
re-processing splits a residual `Luke 1:26–38` master, `reparseEnglish`-style
reprocessing bumps the lesson version; `findTSubs` diffs old→new and emits a sub
whose "from" is the combined `Luke 1:26–38` and whose "to" is `Luke` + `1:26–38`.
The translator's prior combined translation stays visible as the "from" side and
is never destroyed (FR-014).

**Rationale / verification note**: `usefulEngSub` keeps this sub because the
combined "from" master is non-auto-translatable (see Decision 1). The exact
visual presentation of a one→two split in `UpdateIssuesPage` should be verified
on a real re-processed master during implementation (quickstart check), but no
code change to the diff mechanism is anticipated — this is the platform's
designed "English master changed" vehicle, so no bespoke migration is built.

## Decision 5 — Backfill and one-time re-processing (FR-011, FR-012, FR-013)

**Decision**:

- **Backfill (FR-011)**: extend the existing `defaultTranslateAll.ts` script
  (now importing the unified `canAutoTranslate` from Decision 1) rather than
  writing a sibling. It already skips masters a language already has
  (`!existingTStrings.find(... masterId ...)`), so it fills only missing numeric
  references and never overwrites translator work (SC-005).
- **Re-processing (FR-012)**: extend/mirror the existing `reparseEnglish.ts`
  script so it runs the Mechanism-2 splitter over each stored master and drives
  the split through the version-bump + `saveDocStrings` + update-issue flow — no
  manual re-uploads.
- **Operational sequence (FR-013)**: documented in quickstart as re-processing
  **first**, backfill **second**, so masters gain split references before the
  backfill copies the now-recognizable numeric masters into existing projects.

**Rationale**: Both maintenance scripts already exist and are the precedents the
spec names; extending them (and unifying the predicate) is the minimal,
DRY-respecting change. Both are inherently re-runnable safely: backfill skips
existing masters; re-processing's splitter is idempotent (FR-015).

## Open verification items carried into Phase 1 / implementation

- Confirm the `<text:s/>` split structure the splitter writes renders identically
  through a real LibreOffice round-trip (integration test, SC-004).
- Confirm the update-issue diff presents the one→two split acceptably on a real
  re-processed master (quickstart manual check, FR-010).
- Finalize the exact recognizer and splitter-boundary regexes against the
  extracted corpus fixtures (SC-003/SC-006, extraction-derived, not hardcoded).
  </content>
