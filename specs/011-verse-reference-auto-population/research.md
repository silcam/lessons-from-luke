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

## Decision 1 — Span-normalization mechanics (FR-001, FR-003) — REVISED in deepen-plan Pass 2

> **Pass 2 correction.** Red Team Pass 1 found (on a 2-file sample) that the
> corpus's isolated-reference paragraphs are already `<text:s/>`-fragmented, so
> the span rewrite described below would never fire. This pass **re-verified
> that finding against the full committed corpus** (all 67 `test/docs/serverDocs/`
> masters, spanning Luke Q1–Q4) by unzipping each odt's `content.xml` and
> classifying every paragraph in the two SC-003 target styles
> (`M.T. Text - Lesson Title Scrip Reference`, `M.T. Table of Contents`):
>
> - **96 reference-shaped paragraphs** (matching `\d+:\d`) — **all 96** already
>   contain `<text:s/>` element children splitting book from numeric
>   (`Luke <text:s/>1:5–25`). **Zero** are a single literal-space text run.
> - **0 styled-`<text:span>` reference paragraphs.**
> - **36 non-reference paragraphs** in the TOC style are single-run (lesson
>   titles, truths, story titles) — expected, and correctly excluded by the
>   reference shape check.
>
> This confirms Red Team Pass 1's CRITICAL finding holds **corpus-wide, not just
> on the sampled 2 files**. The decision below is corrected accordingly: the
> span rewrite is **not** the mechanism that satisfies SC-003 for the existing
> corpus (it has nothing to do there — the split already exists). It is
> retained only as a **defensive, forward-compatible safety net** per FR-001/FR-003
> for a hypothetical future paragraph authored as a single literal-space run
> (e.g. a different authoring tool or manual retype that doesn't use `text:s`).
> Its unit tests exercise this synthetic single-run case; it is **not** the
> source of the SC-003 96/0 evidence (see revised SC-003 derivation below).

**Decision**: Normalize **upstream of parse** by rewriting the master odt's
`content.xml` so that an isolated-reference paragraph's single text run becomes a
sequence of `<text:span>` runs — one per book-name token and one per numeric
reference — separated by the original literal whitespace as plain text nodes.
Persist the rewritten odt as the master source (so parse and merge agree). A
new module `src/server/xml/normalizeReferences.ts` performs the unzip → rewrite
`content.xml` → rezip, mirroring `mergeXml`'s unzip/zip structure. It is invoked
in the English-master path only (`uploadEnglishDoc` after `saveDoc`, and the
re-normalization task after copying the odt), **never** inside `parseDocStrings`
(which non-English uploads also call). **Write to a temp odt and atomically
rename over the original only on success** (Red Team MEDIUM-1) — never rewrite
`content.xml` in place inside the just-saved master, so a crash between unzip
and rezip cannot leave a corrupt master.

On the current corpus this rewrite is a **no-op for all 96 known references**
(they are already spans-of-a-kind via `<text:s/>`, which the parser already
treats as separators). It only activates for a paragraph matching the
single-run precondition, which does not occur today but is not structurally
prevented from occurring in future content.

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

## Decision 2 — Shape-based detection and the reference grammar (FR-002, FR-008) — REVISED in deepen-plan Pass 2

> **Pass 2 correction.** Because every corpus reference is already fragmented
> (Decision 1 above), `parseVerseReferences` never receives a combined
> `book chapter:verse` string from the live upload pipeline for existing
> content — the pipeline hands `normalizeReferences` individual paragraphs that
> either already contain `<text:s/>` (skipped, nothing to do) or don't look like
> a reference at all (skipped, correctly). `parseVerseReferences` therefore
> classifies **inputs to the defensive single-run path only** — it is exercised
> by `normalizeReferences`' precondition check and by its own unit fixture, not
> by anything in the corpus today. This does not remove it from the design (it
> is still the only place the grammar for FR-002/FR-008 is expressed, and
> `normalizeReferences` needs it to know _where_ to split a genuine single-run
> paragraph), but its role is now explicitly "defensive grammar for a case that doesn't occur in the current corpus" rather than "the mechanism
> that produces the 96 known references."

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

**Rationale**: The 96 corpus references all take the `book chapter:verse` shape;
prose strings contain sentence punctuation/lowercase connective words that break
the whole-string anchor, so they never qualify — this is what delivers the
_grammar's_ 0-false-positive property. **Pass 2 note**: for the current corpus
this grammar is only exercised by unit fixtures (synthetic single-run inputs),
since the live pipeline never hands it a combined string (Decision 1
correction). It remains the book-agnostic contract for FR-002/FR-008.

**Alternatives rejected**: hardcoded book list (fails FR-002 as the curriculum
expands past Luke); style-name-only detection (the corpus benchmark uses styles
only to _enumerate_ the 96, but per FR-008 detection must be shape-based so new
styles/books work without code changes).

## Decision 3 — Extend the shared `canAutoTranslate` predicate (FR-005, FR-006) — REVISED in deepen-plan Pass 2

> **Pass 2 correction (Red Team HIGH-2).** A bare colon addition to the
> permissive char class (`/^[\d–\-:[\]()\s]*$/`) admits any `d:d`-shaped string
> — times (`3:00`), ratios (`10:1`) — not just verse numerics, and silently
> hides them from the update-issues flow forever. The fix is a **union**, not a
> replacement: keep the existing permissive class (picture numbers like `12`,
> `[3]` must keep matching — a strict verse-only regex would regress that) and
> OR it with a verse-numeric shape.

**Decision**: `canAutoTranslate(text)` becomes:

```ts
const PICTURE_OR_BRACKET = /^[\d–\-[\]()\s]*$/; // unchanged existing class (no colon)
const VERSE_NUMERIC = /^\d+:\d+(?:[–-]\d+(?::\d+)?)?$/; // chapter:verse[-verse[:verse]]
export function canAutoTranslate(text: string): boolean {
  return PICTURE_OR_BRACKET.test(text) || VERSE_NUMERIC.test(text);
}
```

**Unify** the duplicated predicate — export this one `canAutoTranslate` and have
`tasks/defaultTranslateAll.ts` import it instead of its private
`shouldAutoTranslate` copy (DRY, constitution VII).

**Blast radius (verified)**:

- `defaultTranslations` (project create): numeric reference strings
  (`1:5–25`, `18:35–19:10`) now match `VERSE_NUMERIC` and auto-populate
  verbatim — exactly FR-005. Book-name strings (`Luke`, `1 Corinthians`)
  contain letters → match neither branch → stay translatable (FR-007).
  Picture numbers (`12`, `[3]`) still match `PICTURE_OR_BRACKET` — **regression
  check**: this is the exact case a naive char-class-plus-colon edit would have
  left untouched, but is worth an explicit unit assertion given the rewrite.
- `findTSubs.usefulEngSub`: a sub whose English "from" strings are all
  auto-translatable is filtered out. Numeric refs becoming auto-translatable
  means they no longer surface as update issues — desired. Book names remain
  non-auto-translatable, so the one-string→multi-string split still surfaces
  (see Decision 4).

**HIGH-2's residual risk is not fully eliminated by regex alone** — `VERSE_NUMERIC`
still matches `3:00` (a time), because a time and a verse reference are
lexically identical (`\d+:\d+`). This is an accepted, documented limitation, not
a solved one. Two standing mitigations, both required:

1. **One-time scan of current masters** (this pass): every English master
   string matching `VERSE_NUMERIC` in the committed corpus was inspected — all
   96 are genuine verse numerics that were already `<text:s/>`-isolated from a
   book-name paragraph (Decision 1 evidence); none are times/ratios. Recorded
   here as the audit trail FR-005/SC-003 rely on.
2. **Standing regression guard for future masters** (new, addresses "nothing
   guards future masters"): add a **non-blocking** check — logged, not
   rejected, so legitimate future colon-bearing content is never silently
   rejected — that runs on every English upload and reports any _newly
   introduced_ master string matching `VERSE_NUMERIC` whose paragraph style is
   **not** one of the two known reference styles (`M.T. Text - Lesson Title
Scrip Reference`, `M.T. Table of Contents`) or a future style using the
   `normalizeReferences` book/numeric split. This surfaces a stray `3:00` for
   operator review without blocking upload. Implemented as a log line in
   `uploadEnglishDoc`, covered by a unit test asserting the log fires for a
   non-reference-style colon-numeric string and does not fire for the known
   reference styles.

**Alternative rejected**: a sibling numeric-reference predicate. It would leave
`findTSubs` unaware that numeric refs are auto-fillable, causing them to surface
as noise in the update-issues flow. Extending the shared predicate is both
simpler and gives the correct filtering.

## Decision 4 — Update-issues carry-over for the split (FR-009) — REVISED in deepen-plan Pass 2

> **Pass 2 correction.** This scenario (`Luke 1:5–25` as one master string,
> split into `Luke` + `1:5–25` by re-normalization) **does not occur for the
> current corpus** — the corpus already has `Luke` and `1:5–25` as separate
> master strings (Decision 1 evidence), so `renormalizeEnglish` finds nothing to
> split and no version-bump/update-issue is produced for any of the 96 known
> references (see Decision 6's no-op correction). The mechanism below remains
> correct and is retained **for the defensive single-run path only** — if a
> future paragraph genuinely is authored as one combined string and later gets
> split (by upload-time normalization or a future re-normalization run), this
> is how the split surfaces to translators. FR-009's acceptance is now verified
> against a **synthetic single-run fixture**, not a real corpus master (there is
> no real corpus master that exercises this path today).

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
`tStrings` (FR-013). This must be **observed against a synthetic single-run
fixture** in an integration check (not a real corpus master — none qualifies).

## Decision 5 — Backfill extends `defaultTranslateAll` (FR-010, FR-014)

**Decision**: The backfill **is** `tasks/defaultTranslateAll.ts` running with
the unified predicate (Decision 3's union form). It already (a) skips any
master already present in a language (`!existingTStrings.find(...masterId...)`)
so it never overwrites translator work (FR-010) and (b) is idempotent — a
second run adds nothing (FR-014). The only change is importing the unified
predicate.

**Pass 2 note**: this is now the **primary mechanism that satisfies FR-005/SC-003
for the current corpus** — the 96 numeric strings already exist as master
strings today; extending `canAutoTranslate` and running this backfill is what
makes them auto-populate for new and existing projects. Re-normalization
(Decisions 1, 4, 6) is not required for the current corpus's SC-003 outcome.

**Alternative rejected**: a new sibling script. The precedent already exists and
is idempotent; a second script would re-duplicate the predicate the plan is
unifying.

## Decision 6 — One-time re-normalization task (FR-011, FR-012, FR-014) — REVISED in deepen-plan Pass 2

> **Pass 2 correction (Red Team MEDIUM-2).** Because the corpus is already
> fully `<text:s/>`-fragmented (Decision 1), this task **runs and finds nothing
> to split on any of the 96 known references** — every invocation is a
> structural no-op against real content. The original design ("copies the odt
> to the next version, runs `normalizeReferences`, then `parseDocStrings` +
> `saveDocStrings`") would still bump the lesson `version` and produce an empty
> diff on **every** run, which is exactly MEDIUM-2's "phantom update-issues
> entry" risk — and it would do so for **every stored lesson, every time the
> task is run**, not just once. **Corrected decision**: `normalizeReferences`
> reports whether it changed anything (return a boolean / changed-paragraph
> count). `renormalizeEnglish` only copies the odt to a new version and calls
> `parseDocStrings` + `saveDocStrings` **when `normalizeReferences` reports a
> change**; otherwise it skips the lesson entirely (no version bump, no
> phantom update-issue, no odt copy). Against the current corpus this means
> the task **no-ops for all stored lessons** — which is the empirically correct
> outcome, not a bug, since FR-005/SC-003 for the current corpus is delivered
> by Decision 3 + Decision 5 (predicate + backfill) alone. The task remains in
> the design so a future single-run paragraph is still caught and routed
> through the update-issues flow.

**Decision**: A new operator-run task `src/server/tasks/renormalizeEnglish.ts`,
modeled on `reparseEnglish.ts`, iterates all stored lessons and, per lesson,
runs `normalizeReferences` against a scratch copy of the odt first; only if it
reports a change does the task copy the odt to the next version and run
`parseDocStrings` + `saveDocStrings`. This gains split references without manual
re-uploads and routes any real change through the version/update-issues flow
(Decision 4), while producing zero version churn for lessons with nothing to
split — which, per the corpus evidence above, is every lesson today.
Idempotent: re-running finds no single-run reference paragraph to split (they
are already spans, or were already handled by a prior run) → no duplicate
strings, no destructive change, no version bump (FR-014). Operational order is
documented: **re-normalize first, then backfill** (FR-012), captured in
quickstart.md — though for the current corpus the re-normalize step is
expected to report "0 lessons changed."

**Alternative rejected**: reusing `reparseEnglish` directly — it does not
normalize; adding normalization to it would change behaviour for callers that
only want a re-parse. A sibling task keeps the concern separate and explicit.

## SC-003 benchmark corpus — verification is reproducible in-repo — REVISED in deepen-plan Pass 2

> **Pass 2 correction.** The unit-gate strategy below (parse the whole
> `book chapter:verse` string) does not match what the live pipeline produces
> for the corpus (Decision 1/2 corrections). SC-003 is **re-derived** to test
> the actual mechanism: (a) `parseVerseReferences`/`normalizeReferences` unit
> fixtures cover the _defensive_ single-run case only (synthetic, since no real
> paragraph qualifies); (b) the corpus-derived recall/precision claim is
> re-targeted at the **predicate**, not the grammar — every one of the 96
> already-isolated numeric strings (`1:5–25`, `18:35–19:10`, …) extracted from
> the committed Q1–Q4 masters must satisfy `canAutoTranslate` after the Decision
> 3 change, and every one of the colon-bearing prose numeric substrings (same
> corpus) must **not** appear as a standalone master string requiring the
> predicate at all — they remain embedded in their prose paragraph's single
> master string, which is untouched. "0 of N prose strings affected" is
> re-defined as **prose paragraph text and rendering are unchanged** (Red Team
> HIGH-1's reconciliation — see data-model.md), which holds structurally: the
> feature never touches a paragraph containing prose.

**Finding**: The committed `test/docs/serverDocs/` masters cover **Luke Q1–Q4**
(all 67 files, series 1–4). Full-corpus extraction (not just a 2-file sample)
confirms **96** reference-shaped paragraphs across the two SC-003 target
styles, **100%** of which are already `<text:s/>`-fragmented, and **0** are a
single literal-space run or styled span. The 96/0 acceptance gate is therefore
reproducible from the repository, **not** from the off-repo `~/Downloads` copy,
and is now verified against the **entire** committed corpus rather than a
sample.

**Test-strategy consequence**: Extract the standalone numeric reference strings
(already split, styles `M.T. Table of Contents`, `M.T. Text - Lesson Title Scrip
Reference`) and the colon-bearing prose strings from the committed Q1–Q4
masters into a committed fixture. Unit-test the **extended `canAutoTranslate`**
against it: every extracted numeric reference string must return `true`
(recall = 100%), and no prose _paragraph_ is affected because prose master
strings are never split or fed to the predicate individually — the prose
`Bible Story: …1:5–25` paragraph stays one master string containing letters,
so `canAutoTranslate` on the whole prose string is `false` and it is never
auto-translated (precision, redefined at paragraph granularity, holds). This
makes SC-003 a deterministic unit gate rather than a claim depending on files
outside the repo, and it is now grounded in the mechanism that actually runs.

## Round-trip verification (SC-004)

**Decision**: A `*.integration.test.ts` normalizes a committed master, runs the
merge/download path, and converts through `soffice --headless` to assert visible
text/layout identity with the original. Per project MEMORY, `soffice` hangs
inside the Bash sandbox and jest needs localhost Postgres — the integration
suite runs with the sandbox disabled.
