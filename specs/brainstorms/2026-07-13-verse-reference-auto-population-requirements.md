---
date: 2026-07-13
topic: verse-reference-auto-population
---

# Auto-Populate Verse-Reference Strings (WS-4, SOP §30.3)

## Problem Frame

Translators must manually copy ~95 isolated verse-reference strings (e.g.
`Luke 1:5–25`) from the English source into every new project — the TOC "Story"
column and each lesson's title scripture reference. Chris does this by hand,
field by field (SOP §10.6), and translators often miss the fields entirely.
Picture/lesson numbers already auto-populate at project creation
(`defaultTranslations`, SOP §10.5), but its numeric-only detection pattern
excludes the colon, so verse references are left out.

Today each reference is a **single** translatable string (`Luke 1:5–25`), which
forces every reference to be translated separately even though only the book
name differs across ~50 of them. WS-4 restructures references into two strings
— a **book name** (`Luke`) and a **numeric reference** (`1:5–25`) — so the book
name is translated once (propagating everywhere via master-string
deduplication) and the numeric part auto-populates like picture numbers.

Branch context: new branch off `009-quarter-styles-template`.

## Requirements

**Reference splitting (normalize at upload)**

- R1. When an English master document is uploaded, paragraphs that are isolated
  verse references MUST be normalized so the book name and the numeric
  reference become separate translatable strings (e.g. `Luke` + `1:5–25`;
  `Luke 9:1–6 Luke 9:10–17` → `Luke`, `9:1–6`, `Luke`, `9:10–17`).
- R2. Normalization MUST be book-agnostic: future books (Acts and beyond) MUST
  split correctly without code changes.
- R3. The normalized document MUST render identically to the original (same
  visible text, styles, and layout) when downloaded/merged.
- R4. Strings where a verse reference is embedded in translatable prose
  (e.g. `Bible Story: Luke 10:25–37`) MUST NOT be split or auto-populated.

**Auto-population**

- R5. When a new project (language) is created, numeric reference strings
  (e.g. `1:5–25`, `18:35–19:10`) MUST auto-populate verbatim from English,
  alongside the existing numeric (picture-number) auto-translation.
- R6. Auto-populated strings MUST be ordinary editable translations with the
  same provenance recording as existing auto-translated strings. No locking,
  no special string type.
- R7. Book-name strings are NOT auto-populated; they are ordinary translatable
  strings. Because identical English text shares one master string, translating
  the book name once MUST complete it across all references in that language.

**Existing projects and backfill**

- R8. Re-normalizing existing masters changes their lesson strings; affected
  languages MUST surface the change through the existing lesson-update-issues
  flow so translators can carry over prior work. Existing combined-reference
  translations MUST NOT be destroyed (they remain visible as the "from" side).
- R9. The existing manually-run backfill mechanism (`defaultTranslateAll`
  precedent) MUST be extended so existing projects receive missing numeric
  reference strings, skipping any string that already has a translation —
  never overwrite translator work.
- R12. A one-time manually-run admin task MUST re-process all stored English
  master documents through the normalization + lesson-update flow, so
  existing masters gain split references without manual re-uploads. Post-
  deploy operational sequence: run the re-normalization task, then the
  backfill.

**Detection and safety**

- R10. A paragraph qualifies as an isolated verse reference by **shape**, not a
  hardcoded book list: the entire string is one or more references of the form
  _optional book word(s) + chapter:verse_ with optional verse/chapter ranges,
  accepting both hyphen and en-dash. The Q1–Q4 English Teacher's Guide corpus
  is the acceptance benchmark: 95 distinct standalone reference strings (styles
  `M.T. Table of Contents` and `M.T. Text - Lesson Title Scrip Reference`)
  matched; 0 of the 160 colon-bearing prose strings matched.
- R11. The feature MUST NOT modify source-language translation data or destroy
  translation history (SOP §6.2 red line).

## Success Criteria

- Creating a new project pre-fills every numeric reference; translating the
  book name once completes every reference in the language — no per-reference
  manual copy/paste remains.
- No prose string is ever split or auto-filled.
- Round-tripped documents are visually identical to the originals.
- Backfill on an existing project fills only missing numeric references and
  changes nothing already translated.

## Key Decisions

- **Split book name from numeric reference** (rather than auto-filling
  `Luke 1:5–25` verbatim, or deriving book-name mappings from a first
  translation): the two-string model is right long-term — book name is
  translatable text, numerics are language-neutral — and master-string
  deduplication gives translate-once propagation for free.
- **Normalize at upload** (rather than hand-editing master documents once, or
  changing the parse/merge core): the parser already emits one string per XML
  text node, so splitting a reference paragraph into spans upstream of parsing
  requires no parser/merge changes, keeps Chris's authoring workflow unchanged,
  and makes Acts work automatically. Rejected: one-time document transformation
  (every future master would need to follow the span convention manually).
- **Shape-based detection, not book-list detection**: curriculum is expanding
  beyond Luke; detection must not require a code change per book.
- **New projects + backfill**: the pain is in existing in-progress projects
  too, and the backfill precedent already exists.
- **Existing combined-reference translations migrate via the update-issues
  flow**: this is the platform's designed mechanism for "English master
  changed"; no bespoke migration.
- **Existing masters re-normalized by a one-time admin task** (rather than
  manual re-uploads or waiting for natural updates): ~56 documents, so
  operator-run automation beats piecemeal re-upload; existing projects get
  the benefit immediately.

## Dependencies / Assumptions

- Assumes English master strings match the sample corpus shapes (verified
  against `~/Downloads/lessons-from-luke/Luke bilingual editable files/English
Teacher_s Guides` Q1–Q4 on 2026-07-13).
- Post-deploy operational steps (re-normalization task, then backfill) must
  actually be run by an operator; capture in acceptance criteria.
- Independent of WS-2/WS-3; parallel-safe per the roadmap. Branches off
  `009-quarter-styles-template`.

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R3][Technical] Exact span-normalization mechanics: which ODT
  span/style construction preserves rendering, and where in the upload path
  the pre-parse rewrite runs.
- [Affects R5, R10][Technical] Whether to extend the shared `canAutoTranslate`
  predicate (also consumed by `findTSubs`) or add a sibling numeric-reference
  predicate — extending the shared one changes update-issue filtering and
  needs its blast radius checked.
- [Affects R10][Technical] Exact regex: leading book words including numbered
  books (`1 Corinthians`), punctuation/whitespace tolerance between multiple
  references.
- [Affects R8][Needs research] How the update-issues diff presents a
  one-string→three-string split in practice; verify the carry-over UX on a
  real re-normalized master.
- [Affects R9][Technical] Whether backfill extends `defaultTranslateAll` or
  gets a sibling script; the auto-translate pattern is currently duplicated
  verbatim in two files and should be unified.

## Next Steps

-> `/sp:02-specify` to create the formal specification (new branch off
`009-quarter-styles-template`).
