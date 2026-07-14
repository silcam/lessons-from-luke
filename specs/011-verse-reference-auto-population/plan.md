# Implementation Plan: Auto-Populate Verse-Reference Strings

**Branch**: `011-verse-reference-auto-population` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-verse-reference-auto-population/spec.md`

## Summary

> **Revised in deepen-plan Pass 2** (see "Adversarial Review Findings" below for
> the full evidence trail). Full-corpus verification (all 67 committed masters,
> Luke Q1–Q4) confirms Red Team Pass 1's finding **holds corpus-wide**: every one
> of the 96 known isolated verse references is **already** `<text:s/>`-fragmented
> into separate `Luke` and `1:5–25` `DocString`s by the existing parser — the
> two-string model this feature wants already exists structurally for the
> current corpus. The mechanism is corrected accordingly.

Split isolated verse references in English masters into a translatable **book
name** (`Luke`) and a language-neutral **numeric reference** (`1:5–25`) so the
book name is translated once (propagating via master-string deduplication) and
the numeric part auto-populates like picture numbers. For the **current
corpus**, this two-string split already exists (authored via `<text:s/>`), so
the feature's actual, primary mechanism is extending the shared
`canAutoTranslate` predicate (union with a verse-numeric shape, not a bare
colon addition) so the already-existing numeric strings auto-populate, plus
running the existing idempotent backfill (`defaultTranslateAll`) for existing
projects. A span-rewrite mechanism (`normalizeReferences`/`parseVerseReferences`,
upstream of parse, **zero parser/merge changes**) is retained as a **defensive,
forward-compatible safety net** for a hypothetical future paragraph authored as
a single literal-space run — it is a no-op against every known corpus master
today. The one-time re-normalization task (`renormalizeEnglish`) reports "0
lessons changed" against the current corpus and is a no-op-with-guard (no
version bump when nothing changes), existing only to catch that same future
case. Server-side only; desktop inherits auto-population via the shared core
path. See [research.md](./research.md) for the evidence behind each decision,
now revised with corpus-wide verification.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), libxmljs2 (ODT XML rewrite/parse/merge), existing `parse`/`mergeXml`/`saveDocStrings` pipeline, LibreOffice `soffice --headless` (round-trip verification), React 16 + Redux Toolkit (existing translation & update-issues UI, unchanged)
**Storage**: No new tables/columns/migrations. Domain data via the `Persistence` interface (`storage.tStrings`, `addOrFindMasterStrings`, `saveDocStrings`, `updateLesson`). Master odt files in the existing `docStorage`.
**Testing**: Jest unit TDD (shape detector, predicate, XML transform); `*.integration.test.ts` via `soffice --headless` for round-trip identity; committed Q1–Q4 masters as the SC-003 benchmark fixture.
**Target Platform**: Linux/macOS server (web). Desktop inherits auto-population through the isomorphic core; no desktop-specific work (spec Assumptions, Session 2026-07-14 clarification).
**Project Type**: Web (isomorphic four-layer: core / server / frontend / desktop). Changes land in core (`util`) and server (`xml`, `actions`, `tasks`).
**Performance Goals**: Not performance-sensitive — normalization runs at upload and in one-off operator tasks over ~56 documents.
**Constraints**: Round-trip must be visually identical (SC-004); SC-003 requires 100% precision AND recall (95 matched / 0 false positives); no source mutation or history loss (FR-013); tasks idempotent (FR-014). `soffice` and jest run with the Bash sandbox disabled (project MEMORY).
**Scale/Scope**: ~95 references and ~160 colon-bearing prose strings across Luke Q1–Q4; ~56 master documents to re-normalize.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Test-First (NON-NEGOTIABLE)**: Unit TDD for `parseVerseReferences`, the
  unified `canAutoTranslate`, and the `normalizeReferences` XML transform (all
  pure/mockable). ODT round-trip (external binary) covered by `*.integration.test.ts`
  per the document-processing clause. **PASS** (test-first ordering enforced in
  sp:05-tasks; ATDD outer loop below).
- **II. Type Safety**: Explicit return types, no `any`, `type`-only imports, new
  `VerseReferenceSegment` interface PascalCase. **PASS**.
- **III. Code Quality**: JSDoc on the new public `parseVerseReferences`,
  `normalizeReferences`, and unified `canAutoTranslate`; import ordering. **PASS**.
- **IV. Pre-commit Gates**: `yarn typecheck` + lint-staged + related jest. **PASS**.
- **V. Warnings**: zero-tolerance maintained. **PASS**.
- **VI. Layered Architecture**: `parseVerseReferences` is pure/isomorphic → lives
  in `src/core/util`. Server-only concerns (XML rewrite, tasks) stay in `server`.
  All domain access via `Persistence`; no new persistent storage. Desktop
  inherits auto-population via core with no desktop code. **PASS**.
- **VII. Simplicity**: No new endpoints, no new tables. **Unifies** the currently
  duplicated auto-translate predicate (DRY). Reuses `reparseEnglish` and
  `defaultTranslateAll` precedents. **PASS**.

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/011-verse-reference-auto-population/
├── plan.md              # This file
├── research.md          # Phase 0 output (6 decisions + corpus/round-trip verification)
├── data-model.md        # Phase 1 output (entities, VerseReferenceSegment, predicate change)
├── quickstart.md        # Phase 1 output (dev walkthrough + operator sequence)
├── contracts/
│   └── README.md        # Phase 1 output (unchanged endpoints + CLI task contracts)
└── tasks.md             # Phase 2 output (sp:05-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── util/
│       ├── verseReference.ts            # NEW: parseVerseReferences + VerseReferenceSegment (pure, isomorphic).
│       │                                 #      Defensive path only — synthetic fixtures, not exercised by
│       │                                 #      the real corpus (see Pass 2 correction below).
│       └── verseReference.test.ts       # NEW: unit tests over synthetic single-run fixtures (defensive path)
├── server/
│   ├── xml/
│   │   ├── normalizeReferences.ts       # NEW: temp-file + atomic-rename rewrite of content.xml reference
│   │   │                                 #      paragraphs into spans. No-op against the current corpus
│   │   │                                 #      (all 96 known references are already <text:s/>-fragmented);
│   │   │                                 #      defensive guard for a future single-run paragraph. Returns
│   │   │                                 #      { changed: boolean } (MEDIUM-1/MEDIUM-2 corrections).
│   │   ├── normalizeReferences.test.ts  # NEW: unit tests over content.xml fixtures (incl. already-fragmented
│   │   │                                 #      input asserting no-op, per corpus evidence)
│   │   └── normalizeReferences.integration.test.ts  # NEW: soffice round-trip identity (SC-004)
│   ├── actions/
│   │   ├── uploadDocument.ts            # EDIT: invoke normalizeReferences on English master after saveDoc
│   │   └── defaultTranslations.ts       # EDIT: canAutoTranslate = union(existing class, verse-numeric shape);
│   │                                     #      single exported source (Pass 2 correction — not a bare ':' add)
│   └── tasks/
│       ├── defaultTranslateAll.ts       # EDIT: import unified canAutoTranslate (drop shouldAutoTranslate).
│       │                                 #      Primary mechanism delivering FR-005/SC-003 for the current corpus.
│       └── renormalizeEnglish.ts        # NEW: one-time re-normalization task (mirrors reparseEnglish).
│                                         #      Skips version bump when normalizeReferences reports no change
│                                         #      (MEDIUM-2 correction) — expected to report 0 changed lessons
│                                         #      against the current corpus.
└── (frontend/, desktop/ unchanged)

test/docs/serverDocs/                    # existing Luke Q1–Q4 masters = SC-003 benchmark source (all 67 files
                                          # verified corpus-wide in deepen-plan Pass 2: 96/96 already fragmented)
```

**Structure Decision**: Web / isomorphic four-layer. The book-agnostic shape
detector is pure and isomorphic → `src/core/util`. The ODT rewrite and both
operator tasks are Node/server-only → `src/server/xml` and `src/server/tasks`.
Auto-population reuses the existing `defaultTranslations` core-adjacent path, so
desktop needs no changes.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios gets an
> acceptance spec file created during `sp:05-tasks`, in `specs/acceptance-specs/`
> in GWT format.

| User Story                                          | Acceptance Spec File                                             | Scenarios |
| --------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| US1: References pre-fill on new project             | `specs/acceptance-specs/US01-references-prefill-new-project.txt` | 4         |
| US2: Prose containing a reference is never split    | `specs/acceptance-specs/US02-prose-never-split.txt`              | 3         |
| US3: Documents round-trip identically               | `specs/acceptance-specs/US03-round-trip-identical.txt`           | 2         |
| US4: Existing projects backfill without overwriting | `specs/acceptance-specs/US04-backfill-existing-projects.txt`     | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

Note: US2/US3 are document-processing-heavy; their acceptance coverage bottoms
out in the shape-detector unit fixture (SC-003) and the soffice round-trip
integration test (SC-004) respectively.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

## Applied Learnings

_No solutions in `.specify/solutions/` matched this feature's stack (existing
learnings are all sp-workflow/tooling). Relevant operational constraint from
project MEMORY — `soffice` and jest require the Bash sandbox disabled — is
captured in Technical Context and research.md rather than as a solution
reference._

**New learning from deepen-plan Pass 2**: when a red-team finding is based on a
small file sample (here, 2 of 67 masters), re-verify it against the **full**
committed corpus before accepting it as the design's premise — the finding held
(96/96, not just the sampled subset), but a partial sample could equally have
missed a counter-example (e.g. one quarter authored differently from another).
The verification method — unzip each `.odt`, regex the two target
`text:style-name` values (matching the URL-encoded internal style id, not the
human `style:display-name`, which lives in `styles.xml`), and classify by
presence of `<text:s/>` vs. plain single-run text — is cheap (a few seconds,
pure Python, no `soffice`/sandbox issues) and reusable for any future ODT
structural claim in this codebase.

## Adversarial Review Findings (Red Team — Pass 1) — RESOLVED in deepen-plan Pass 2

> These findings come from running the **actual parser** (`dist/server/xml/parse.js`)
> against the **actual committed corpus** (`test/docs/serverDocs/`). They are
> evidence-backed, not speculative.
>
> **Pass 2 resolution summary.** The CRITICAL finding was **re-verified against
> the full corpus** (all 67 masters spanning Luke Q1–Q4, not just the original
> 2-file sample): 96/96 reference-shaped paragraphs in both SC-003 target
> styles are already `<text:s/>`-fragmented; 0 are a single literal-space run
> or styled span. This confirms the finding holds corpus-wide. `research.md`
> (Decisions 1–6), `data-model.md`, and `contracts/README.md` are corrected:
> the span-rewrite mechanism (`normalizeReferences`/`parseVerseReferences`) is
> retained as a **defensive, forward-compatible safety net** (no-op against the
> current corpus, exercised only by synthetic unit fixtures), and the mechanism
> that actually delivers FR-005/SC-003 for the current corpus is the extended
> `canAutoTranslate` predicate acting on the numeric strings that already exist
> as separate master strings. HIGH-1's precision claim is redefined at
> prose-paragraph granularity (flagged for `/sp:02-specify` ratification, not
> silently settled). HIGH-2's predicate is corrected to a **union** (not a bare
> colon addition), with its residual "3:00 vs verse ref" ambiguity accepted and
> mitigated by a one-time scan (done, this pass) plus a standing non-blocking
> upload-time log. MEDIUM-1 (atomic rename) and MEDIUM-2 (no-op on unchanged)
> are incorporated directly into the corrected contracts. MEDIUM-3 is now
> largely moot for the current corpus (no new "Luke" string is introduced by
> re-normalization, since it already exists) but remains a caveat for the
> defensive path. LOW (backtracking) remains a valid hardening note for the
> now-fully-defensive grammar. **This resolves the block on `/sp:05-tasks`** —
> the corrected mechanism below is what tasks should implement.

### CRITICAL — Corpus reference paragraphs are already `<text:s/>`-fragmented; the span rewrite (Decision 1) matches none of them — ✅ RESOLVED (re-verified corpus-wide)

> **Resolution.** Re-verified against all 67 committed masters (not just the
> 2-file sample): 96/96 reference-shaped paragraphs already `<text:s/>`-fragmented,
> 0 single-run. Correction applied in research.md Decisions 1–2, data-model.md,
> and contracts/README.md — the span rewrite is now documented as a defensive
> no-op against the current corpus; the predicate change (Decision 3/HIGH-2) is
> the mechanism that delivers the feature.

**Evidence.** Both SC-003 target styles encode the book/numeric separator as an ODT
`<text:s/>` space element, not a literal space:

- `M.T. Text - Lesson Title Scrip Reference` (Luke-1-01v01):
  `<text:p …>Luke <text:s/>1:5–25 <text:s/>Luke <text:s/>1:57–64</text:p>`
- `M.T. Table of Contents` (Luke-1-99v01):
  `<text:p …>Luke <text:s/>1:5–25</text:p>`

Running `parse()` on Luke-1-01v01 already emits `Luke`, `1:5–25`, `Luke`, `1:57–64`
as **four separate `DocString`s** (distinct xpaths `text:p[3]/text()[1..4]`,
`motherTongue=true`) — because a `<text:s/>` element node splits the surrounding
character data into separate text nodes, and `parseNode` emits one `DocString` per
non-whitespace text node.

**Consequence.**

1. The reference paragraphs are **already split today** — the book name `Luke` and
   the numeric `1:5–25` already exist as separate master strings. The combined
   `Luke 1:5–25` single string that the spec (US1 Acceptance 1) and Decision 1
   assume exists **does not exist** for any `<text:s/>`-fragmented reference (i.e.
   all 95 in the sampled Q1/TOC masters).
2. Decision 1's own conservatism red-line — "normalize **only if** inline content is
   a single unstyled text run (no `text:s` / styled span / soft break)" — **explicitly
   skips** every `<text:s/>`-bearing paragraph. So `normalizeReferences` would rewrite
   **0 of 95** references. The plan's SC-003 recall claim ("95 matched by the span
   rewrite") is empirically false for the sampled corpus.
3. `parseVerseReferences` (Decision 2), which expects a whole-string `book chapter:verse`,
   never receives one in the real pipeline — the pipeline hands it the already-split
   fragments `Luke` and `1:5–25` individually, each of which the grammar returns `null`
   for ("a reference with no book word does not qualify"; a bare book word is not a
   reference). So the shape detector as specified classifies nothing in the live flow.

**Required correction (for `/sp:03-plan`, not tasks).** Determine empirically, per
style across Q1–Q4, whether _any_ reference paragraph is a genuine single literal-space
run (which would still need splitting) vs. already `<text:s/>`-fragmented (which needs
nothing structural). For the fragmented majority, the numeric string already exists and
the **only** change needed is the auto-translate predicate (add `:`). Re-derive SC-003
recall against the strings the pipeline actually produces, not against a hypothetical
combined string.

### HIGH-1 — Numeric master strings are shared across isolated references and prose; SC-003 precision is not structurally guaranteed — ⚠ RATIFIED PROVISIONALLY (flag for `/sp:02-specify`)

> **Resolution.** "Affected" is redefined as _prose paragraph text/rendering
> unchanged_ (holds structurally), not "master id exempt from auto-population"
> (not achievable). Applied in data-model.md's Invariants and Predicate-change
> sections and contracts/README.md. This is a spec-observable wording change
> (SC-003/US2) made under auto-mode's "reasonable call" — it should be
> confirmed in a future `/sp:02-specify` amendment rather than treated as
> silently settled.

**Evidence.** The "Bible Story" prose paragraph is _also_ `<text:s/>`-fragmented:
`<text:p text:style-name="P19">Bible Story: <text:s/>Luke <text:s/>1:5–25 <text:s/>Luke <text:s/>1:57–64</text:p>`.
Its numeric fragment `1:5–25` is byte-identical to the isolated reference's `1:5–25`.
`addOrFindMasterStrings` dedupes by text alone, and `motherTongue` is a **`LessonString`**
property — it is _not_ carried onto the master string or the per-language `tString`.
`defaultTranslations` reads `storage.tStrings({ languageId: ENGLISH_ID })` and filters by
`canAutoTranslate(text)` only — there is **no `motherTongue` gate**.

**Consequence.** The isolated reference's `1:5–25` and the prose's `1:5–25` are the
**same master id**. Auto-population operates at master-string granularity, so filling
the isolated numeric necessarily fills the prose numeric too. The plan's structural
separation strategy (keep prose intact, only fill isolated refs) is defeated at the
master-string layer by text-identity dedup — for both the predicate approach **and** the
span rewrite. SC-003's "0 of 160 prose strings affected" is therefore not structurally
enforceable; it holds only incidentally because the numeric is language-neutral (the
prose renders unchanged). This must be reconciled with SC-003/US2 wording in
`/sp:03-plan`: either redefine "affected" (prose _rendering_ unchanged, which holds), or
accept that master-level dedup makes paragraph-level precision unachievable.

### HIGH-2 — `canAutoTranslate` `:` broadening is coarse and silently hides strings from the update-issues flow — ✅ RESOLVED (union predicate + standing scan)

> **Resolution.** Corrected to a **union** of the existing picture-number class
> and a strict verse-numeric shape (`\d+:\d+(?:[–-]\d+(?::\d+)?)?`) rather than
> a bare colon addition — this does not regress picture numbers. The
> `3:00`-vs-verse-reference ambiguity is _not_ fully solvable by regex (accepted,
> documented limitation): mitigated by (a) the one-time corpus scan performed
> this pass (96/96 confirmed genuine verse numerics, 0 times/ratios) and (b) a
> new standing non-blocking upload-time log for future colon-numeric strings
> outside the two known reference styles. See research.md Decision 3 and
> contracts/README.md.

Adding `:` admits **any** `^[\d–\-:[\]()\s]*$` string to auto-population — times
(`3:00`), ratios/scores (`10:1`), aspect dimensions — not just verse numerics. Two
compounding effects: (a) such strings auto-populate verbatim into every new language
without translator review; (b) via the unified predicate in `findTSubs.usefulEngSub`
they are **filtered out of the update-issues flow**, so a translator never sees they
changed. Research Decision 3 mandates a one-time scan of _current_ masters, but nothing
guards _future_ masters — a `3:00` added next quarter silently auto-fills and vanishes
from update issues. Mitigation options for `/sp:03-plan`: tighten the predicate to a true
verse-numeric shape (`\d+:\d+` with optional ranges) rather than a permissive char class,
or document the accepted broadening and add a standing lint/scan.

### MEDIUM-1 — `normalizeReferences` in-place `content.xml` rewrite risks corrupting the master on crash — ✅ RESOLVED

> **Resolution.** `normalizeReferences` now writes to a temp odt and atomically
> renames over the original only on success, for both the upload path and the
> re-normalization task. Applied in contracts/README.md.

The contract states `normalizeReferences` "rewrites `content.xml` inside the odt **in
place**." On the upload path the odt just saved by `saveDoc` **is** the master source of
truth; a crash between unzip and rezip leaves a corrupt master with no pre-parse backup.
Mitigation: write to a temp odt and atomically rename over the original only on success.
(The re-normalization task is safer — it operates on a fresh next-version copy — but
upload is not.)

### MEDIUM-2 — Re-normalization idempotence guards against duplicate strings but not version churn / phantom update-issues — ✅ RESOLVED

> **Resolution.** `normalizeReferences` now returns `{ changed: boolean }`;
> `renormalizeEnglish` only copies the odt / bumps version / calls
> `parseDocStrings`+`saveDocStrings` when `changed` is true. Against the
> current corpus this means the task reports "0 lessons changed" — expected
> and correct, not a defect. Applied in research.md Decision 6 and
> contracts/README.md.

`renormalizeEnglish` copies the odt to the next version and runs
`parseDocStrings` + `saveDocStrings` (which bumps `version`) **per run**. FR-014's
"no destructive change / no duplicate strings" can hold while each re-run still bumps the
lesson version and produces an empty diff that surfaces as a phantom entry in the
update-issues flow — operator noise and translator confusion. The task should no-op
(no version bump, no new lesson version) when normalization changes nothing.

### MEDIUM-3 — Existing projects render a blank book name after backfill until the update-issue is resolved — ✅ MOOT for current corpus, retained as defensive-path caveat

> **Resolution.** For the current corpus, no new "Luke" book-name string is
> introduced by re-normalization — it already exists as a separate master
> string today (Decision 1 evidence), so an existing language already has
> whatever "Luke" translation state it had before this feature (translated or
> not) with no transition. The scenario below (blank book name pending an
> update-issue) applies only to the defensive single-run path, should it ever
> fire on a future paragraph — noted in research.md Decision 4's revision but
> not otherwise actioned, since it cannot be observed against real content.

For an existing language that had translated the combined reference, the book span
(`Luke`) is **not** auto-populated (FR-007) and the language has no standalone `Luke`
translation. After re-normalize + backfill, the numeric fills but the book renders blank
(or English fallback) until the translator carries over their prior work via the
update-issue. US4 guarantees the prior translation survives as the "from" side, but says
nothing about **rendered output** in the interim. `/sp:03-plan` should define the merge
fallback for an untranslated book span (English fallback vs. blank) so re-normalized
in-progress projects don't temporarily render half a reference.

### LOW — `parseVerseReferences` grammar has nested quantifiers (catastrophic-backtracking risk) — ⚠ OPEN, low priority

> **Status.** Not moot — the grammar is now confirmed to be exercised only on
> the defensive single-run path, but that path is still upload-reachable
> (English master uploads always run through `normalizeReferences`). Bounding
> input length before running the regex (e.g. skip paragraphs over a length
> threshold) remains a cheap hardening step to pick up in `/sp:05-tasks`; not
> resolved in this pass as it requires no design decision, only an
> implementation-time guard.

The grammar `book = (?:\d\s+)?\p{L}[\p{L}.]*(?:\s+\p{L}[\p{L}.]*)*` inside a repeated
`(book\s+numeric)*` whole-string anchor has nested quantifiers over whitespace. Input is
trusted curriculum, so exploitation risk is low, but a pathological long paragraph at
upload could pin CPU. Bound input length or use a linear tokeniser. (Largely moot if
Decision 2 is reworked per the CRITICAL finding.)

## Adversarial Review Findings (Red Team — Pass 2, second-order on Pass 1 mitigations)

> Pass 1 (via deepen-plan) restructured the design around the corpus-fragmentation
> evidence and introduced two new mitigation mechanisms. This pass reviews **those
> mitigations against the actual code** and finds two feasibility/contract gaps.
> Both are **Medium**; no new Critical/High findings surfaced — the plan is
> adequately hardened.

### MEDIUM-4 — The HIGH-2 "standing upload-time log" is mis-located; paragraph style is not available where the plan puts the check — ✅ RESOLVED (relocated to XML layer)

**Evidence.** Decision 3 mitigation #2 specifies a non-blocking guard "implemented
as a log line in `uploadEnglishDoc`" that fires for a newly-introduced
`VERSE_NUMERIC` master string "whose paragraph style is **not** one of the two
known reference styles." But the data that check needs does not exist at that
site: `DocString` (`src/core/models/DocString.ts`) and the master strings derived
from it carry only `{ type, xpath, motherTongue, text }` — **no paragraph
style-name**. `parse.ts` uses `text:style-name` internally to _select_ nodes
(`xPathForPWithStyle`) but never emits the style onto a `DocString`.
`uploadEnglishDoc` (`src/server/actions/uploadDocument.ts`) only sees
`docStrings` and never the paragraph nodes. So "a log line in `uploadEnglishDoc`"
cannot distinguish a reference-style `1:5–25` from a stray `3:00` — it would have
to re-parse `content.xml`, resolve each new numeric string's `xpath` up to its
ancestor `text:p`, and read `text:style-name`.

**Consequence.** As written the mitigation is under-specified and would silently
degrade to "log every new colon-numeric string" (no style discrimination) or not
be built at all — leaving HIGH-2's accepted residual (`3:00` auto-fills and
vanishes from update-issues) unguarded for future masters.

**Resolution.** The style-aware check belongs in the **XML layer**, where
paragraph style is in hand: `normalizeReferences` (and/or a small `parse`-layer
helper) already walks `content.xml` paragraphs and their `text:style-name`. Emit
the non-blocking log there — for any paragraph whose text matches `VERSE_NUMERIC`
whose style is not a known reference style — rather than in `uploadEnglishDoc`
over style-less master strings. Applied to research.md Decision 3 and
contracts/README.md. (The `3:00` residual itself is unchanged and stays accepted;
this only corrects _where_ the guard runs.)

### MEDIUM-5 — `normalizeReferences` must leave the odt byte-identical when `changed:false`, or every English upload rezips the master — ✅ RESOLVED (contract clarified)

**Evidence.** Pass 1 added `normalizeReferences` to the upload path
(`uploadEnglishDoc` after `saveDoc`), running on **every** English master upload,
and gave it a temp-file + atomic-rename write (MEDIUM-1) returning
`{ changed: boolean }` (MEDIUM-2). The contract says it "atomically renames over
the original **only on success**" — but "success" is ambiguous between "the
operation completed" and "a paragraph was actually changed." For the current
corpus every upload is a no-op (all paragraphs already `<text:s/>`-fragmented). If
a no-op still unzips → rezips → renames, then **every English upload rewrites the
master odt's bytes** via a fresh zip (different compression/entry ordering) even
though nothing changed — unnecessary churn, and a needless perturbation of the
persisted source of truth that parse and merge both read.

**Consequence.** Not a rendering break (content.xml is preserved, so SC-004
holds), but it makes the "no-op" path mutate the master on every upload — the
opposite of the MEDIUM-1/MEDIUM-2 intent — and could complicate any future
byte-level provenance/round-trip assertion.

**Resolution.** Contract clarified: when `normalizeReferences` changes no
paragraph it returns `{ changed: false }` and **leaves the input odt untouched
byte-for-byte** — no temp write, no rezip, no rename. The atomic-rename path runs
**only** when at least one paragraph was rewritten. Applied to research.md
Decision 1 and contracts/README.md.

### LOW — Spec says 95 references, design says 96 (full-corpus count) — ⚠ OPEN, defer to `/sp:02-specify`

Spec SC-003/US2 state **95** standalone references; research.md/plan.md/data-model.md
say **96** after full-corpus verification. This reads as a genuine off-by-one
surfaced by counting all 67 masters (vs. the earlier sample), i.e. a **stale spec
number**, not a paragraphs-vs-strings unit mismatch. It rides with the SC-003
"affected" redefinition already flagged for a `/sp:02-specify` amendment. Action
for `/sp:05-tasks`: the SC-003 benchmark fixture must be derived by extraction,
**not** hardcode `95` (or `96`), so the count is asserted from the corpus rather
than a literal.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-13-verse-reference-auto-population-requirements.md](../brainstorms/2026-07-13-verse-reference-auto-population-requirements.md)

### Key Decisions Carried Forward

- **Split book name from numeric reference** (two-string model): book name is
  translatable text, numerics are language-neutral; master-string dedup gives
  translate-once propagation. Constrains data-model Decision (book span dedupes to
  one master).
- **Normalize at upload** (span rewrite upstream of parse), not a one-time
  document transformation and not a parser/merge core change → research Decision 1.
- **Shape-based detection, not a book list** → research Decision 2 (FR-002/FR-008).
- **Existing masters re-normalized by a one-time admin task**; carry-over via the
  existing update-issues flow → research Decisions 4 and 6.

### Deferred Questions (resolved during planning)

- Span-normalization mechanics & where the rewrite runs → **Decision 1** (new
  `normalizeReferences.ts`, English-master path only, persist normalized odt).
- Extend shared `canAutoTranslate` vs sibling predicate → **Decision 3** (extend
  and unify; blast radius on `findTSubs.usefulEngSub` is the desired filtering).
- Exact detection grammar incl. numbered books & multi-reference paragraphs →
  **Decision 2** grammar.
- How the update-issues diff presents a one-string→multi-string split →
  **Decision 4** (verified against `findTSubs`/`lessonsController`; verify on a
  real re-normalized master in integration).
- Backfill extends `defaultTranslateAll` vs new script → **Decision 5** (extend;
  already idempotent) + predicate unification.
