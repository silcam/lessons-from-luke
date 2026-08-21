# Phase 1 Data Model: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Date**: 2026-07-14
**Framing**: Two-mechanism model (2026-07-14 spec amendment). Regenerated from
scratch; the superseded "span-rewrite for all references" framing and the
HIGH-1 "0 of 160 prose" reconciliation are moot and not carried forward.

**No new database tables, columns, or migrations.** The feature reshapes how a
document paragraph maps onto **existing** entities (`DocString`, master string /
`TString`, `LessonString`) and adds one recognition/splitting predicate. All
domain data continues through the `Persistence` interface (`storage.tStrings`,
`addOrFindMasterStrings`, `saveDocStrings`, `updateLesson`); master odt files
stay in the existing `docStorage`. This satisfies constitution Principle VI
(domain data via `Persistence`) with zero schema change.

## Existing entities (unchanged shape, new usage)

### `DocString` (`src/core/models/DocString.ts`)

One translatable text run extracted from a master document (`xpath`, trimmed
`text`, `type`, `motherTongue`). **New usage**: for the ~141 already-split
reference paragraphs, the book name and numeric part are **already** two
`DocString`s today (separated by an ODT `<text:s/>` element) — no change. For the
~15 residual **unsplit** reference paragraphs, the Mechanism-2 splitter rewrites
the source content.xml _before_ parse so a single unsplit run becomes two runs,
and the parser then emits two `DocString`s (`Luke` and `1:26–38`) instead of one
(`Luke 1:26–38`).

### Master string / `TString` (`src/core/models/TString.ts`)

`addOrFindMasterStrings` deduplicates by exact text, so identical text → one
master id. **New usage**:

- **Book-name master** (`Luke`): shared across all references in the corpus;
  translated once, propagates everywhere (FR-004, SC-002). Not auto-populated.
- **Numeric-reference master** (`1:5–25`, `18:35–19:10`): its own master; 49 of
  50 distinct numeric masters are shared across the four styles. Becomes
  **auto-translatable** under the extended predicate and is auto-populated
  verbatim from English at project creation (FR-001) and via backfill (FR-011).
  An ordinary editable translation with normal provenance/history — no locking,
  no special type (FR-003).

Two numeric masters differing only by dash character (`1:5-25` vs `1:5–25`) or by
trailing whitespace are **distinct** masters (parse trims, so a trailing-space
run and its trimmed form collapse to the same master; a differing dash does
not). Each distinct master auto-populates independently.

### `LessonString` (`src/core/models/LessonString.ts`)

Links a master to a lesson at an `xpath` with a `type`/`motherTongue`. **New
usage**: a split residual reference produces two `LessonString`s where there was
one; this is what the version bump diffs, surfacing the change through the
lesson-update-issues flow (FR-010).

## New (in-memory, no persistence) recognition + splitting logic

### `canAutoTranslate` — extended shared predicate

`src/server/actions/defaultTranslations.ts`. Currently `/^[\d–\-[\]()\s]*$/`
(digits/dashes/brackets/whitespace; colon excluded). **Extended** to also return
true for a trimmed **numeric verse-reference range shape** (FR-002): a
`chapter:verse` followed by a hyphen or en-dash range to a bare verse or a
cross-chapter `chapter:verse`. Illustrative: `^\d+:\d+\s*[-–]\s*\d+(?::\d+)?$`.

- **Consumers** (unchanged call sites): `defaultTranslations` (new-project
  pre-fill), `findTSubs.usefulEngSub` (update-issue filter — blast radius
  verified in research.md Decision 1), and the backfill script.
- **Unification**: the duplicated `shouldAutoTranslate` in
  `tasks/defaultTranslateAll.ts` is removed and replaced by importing this one
  predicate (research.md Decision 1; DRY, constitution VII).
- **Invariant (FR-016)**: shape-only, no book-name-adjacency guard; zero
  measured false positives on the corpus; the `3:00`-style residual risk is
  accepted (and, having no range separator, does not even match this shape).

### Reference splitter — narrow, pre-parse content.xml rewrite

Server-only (see plan.md structure). Input: a persisted master's content.xml.
For paragraphs in the four reference-bearing styles whose text is a **single
unsplit reference** run (`<book words> <chapter:verse range>`, incl. the
spaced-dash variant), it splits the run into `book-name run` + `<text:s/>` +
`numeric run`, matching the structure the parser already emits for the majority.

- **Boundary rule**: the whitespace immediately preceding the `chapter:verse`
  numeric token; a leading book number (`1 Corinthians`) stays in the book run
  (FR-007, book-agnostic).
- **Idempotent** (FR-009): no-op on an already-split paragraph → no duplicate
  masters on re-run (FR-015).
- **Atomic write** (FR-009): temp file + rename; no partially-written master
  observable.
- **Round-trip identity** (FR-008/SC-004): the emitted run structure reproduces
  the parser's existing split shape, so download/merge renders identically —
  verified by a LibreOffice `soffice --headless` integration round-trip.

## State transitions

| Event                                              | Before                                   | After                                                                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upload master (already-split refs)                 | `Luke` + `1:5–25` as two masters         | unchanged; numeric master now recognized as auto-translatable                                                                                                                                                                  |
| Upload master (residual unsplit ref)               | `Luke 1:26–38` single master             | splitter → `Luke` + `1:26–38`; numeric auto-translatable                                                                                                                                                                       |
| Create new-language project                        | numeric masters untranslated             | numeric masters auto-populated verbatim; book-name masters empty                                                                                                                                                               |
| Translate book name once                           | one reference shows translated book      | all references in that language show translated book + numeric                                                                                                                                                                 |
| Re-process residual master (existing)              | project has combined `Luke 1:26–38`      | update-issue surfaces `Luke 1:26–38` → `Luke` + `1:26–38`; prior kept                                                                                                                                                          |
| Revise numeric ref in a master (`1:5–25`→`1:5–24`) | project has old numeric master           | update-issue is **suppressed** (`usefulEngSub`, new "from" is auto-translatable) AND update path does not auto-repopulate → new numeric master silently blank until backfill re-carries it (red-team Pass 1 HIGH; see plan.md) |
| Backfill existing project                          | some numeric refs blank, some translated | blanks filled from English; translated ones untouched (SC-005)                                                                                                                                                                 |

## Validation rules (from requirements)

- FR-002/FR-016: recognition trims first, accepts hyphen + en-dash, requires a
  range, uses text shape only.
- FR-005: prose containing a reference is never a standalone master, so
  recognition structurally cannot reach it — no prose paragraph is affected.
- FR-008/FR-009: splitter renders identically, is idempotent, writes atomically.
- FR-011/SC-005: backfill fills only missing numeric references; never overwrites
  an existing translation.
- FR-014: source-language translation data and history are never modified or
  destroyed; only run structure of unsplit references changes.
- FR-010 (red-team Pass 1 HIGH): because extending `canAutoTranslate` makes
  `usefulEngSub` suppress update-issues for changed numeric references, the update
  path (upload + re-processing) MUST re-carry changed auto-translatable numeric
  masters into existing projects (fill-only, `defaultTranslateAll` skip semantics),
  or a manual backfill after every reference-changing master revision MUST be a
  documented operational invariant. Otherwise a corrected reference goes silently
  blank in existing projects.
  </content>
