# Contracts: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population

This feature introduces **no new HTTP endpoints**. Per constitution VII
(simplicity, YAGNI), normalization rides the existing upload endpoint,
auto-population rides the existing language-create endpoint, and the two
operational functions are **operator-run CLI tasks**, not routes. The "contracts"
here are therefore (a) the unchanged HTTP surfaces whose behaviour shifts and
(b) the CLI task invocations.

## Unchanged HTTP endpoints (behaviour extended, signature identical)

| Method & path                                         | Change                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/admin/documents` (English upload)          | Master odt passes through `normalizeReferences` before parse/persist. For the current corpus this is a no-op (paragraphs already `<text:s/>`-fragmented); it is a defensive guard for a future single-run reference paragraph. |
| `POST /api/admin/languages` (create language)         | Numeric reference strings now auto-populate verbatim from English (via extended `canAutoTranslate`). This is the mechanism that actually delivers the feature for the current corpus.                                          |
| `GET /api/admin/lessons/:lessonId/lessonUpdateIssues` | Unchanged behaviour; only surfaces a one-string→multi-string split if `normalizeReferences` ever reports a real change (not expected for the current corpus — see `renormalizeEnglish` below).                                 |

Request/response JSON shapes are unchanged for all three.

## Internal function contracts (new / modified)

> **Resolved in deepen-plan Pass 2.** Red Team Pass 1 found (2-file sample)
> that reference paragraphs in both SC-003 target styles are already
> `<text:s/>`-fragmented, so `normalizeReferences`'s "single unstyled text run"
> precondition skips them and `parseVerseReferences` never receives a combined
> string in the live pipeline. **This pass re-verified the finding against the
> full committed corpus** (all 67 masters, Luke Q1–Q4): 96/96 reference-shaped
> paragraphs are already fragmented; 0 are single-run. The contracts below are
> corrected: `parseVerseReferences`/`normalizeReferences` are retained as a
> **defensive path for a future single-run paragraph**, not the mechanism that
> produces the 96 known references (which already exist as separate master
> strings today). See plan.md "Adversarial Review Findings (Red Team — Pass 1)"
> and research.md Decisions 1–6 for the full correction and evidence.

### `parseVerseReferences(text: string): VerseReferenceSegment[] | null` (new, core — defensive path)

- **Returns** ordered non-empty segments iff the entire trimmed `text` is one or
  more `book chapter:verse` references; otherwise `null`.
- **Guarantees**: book-agnostic (no book list); preserves original dash
  character; leading digit of a numbered book stays in `book`; never returns
  non-null for prose containing an embedded reference.
- **Corpus status**: not exercised by any real corpus master (all 96 known
  references are already `<text:s/>`-fragmented before this function would run
  on them). Covered by synthetic unit fixtures only; kept in the design to
  satisfy FR-001/FR-002/FR-008 for a hypothetical future single-run paragraph.

### `normalizeReferences(odtFilepath: string): { changed: boolean }` (new, server — defensive path)

- **Effect**: writes to a **temporary odt** and atomically renames it over the
  original **only on success** (Red Team MEDIUM-1 — never rewrite the just-saved
  master's `content.xml` in place, to avoid a corrupt master on a crash between
  unzip and rezip). Wraps each qualifying isolated-reference paragraph's single
  unstyled text run into `<text:span>` book/numeric runs separated by the
  original literal whitespace.
- **Precondition for splitting a paragraph**: inline content is a single unstyled
  text run (no existing `<text:s/>`, styled spans, or soft breaks). Otherwise the
  paragraph is left untouched (round-trip red-line). **This precondition means
  the function is a no-op against every known corpus master** — all 96
  reference-shaped paragraphs already contain `<text:s/>` and are correctly
  skipped. This is by design, not a defect: the split those paragraphs need
  already happened at authoring time.
- **Return value** (revised from `void`): reports whether any paragraph was
  actually changed, so callers (`renormalizeEnglish`) can skip the
  version-bump/parse/save path entirely when nothing changed (Red Team
  MEDIUM-2).
- **No-op leaves the odt byte-identical** (Red Team MEDIUM-5): when no paragraph
  qualifies for splitting (the case for every current-corpus master, and every
  English upload today), the function returns `{ changed: false }` and does **not**
  unzip/rezip/rename — the input odt is left untouched byte-for-byte. The temp
  write + atomic rename runs **only** when at least one paragraph is actually
  rewritten. This prevents every English upload from needlessly rezipping (and
  thereby perturbing) the persisted master that parse and merge both read.
- **Guarantee**: rendered output is visually identical to the original
  (FR-003, SC-004).

### `canAutoTranslate(text: string): boolean` (modified, unified — primary mechanism for the current corpus)

- Pattern: union of the existing picture-number/bracket class and a strict
  verse-numeric shape —
  `/^[\d–\-[\]()\s]*$/.test(text) || /^\d+:\d+(?:[–-]\d+(?::\d+)?)?$/.test(text)`.
  Single exported definition imported by `defaultTranslations`, `findTSubs`, and
  `defaultTranslateAll` (removes the duplicated `shouldAutoTranslate`).
- **This is the mechanism that satisfies FR-005/SC-003 for the current corpus**:
  the 96 numeric strings (`1:5–25`, `18:35–19:10`, …) already exist as separate
  master strings; this predicate change is what makes them auto-populate.
- **Red Team HIGH-2, accepted residual risk**: the verse-numeric branch also
  matches a time (`3:00`) or ratio (`10:1`) shape — this is not solvable by
  regex alone, since a time and a verse reference are lexically identical.
  Mitigated by (a) a one-time scan of the current corpus (this pass — all 96
  matches are genuine verse numerics, none are times/ratios) and (b) a standing
  **non-blocking** log emitted for any `VERSE_NUMERIC`-shaped paragraph whose
  paragraph style is not one of the two known reference styles, so a future
  `3:00` is surfaced for operator review rather than silently vanishing from the
  update-issues flow. **Location (Red Team MEDIUM-5→MEDIUM-4 correction)**: this
  log lives in the **XML layer** (`normalizeReferences` / a `parse`-layer helper),
  **not** in `uploadEnglishDoc`. `DocString` and the master strings carry only
  `{ type, xpath, motherTongue, text }` — no `text:style-name` — so
  `uploadEnglishDoc` cannot tell a reference-style `1:5–25` from a stray `3:00`.
  The XML layer already walks `content.xml` paragraphs and their `text:style-name`,
  so the style-aware check must run there. **Granularity (Red Team MEDIUM-7
  correction)**: the check must run per **text node / fragment**, not per
  paragraph text. A stray numeric only becomes an auto-fillable master string when
  it is a separate `<text:s/>`-fragmented text node (a bare `3:00` master string);
  a whole paragraph's text is never a bare numeric (`Luke <text:s/>1:5–25`
  includes the book; `Meet at 3:00 …` is a single non-matching run). So for each
  non-whitespace text node whose text matches `VERSE_NUMERIC`, resolve its
  ancestor `text:p`'s `text:style-name` and log iff that style is not a known
  reference style — a paragraph-text-granular check would never fire on the
  fragmented stray numeric it is meant to catch. Picture numbers (`12`, `[3]`) are
  unaffected — they still match only the unchanged first branch.
- **Red Team MEDIUM-6, accepted class-wide tradeoff**: reclassifying `1:5–25`
  into the auto-translatable class means numeric references inherit that class's
  existing "corrections don't propagate to existing projects" behaviour —
  `defaultTranslateAll` inserts only masters a language is **missing** (never
  updates a present master), and `usefulEngSub` **suppresses** every
  auto-translatable string from the update-issues flow. So a future English
  numeric **correction** (e.g. `1:5–25` → `1:5–26`, not a split) neither
  re-propagates to an in-progress project nor surfaces to its translator; the
  project keeps the stale-but-valid numeric until manually fixed. This is **not a
  feature-introduced regression** — picture numbers (`12`, already
  auto-translatable) have the identical property today. Numerics join the
  established class and inherit its accepted tradeoff; impact is bounded (a valid,
  language-neutral numeric; no history loss, no destroyed translator work; rare
  trigger). Accepted as-is, in the same category as the HIGH-2 `3:00` and HIGH-1
  dedup residuals; propagating corrections across the whole auto-translatable
  class would be a separate follow-on, not part of this feature.
- **Red Team HIGH-1, ratified provisionally (flagged for `/sp:02-specify`
  confirmation)**: `1:5–25` in an isolated reference and in
  `Bible Story: …1:5–25` share **one master id** (dedup is by text;
  `motherTongue` does not gate `defaultTranslations`), so auto-population is
  master-granular. SC-003's "0 prose strings affected" is redefined as _no
  prose paragraph's text or rendering changes_ — which holds structurally,
  since the numeric text is language-neutral — rather than "the shared master
  id is exempt," which is not achievable at this layer.

## CLI task contracts (operator-run, server)

Run in the documented order (FR-012): **re-normalize first, then backfill.**
For the current corpus, the re-normalize step is expected to report zero
lessons changed (see below) — the backfill step is what actually delivers the
feature for existing projects.

### 1. `renormalizeEnglish` — `src/server/tasks/renormalizeEnglish.ts` (revised — no-op on unchanged, Red Team MEDIUM-2)

- **Invocation**: `node dist/server/server/tasks/renormalizeEnglish.js` (via the
  built server tree, same convention as `reparseEnglish` / `defaultTranslateAll`).
- **Effect**: for every stored lesson, run `normalizeReferences` against a
  scratch copy of the master odt first. **Only if it reports `changed: true`**
  does the task copy the odt to the next version and run `parseDocStrings` +
  `saveDocStrings` (bumps version → routes through the update-issues flow).
  Lessons with no change are skipped entirely — no odt copy, no version bump,
  no phantom update-issue.
- **Expected result on the current corpus**: 0 of the stored lessons report a
  change (all reference paragraphs are already `<text:s/>`-fragmented). This is
  the correct, evidence-backed outcome, not a bug — FR-005/SC-003 for the
  current corpus is delivered by the predicate change + backfill below.
- **Idempotent** (FR-014): a second run reports the same "0 changed" result (or,
  for a future genuinely-split lesson, splits nothing further) and creates no
  duplicate strings or version churn.

### 2. `defaultTranslateAll` (backfill) — `src/server/tasks/defaultTranslateAll.ts`

- **Invocation**: `node dist/server/server/tasks/defaultTranslateAll.js`.
- **Effect**: for every language, insert every English master string matching the
  unified `canAutoTranslate` predicate that the language is missing — including
  the 96 already-existing numeric reference strings.
- **Guarantee**: skips any master already present in a language → never
  overwrites translator work (FR-010); idempotent (FR-014).
