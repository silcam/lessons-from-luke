# Phase 1 Data Model: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Date**: 2026-07-14

> **Resolved in deepen-plan Pass 2.** Red Team Pass 1 found (2-file sample) that
> isolated-reference paragraphs are `<text:s/>`-fragmented (`Luke <text:s/>1:5–25`)
> in both SC-003 target styles, so the parser already emits `Luke` and `1:5–25`
> as separate `DocString`s. **This pass re-verified the finding against the full
> committed corpus** (all 67 masters, Luke Q1–Q4): all 96 reference-shaped
> paragraphs are already `<text:s/>`-fragmented; 0 are a single literal-space
> run. The model below is corrected accordingly: for the current corpus, an
> isolated-reference paragraph is **already** multiple `DocString`s today — no
> normalization event changes that. `normalizeReferences`/`parseVerseReferences`
> remain in the design as a **defensive path for a future single-run paragraph**
> (not exercised by any real corpus master); the mechanism that actually
> delivers auto-population for the 96 known references is the extended
> `canAutoTranslate` predicate (see "Predicate change" below) applied to numeric
> strings that already exist as separate master strings. See plan.md
> "Adversarial Review Findings (Red Team — Pass 1)" and research.md Decisions
> 1–6 for the full correction and evidence.
>
> **HIGH-1 reconciliation (ratified provisionally, flagged for confirmation):**
> "0 of 160 prose strings affected" (SC-003) is redefined as **prose paragraph
> text and rendering are unchanged**, not "the prose numeric substring's master
> id is untouched by auto-population." Master-string dedup means the isolated
> reference's `1:5–25` and the prose's `1:5–25` share one master id; the
> predicate change makes that shared master id auto-translatable regardless of
> which paragraph it came from. This is harmless because the numeric text is
> language-neutral (auto-filling it into a prose paragraph's already-existing
> tString would render the same text a human translator would have entered
> anyway), but it means **paragraph-level precision is not structurally
> enforceable** — only _prose-paragraph-untouched_ is. This redefinition is a
> spec-observable change (`SC-003` wording) and should be ratified in a future
> `/sp:02-specify` amendment pass rather than treated as silently settled.

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

> **Pass 2 note**: none of these rows are exercised by a real corpus master —
> the full committed corpus is already `<text:s/>`-fragmented, so
> `parseVerseReferences` never sees a combined `Luke 1:5–25` string in the live
> pipeline. This table is `parseVerseReferences`'s **defensive/unit-fixture
> contract** for a hypothetical single-run paragraph (future content, a
> different authoring tool, or a manual retype). For the current corpus,
> `Luke` and `1:5–25` already exist as separate master strings; see "Predicate
> change" below for what actually drives FR-005/SC-003.

| Input paragraph text                | `parseVerseReferences` result                | Downstream effect                                      |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `Luke 1:5–25`                       | `[{book:"Luke", numeric:"1:5–25"}]`          | Split into `Luke` span + `1:5–25` span                 |
| `Luke 9:1–6 Luke 9:10–17`           | `[{Luke,9:1–6},{Luke,9:10–17}]`              | 4 spans; `Luke` dedupes to one master                  |
| `18:35–19:10` within `Luke 18:35…`  | single segment `numeric:"18:35–19:10"`       | chapter-spanning range kept whole (not split further)  |
| `1 Corinthians 2:1–5`               | `[{book:"1 Corinthians", numeric:"2:1–5"}]`  | leading `1` stays in book name, not treated as numeric |
| `1:5-25` (hyphen)                   | `[{...,numeric:"1:5-25"}]` (if book present) | hyphen preserved verbatim                              |
| `Bible Story: Luke 10:25–37`        | `null`                                       | NOT split, NOT auto-filled — one translatable string   |
| any prose with a reference embedded | `null`                                       | untouched                                              |

## Predicate change (FR-005, FR-006) — REVISED in deepen-plan Pass 2 (Red Team HIGH-1, HIGH-2)

> **Pass 2 correction.** This predicate is the mechanism that actually
> delivers FR-005/SC-003 for the current corpus — the 96 numeric strings below
> already exist as separate master strings today (Decision 1 evidence); no
> splitting/normalization event is required to produce them. The naive
> "add `:` to the char class" edit is also corrected: it must be a **union**
> with a stricter verse-numeric shape, not a bare colon addition, or a time
> like `3:00` becomes admitted the same way a genuine verse numeric is (see
> HIGH-2 discussion in research.md Decision 3).

`canAutoTranslate(text)` becomes the union of the existing class and a
verse-numeric shape:

```ts
/^[\d\u2013\-[\]()\s]*$/.test(text) || /^\d+:\d+(?:[\u2013-]\d+(?::\d+)?)?$/.test(text);
```

Unified into a single exported function consumed by `defaultTranslations`,
`findTSubs`, and `defaultTranslateAll`.

| String            | before | after                          | meaning                                                                                                                                                                                                                                                         |
| ----------------- | ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1:5–25`          | false  | true                           | numeric ref now auto-populates / auto-fills (verse-numeric branch)                                                                                                                                                                                              |
| `18:35–19:10`     | false  | true                           | chapter-spanning numeric ref auto-populates (verse-numeric branch)                                                                                                                                                                                              |
| `Luke`            | false  | false                          | book name stays translatable (FR-007)                                                                                                                                                                                                                           |
| `1 Corinthians`   | false  | false                          | numbered book name stays translatable                                                                                                                                                                                                                           |
| `12` (pic number) | true   | true                           | unchanged — still matches the original picture-number branch, not the new one                                                                                                                                                                                   |
| `3:00` (a time)   | false  | **true (accepted limitation)** | matches the verse-numeric branch by shape; mitigated by the one-time corpus scan (none found) + a standing non-blocking upload-time log for future colon-numerics outside the known reference styles (research.md Decision 3) — not fully solved by regex alone |

## Invariants

- **No source mutation / no history loss** (FR-013): tasks add lesson-string
  versions and per-language `tStrings`; they never delete or overwrite English
  source strings or translation history.
- **Idempotence** (FR-014): re-normalization reports no change on the current
  corpus (paragraphs are already fragmented at authoring time, not merely
  "already spans" from a prior run of this feature) → no version bump, no new
  strings (research.md Decision 6 correction); backfill skips masters already
  present in a language → no overwrite.
- **Precision is prose-paragraph-granular, not master-string-granular**
  (Red Team HIGH-1, ratified provisionally — flagged for `/sp:02-specify`
  confirmation): the isolated reference's `1:5–25` and a prose paragraph's
  embedded `1:5–25` share one master id once the predicate change lands;
  SC-003's "0 prose strings affected" holds in the sense that no prose
  paragraph's text or rendering changes, not in the sense that the shared
  master id is exempt from auto-population.
- **Backfill never overwrites** (FR-010): only masters absent from a language are
  inserted.
