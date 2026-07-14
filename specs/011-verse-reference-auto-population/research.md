# Phase 0 Research: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Date**: 2026-07-14

This document resolves every "Deferred to Planning" question from the spec and
brainstorm with evidence from the codebase. Each decision is grounded in the
existing upload → parse → merge pipeline so the plan does not manufacture
confidence (Zeroth Principle).

## Pipeline facts established by code reading

- **Upload (English master)**: `documentsController` → `uploadEnglishDoc`
  (`src/server/actions/uploadDocument.ts`) → `docStorage.saveDoc` persists the
  uploaded `.odt`, then `parseDocStrings` (`updateLesson.ts`) unzips and calls
  `parse()` per `content|meta|styles` xml, then `saveDocStrings` maps each
  `DocString` to a master string via `addOrFindMasterStrings` (identical text →
  one master id) and writes `lessonStrings` (bumping `version`).
- **Parse** (`src/server/xml/parse.ts`): finds styled `text:p`/`text:h` nodes,
  then recurses to **text nodes**, emitting one `DocString` per non-whitespace
  text node with `xpath = node.path()` and trimmed text. A whitespace-only text
  node yields nothing.
- **Merge** (`src/server/xml/mergeXml.ts`): reads the **persisted source odt**,
  looks up each `xpath`, and replaces the trimmed element text with the
  translation. Round-trip identity therefore depends on parse and merge running
  against the **same** persisted odt.
- **Auto-translate on project create**: `languagesController` POST
  `/api/admin/languages` → `defaultTranslations(storage, languageId)` copies
  every English master string where `canAutoTranslate(text)` is true into the
  new language verbatim.
- **`canAutoTranslate`** (`defaultTranslations.ts`): `/^[\d–\-[\]()\s]*$/` — the
  colon is excluded, which is exactly why verse references are not
  auto-populated today. The identical predicate is duplicated as
  `shouldAutoTranslate` in `tasks/defaultTranslateAll.ts`.
- **Update-issues flow** (FR-009 trigger): `lessonsController` GET
  `/api/admin/lessons/:lessonId/lessonUpdateIssues` → `findTSubs`. `findTSubs`
  diffs the current lesson strings against the previous version
  (`oldLessonStrings(lessonId, version-1)`) and keeps a sub only if its English
  "from" side contains at least one non-auto-translatable string
  (`usefulEngSub`).

## Decision 1 — Span-normalization mechanics (FR-001, FR-003)

**Decision**: Normalize **upstream of parse** by rewriting the master odt's
`content.xml` so that an isolated-reference paragraph's single text run becomes a
sequence of `<text:span>` runs — one per book-name token and one per numeric
reference — separated by the original literal whitespace as plain text nodes.
Persist the rewritten odt as the master source (so parse and merge agree). A
new module `src/server/xml/normalizeReferences.ts` performs the unzip → rewrite
`content.xml` → rezip, mirroring `mergeXml`'s unzip/zip structure. It is invoked
in the English-master path only (`uploadEnglishDoc` after `saveDoc`, and the
re-normalization task after copying the odt), **never** inside `parseDocStrings`
(which non-English uploads also call).

**Rationale**:

- A `<text:span>` with no `text:style-name` renders identically to plain text,
  so `<text:p>Luke 1:5–25</text:p>` → `<text:p><text:span>Luke</text:span>
<text:span>1:5–25</text:span></text:p>` is visually identical (verified as the
  documented ODF behaviour; asserted by the round-trip integration test).
- The literal space between spans is a whitespace-only text node → `parse()`
  ignores it (no `DocString`) but merge and rendering preserve it, so spacing is
  unchanged.
- Persisting the normalized odt keeps `node.path()` xpaths stable between parse
  and merge with **zero parser/merge changes** (brainstorm Key Decision).
- Repeated book names (`Luke 9:1–6 Luke 9:10–17`) each become a `Luke` span;
  `addOrFindMasterStrings` deduplicates them to one master string, giving
  translate-once propagation for free.

**Conservatism red-line (FR-003, SC-004)**: A paragraph is normalized **only if
its inline content is a single unstyled text run** (one child text node, no
existing styled `text:span`/`text:s`/soft-line-break children). If a candidate
paragraph already carries inline markup, it is left **unsplit** — rebuilding a
paragraph that already has styled spans is exactly where round-trip identity
breaks. This satisfies the spec's "never split when in doubt" edge case.

**Alternatives rejected**:

- One-time hand transformation of every master (brainstorm): every future master
  would have to follow the span convention manually. Rejected.
- Changing the parse/merge core to emit multi-string paragraphs: larger blast
  radius, breaks the "one string per text node" invariant other code relies on.

## Decision 2 — Shape-based detection and the reference grammar (FR-002, FR-008)

**Decision**: Detection is by **shape**, not a book list. A pure, isomorphic
function `parseVerseReferences(text)` in `src/core/util/verseReference.ts`
returns an ordered list of `{ book, numeric }` segments when the **entire**
trimmed paragraph text is one or more references, or `null` otherwise. Grammar
per reference: `book = one or more leading words, where the first word may be a
single leading digit (numbered books like "1 Corinthians"); numeric =
chapter:verse with optional verse range and optional chapter-spanning range,
accepting both hyphen (`-`) and en-dash (`–`)`. Multiple references in one
paragraph are separated by whitespace. The original dash character is preserved
verbatim in the emitted numeric segment (edge case: hyphen vs en-dash).

Reference regex (single unit), anchored over the whole string when repeated:

```
book:    (?:\d\s+)?\p{L}[\p{L}.]*(?:\s+\p{L}[\p{L}.]*)*
numeric: \d+:\d+(?:[–-]\d+(?::\d+)?)?
```

A paragraph qualifies iff it matches `^(book\s+numeric)(\s+book\s+numeric)*$`.
A reference with **no** book word does not qualify for splitting (nothing to
split off); it is left intact and, being numeric-only, is already handled by
auto-population. Book-agnostic: Acts, `1 Corinthians`, etc. split with no code
change (FR-002).

**Rationale**: The 95 corpus references all take the `book chapter:verse` shape;
prose strings contain sentence punctuation/lowercase connective words that break
the whole-string anchor, so they never qualify — this is what delivers SC-003's
0-false-positive requirement.

**Alternatives rejected**: hardcoded book list (fails FR-002 as the curriculum
expands past Luke); style-name-only detection (the corpus benchmark uses styles
only to _enumerate_ the 95, but per FR-008 detection must be shape-based so new
styles/books work without code changes).

## Decision 3 — Extend the shared `canAutoTranslate` predicate (FR-005, FR-006)

**Decision**: Add the colon to the existing char class:
`/^[\d–\-:[\]()\s]*$/`, and **unify** the duplicated predicate — export one
`canAutoTranslate` and have `tasks/defaultTranslateAll.ts` import it instead of
its private `shouldAutoTranslate` copy (DRY, constitution VII).

**Blast radius (verified)**:

- `defaultTranslations` (project create): numeric reference strings
  (`1:5–25`, `18:35–19:10`) now match and auto-populate verbatim — exactly
  FR-005. Book-name strings (`Luke`, `1 Corinthians`) contain letters → never
  match → stay translatable (FR-007).
- `findTSubs.usefulEngSub`: a sub whose English "from" strings are all
  auto-translatable is filtered out. Numeric refs becoming auto-translatable
  means they no longer surface as update issues — desired. Book names remain
  non-auto-translatable, so the one-string→multi-string split still surfaces
  (see Decision 4).

**Regression check (record in implementation)**: Before extending the predicate,
confirm no existing standalone master string is all-digits-plus-colon (e.g. a
time like `3:00`) that would begin auto-translating unexpectedly. A one-line
scan of English master strings against `/^[\d–\-:[\]()\s]*$/` minus the current
pattern surfaces any. Corpus inspection shows references only ever appear as
`book chapter:verse` (never bare `chapter:verse` standalone), so risk is low.

**Alternative rejected**: a sibling numeric-reference predicate. It would leave
`findTSubs` unaware that numeric refs are auto-fillable, causing them to surface
as noise in the update-issues flow. Extending the shared predicate is both
simpler and gives the correct filtering.

## Decision 4 — Update-issues carry-over for the split (FR-009)

**Decision**: Re-normalization runs through the existing
`saveDocStrings`/version-bump path, so the split surfaces through the unchanged
`findTSubs` mechanism with **no bespoke migration**.

**Evidence**: `findTSubs` diffs current vs previous lesson strings. Before
re-normalization the paragraph is one master string `Luke 1:5–25`; after, it is
`Luke` + `1:5–25`. The diff yields a sub with `from = [masterId(Luke 1:5–25)]`
and `to = [masterId(Luke), masterId(1:5–25)]`. `usefulEngSub` keeps it because
`Luke 1:5–25` contains letters (not auto-translatable). For a language that had
translated the combined string, `usefulTSub` keeps it (from translated, to
untranslated), so the translator sees the prior combined translation as the
"from" side and carries it over. Existing translations are never deleted —
`saveDocStrings` writes new `lessonStrings` and never mutates historical
`tStrings` (FR-013). This must be **observed on a real re-normalized master** in
an integration check, not merely asserted.

## Decision 5 — Backfill extends `defaultTranslateAll` (FR-010, FR-014)

**Decision**: The backfill **is** `tasks/defaultTranslateAll.ts` running with
the unified, colon-extended predicate. It already (a) skips any master already
present in a language (`!existingTStrings.find(...masterId...)`) so it never
overwrites translator work (FR-010) and (b) is idempotent — a second run adds
nothing (FR-014). The only change is importing the unified predicate.

**Alternative rejected**: a new sibling script. The precedent already exists and
is idempotent; a second script would re-duplicate the predicate the plan is
unifying.

## Decision 6 — One-time re-normalization task (FR-011, FR-012, FR-014)

**Decision**: A new operator-run task `src/server/tasks/renormalizeEnglish.ts`,
modeled on `reparseEnglish.ts`, iterates all stored lessons and, per lesson,
copies the odt to the next version, runs `normalizeReferences` on the copy, then
`parseDocStrings` + `saveDocStrings`. This gains split references without manual
re-uploads and routes the change through the version/update-issues flow
(Decision 4). Idempotent: re-running on an already-normalized paragraph finds no
single-run reference paragraph to split (they are already spans) → no duplicate
strings, no destructive change (FR-014). Operational order is documented:
**re-normalize first, then backfill** (FR-012), captured in quickstart.md.

**Alternative rejected**: reusing `reparseEnglish` directly — it does not
normalize; adding normalization to it would change behaviour for callers that
only want a re-parse. A sibling task keeps the concern separate and explicit.

## SC-003 benchmark corpus — verification is reproducible in-repo

**Finding**: The committed `test/docs/serverDocs/` masters cover **Luke Q1–Q4**
(series 1–4, e.g. `Luke-1-01v05.odt` … `Luke-4-52v01.odt`) — the same corpus the
brainstorm benchmarked. Extraction from a committed master confirms reference
strings are present (`Luke 1:5-7`, `Luke 1:8-10`, …). The 95/0 acceptance gate is
therefore reproducible from the repository, **not** from the off-repo
`~/Downloads` copy.

**Test-strategy consequence**: Extract the standalone reference strings (styles
`M.T. Table of Contents`, `M.T. Text - Lesson Title Scrip Reference`) and the
colon-bearing prose strings from the committed Q1–Q4 masters into a committed
fixture, and unit-test `parseVerseReferences` against it: every reference string
must parse to non-null segments (recall = 100%) and every prose string must
parse to `null` (precision = 100%). This makes SC-003 a deterministic unit gate
rather than a claim depending on files outside the repo.

## Round-trip verification (SC-004)

**Decision**: A `*.integration.test.ts` normalizes a committed master, runs the
merge/download path, and converts through `soffice --headless` to assert visible
text/layout identity with the original. Per project MEMORY, `soffice` hangs
inside the Bash sandbox and jest needs localhost Postgres — the integration
suite runs with the sandbox disabled.
