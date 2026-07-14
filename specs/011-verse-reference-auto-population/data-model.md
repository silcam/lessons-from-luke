# Phase 1 Data Model: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Date**: 2026-07-14

> **⚠ Red Team Pass 1 — BLOCKER (blocks `/sp:05-tasks`).** Empirically (running the real
> parser on the committed corpus), isolated-reference paragraphs are `<text:s/>`-fragmented
> (`Luke <text:s/>1:5–25`) in **both** SC-003 target styles, so the existing parser
> **already** emits `Luke` and `1:5–25` as separate `DocString`s. The claim below that a
> normalized paragraph goes from "one `DocString`" to "multiple" is false for these
> paragraphs — they are already multiple. And because master strings dedupe by text and
> `motherTongue` is a `LessonString` field (not carried onto the master/tString read by
> `defaultTranslations`), the numeric `1:5–25` of an isolated reference and of a prose
> `Bible Story: …1:5–25` share **one master id** — auto-population is master-granular, not
> paragraph-granular. The `parseVerseReferences` and predicate rows below must be
> re-derived in `/sp:03-plan` against the strings the pipeline actually produces. See
> plan.md "Adversarial Review Findings (Red Team — Pass 1)".

No new database tables, columns, or migrations. The feature reshapes how a
document paragraph maps onto **existing** entities (`DocString`, master string /
`TString`, `LessonString`) and adds one in-memory value type for the reference
grammar. All domain data continues through the `Persistence` interface
(constitution VI). Normalization and the two operator tasks are server-only and
touch only English master documents; they never write source-language history
(FR-013).

## Existing entities (unchanged shape, changed usage)

### DocString (`src/core/models/DocString.ts`)

`{ type, xpath, motherTongue, text }`. Unchanged. After normalization, an
isolated-reference paragraph emits **multiple** `DocString`s (one per book/numeric
span) instead of one, each with its own `xpath = node.path()` into a `text:span`.

### Master string / TString (`src/core/models/TString.ts`)

Unchanged. `addOrFindMasterStrings` deduplicates identical text, so every `Luke`
span across all references collapses to a single master id (translate-once
propagation, FR-007). Each distinct numeric segment (`1:5–25`, `18:35–19:10`) is
its own master id.

### LessonString (`src/core/models/LessonString.ts`)

Unchanged. Re-normalization produces a new lesson `version` whose `lessonStrings`
replace one reference row with book + numeric rows; the previous version is
retained for the `findTSubs` diff (FR-009).

## New value type (in-memory only)

### VerseReferenceSegment — `src/core/util/verseReference.ts`

```ts
/** One book-name + numeric-reference pair extracted from a paragraph. */
export interface VerseReferenceSegment {
  /** Translatable book-name text, e.g. "Luke", "1 Corinthians". */
  book: string;
  /** Language-neutral chapter:verse text, e.g. "1:5–25", "18:35–19:10".
   *  Original dash character (hyphen or en-dash) preserved verbatim. */
  numeric: string;
}
```

`parseVerseReferences(text: string): VerseReferenceSegment[] | null`

- Returns an ordered, non-empty array when the **entire** trimmed `text` is one
  or more references of shape `book chapter:verse` (Decision 2 grammar).
- Returns `null` when the text is not a pure isolated-reference string
  (embedded-in-prose, unrecognized shape, or a book-less bare numeric) — the
  conservative default (FR-004, FR-008).

Pure and isomorphic (no Node/DOM/Electron APIs) so it is unit-testable and lives
in `core` per constitution VI.

## Classification rules

| Input paragraph text                | `parseVerseReferences` result                | Downstream effect                                      |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `Luke 1:5–25`                       | `[{book:"Luke", numeric:"1:5–25"}]`          | Split into `Luke` span + `1:5–25` span                 |
| `Luke 9:1–6 Luke 9:10–17`           | `[{Luke,9:1–6},{Luke,9:10–17}]`              | 4 spans; `Luke` dedupes to one master                  |
| `18:35–19:10` within `Luke 18:35…`  | single segment `numeric:"18:35–19:10"`       | chapter-spanning range kept whole (not split further)  |
| `1 Corinthians 2:1–5`               | `[{book:"1 Corinthians", numeric:"2:1–5"}]`  | leading `1` stays in book name, not treated as numeric |
| `1:5-25` (hyphen)                   | `[{...,numeric:"1:5-25"}]` (if book present) | hyphen preserved verbatim                              |
| `Bible Story: Luke 10:25–37`        | `null`                                       | NOT split, NOT auto-filled — one translatable string   |
| any prose with a reference embedded | `null`                                       | untouched                                              |

## Predicate change (FR-005, FR-006)

`canAutoTranslate(text)`: `/^[\d–\-[\]()\s]*$/` → `/^[\d–\-:[\]()\s]*$/` (add
`:`). Unified into a single exported function consumed by `defaultTranslations`,
`findTSubs`, and `defaultTranslateAll`.

| String            | before | after | meaning                                     |
| ----------------- | ------ | ----- | ------------------------------------------- |
| `1:5–25`          | false  | true  | numeric ref now auto-populates / auto-fills |
| `18:35–19:10`     | false  | true  | chapter-spanning numeric ref auto-populates |
| `Luke`            | false  | false | book name stays translatable (FR-007)       |
| `1 Corinthians`   | false  | false | numbered book name stays translatable       |
| `12` (pic number) | true   | true  | unchanged                                   |

## Invariants

- **No source mutation / no history loss** (FR-013): tasks add lesson-string
  versions and per-language `tStrings`; they never delete or overwrite English
  source strings or translation history.
- **Idempotence** (FR-014): re-normalization finds no single-run reference
  paragraph on an already-split master (paragraphs are already spans) → no new
  strings; backfill skips masters already present in a language → no overwrite.
- **Backfill never overwrites** (FR-010): only masters absent from a language are
  inserted.
