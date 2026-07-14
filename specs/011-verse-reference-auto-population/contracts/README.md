# Contracts: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population

This feature introduces **no new HTTP endpoints**. Per constitution VII
(simplicity, YAGNI), normalization rides the existing upload endpoint,
auto-population rides the existing language-create endpoint, and the two
operational functions are **operator-run CLI tasks**, not routes. The "contracts"
here are therefore (a) the unchanged HTTP surfaces whose behaviour shifts and
(b) the CLI task invocations.

## Unchanged HTTP endpoints (behaviour extended, signature identical)

| Method & path                                         | Change                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /api/admin/documents` (English upload)          | Master odt is normalized (isolated-reference paragraphs split into book + numeric spans) **before** parse/persist. |
| `POST /api/admin/languages` (create language)         | Numeric reference strings now auto-populate verbatim from English (via extended `canAutoTranslate`).               |
| `GET /api/admin/lessons/:lessonId/lessonUpdateIssues` | After re-normalization, surfaces the one-string→multi-string split with the old combined reference as the "from".  |

Request/response JSON shapes are unchanged for all three.

## Internal function contracts (new / modified)

> **⚠ BLOCKED pending `/sp:03-plan` revision (Red Team Pass 1).** Running the actual
> parser on the actual corpus shows that reference paragraphs in **both** SC-003 target
> styles are `<text:s/>`-fragmented (`Luke <text:s/>1:5–25`), so the existing parser
> **already** emits `Luke` and `1:5–25` as separate strings, and `normalizeReferences`'s
> "single unstyled text run" precondition **skips all 95** of them. `parseVerseReferences`
> never receives a combined `book chapter:verse` string in the live pipeline. The two
> internal function contracts below therefore do **not** match the real data flow and must
> be corrected before `/sp:05-tasks`. See plan.md "Adversarial Review Findings (Red Team —
> Pass 1)" for evidence.

### `parseVerseReferences(text: string): VerseReferenceSegment[] | null` (new, core)

- **Returns** ordered non-empty segments iff the entire trimmed `text` is one or
  more `book chapter:verse` references; otherwise `null`.
- **Guarantees**: book-agnostic (no book list); preserves original dash
  character; leading digit of a numbered book stays in `book`; never returns
  non-null for prose containing an embedded reference.

### `normalizeReferences(odtFilepath: string): void` (new, server)

- **Effect**: rewrites `content.xml` inside the odt in place, wrapping each
  qualifying isolated-reference paragraph's single unstyled text run into
  `<text:span>` book/numeric runs separated by the original literal whitespace.
- **Precondition for splitting a paragraph**: inline content is a single unstyled
  text run (no existing styled spans / soft breaks). Otherwise the paragraph is
  left untouched (round-trip red-line).
- **Guarantee**: rendered output is visually identical to the original
  (FR-003, SC-004).
- **⚠ Red Team (CRITICAL):** the "single unstyled text run" precondition skips every
  `<text:s/>`-fragmented reference paragraph — which is **all 95** in the sampled corpus —
  so this function rewrites nothing there. Its role and SC-003 recall basis must be
  re-derived in `/sp:03-plan`.
- **⚠ Red Team (MEDIUM-1):** "in place" rewrite of the just-saved master risks a corrupt
  master on crash between unzip and rezip. Write a temp odt and atomically rename on
  success instead.

### `canAutoTranslate(text: string): boolean` (modified, unified)

- Pattern `/^[\d–\-:[\]()\s]*$/`. Single exported definition imported by
  `defaultTranslations`, `findTSubs`, and `defaultTranslateAll` (removes the
  duplicated `shouldAutoTranslate`).
- **⚠ Red Team (HIGH-2):** this char class admits **any** `d:d` string (times `3:00`,
  ratios `10:1`), not just verse numerics — those auto-populate without review and are
  filtered out of the update-issues flow. The one-time scan (research Decision 3) covers
  today's masters but not future ones. Consider a true verse-numeric shape
  (`\d+:\d+(?:[–-]\d+(?::\d+)?)?`) instead of the permissive class. Also note (HIGH-1):
  `1:5–25` in an isolated reference and in `Bible Story: …1:5–25` share **one master id**
  (dedup is by text; `motherTongue` does not gate `defaultTranslations`), so
  auto-population is master-granular — SC-003 paragraph-level precision is not
  structurally enforceable.

## CLI task contracts (operator-run, server)

Run in the documented order (FR-012): **re-normalize first, then backfill.**

### 1. `renormalizeEnglish` — `src/server/tasks/renormalizeEnglish.ts`

- **Invocation**: `node dist/server/server/tasks/renormalizeEnglish.js` (via the
  built server tree, same convention as `reparseEnglish` / `defaultTranslateAll`).
- **Effect**: for every stored lesson, copy the master odt to the next version,
  run `normalizeReferences`, then `parseDocStrings` + `saveDocStrings` (bumps
  version → routes through the update-issues flow).
- **Idempotent** (FR-014): a second run splits nothing (paragraphs already
  spans) and creates no duplicate strings.

### 2. `defaultTranslateAll` (backfill) — `src/server/tasks/defaultTranslateAll.ts`

- **Invocation**: `node dist/server/server/tasks/defaultTranslateAll.js`.
- **Effect**: for every language, insert every English master string matching the
  unified `canAutoTranslate` predicate that the language is missing — including
  the newly split numeric reference strings.
- **Guarantee**: skips any master already present in a language → never
  overwrites translator work (FR-010); idempotent (FR-014).
