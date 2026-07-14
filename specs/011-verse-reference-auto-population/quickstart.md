# Quickstart: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Framing**: Two-mechanism model (2026-07-14 spec amendment).

## What this feature does

Isolated verse references in English masters (the TOC "Story" column, each
lesson's title scripture reference, and the matching sub-headings) consist of a
**book name** (`Luke`) and a **language-neutral numeric reference** (`1:5–25`).

- **Mechanism 1 (recognition, no document mutation)**: for the ~141 reference
  paragraphs the parser already stores as two runs, the numeric part is already
  its own master string. Extending the shared auto-translate predicate makes
  those numeric masters auto-populate verbatim when a new language project is
  created. The book name is translated once and propagates everywhere via
  master-string deduplication. Prose that merely contains a reference is never
  touched (structurally: it is never a standalone master).
- **Mechanism 2 (narrow splitter, document mutation)**: the ~15 residual
  references still stored as a single unsplit run are split at upload (and during
  one-time re-processing) into a book run + numeric run, so their numeric part
  becomes its own master and flows into Mechanism 1.

## Developer walkthrough

### New-project pre-fill (US1, US2 — primary path, no splitter needed)

1. Upload an English master via `POST /api/admin/documents`. Already-split
   references need no mutation; residual unsplit references are split by
   Mechanism 2; prose is left intact.
2. Create a language via `POST /api/admin/languages`. Every numeric-reference
   master is auto-populated from English; book-name masters remain empty.
3. Translate the book name (`Luke`) once → every reference in that language shows
   the translated book name + the pre-filled numeric part.

### Verify recognition against the corpus (SC-003 / SC-006)

The committed `test/docs/serverDocs/` masters cover Luke Q1–Q4. **Derive the
benchmark by extraction at test time** — the reference-bearing paragraphs across
the four styles (`M.T. Text - Lesson Title Scrip Reference`, `Sub-Head 1`,
`M.T. Table of Contents`, `Lesson Title Scrip Reference`) and their distinct
numeric tokens — **never** a hardcoded count. Assert: 100% of the extracted
standalone numeric-reference masters are recognized, and 0 prose paragraphs are
affected (0 false positives).

### Verify the splitter round-trips (US3 / SC-004)

Take a master containing a residual unsplit reference, run the splitter, then
download/merge and compare rendered output to the original via a LibreOffice
`soffice --headless` round-trip: identical visible text, styles, spacing, layout.
Run the splitter a second time and confirm no further change (idempotent) and no
duplicate strings.

### Existing projects: re-processing then backfill (US4 / FR-013)

1. Run the one-time **re-processing** task (mirrors `reparseEnglish.ts`) — splits
   residual references in every stored master and surfaces changes through the
   lesson-update-issues flow (`GET /api/admin/lessons/:id/lessonUpdateIssues`).
   On a real re-processed master, open `UpdateIssuesPage` and confirm the
   one→two split presents acceptably with the prior combined translation visible
   as the "from" side (FR-010).
2. Run the **backfill** (extends `defaultTranslateAll.ts`) — fills only missing
   numeric references in existing projects; leaves every already-translated
   string unchanged (SC-005).

## Guardrails

- Recognition is text-shape only (FR-016): no book-name-adjacency guard. The
  `3:00`-style residual risk is accepted (and does not match the range shape).
- Source-language translation data and history are never modified or destroyed
  (FR-014); only run structure of unsplit references changes.
- Re-running re-processing or backfill is safe: no duplicate strings, no
  overwritten work (FR-009, FR-015).
- Re-processing and backfill are operator-run maintenance scripts assumed to run
  during a maintenance window with server quiescence — no concurrent admin
  uploads or project creation against the same masters/lessons (red-team Pass 1
  LOW: concurrency between operator scripts and live server writes is
  undocumented/uncoordinated otherwise).
  </content>
