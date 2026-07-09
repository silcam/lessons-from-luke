# Phase 0 Research: Covers in the Platform

Resolves the "Deferred to Planning" items from the spec and brainstorm. Each finding is
grounded in the actual codebase (paths/lines cited) rather than assumption.

## R1 — Content-based master-string dedup on upload (FR-006) — RESOLVED (YES)

**Decision**: Rely on the existing `storage.addOrFindMasterStrings` mechanism unchanged. No
dedup-on-upload adjustment, no mapping layer.

**Rationale / Evidence**:

- Every English document upload flows `uploadEnglishDoc` → `saveDocStrings`
  (`src/server/actions/uploadDocument.ts:28`, `src/server/actions/updateLesson.ts:35`).
- `saveDocStrings` calls `storage.addOrFindMasterStrings(docStrings.map((s) => s.text))`
  (`updateLesson.ts:41`) and links each resulting `masterId` to the lesson.
- `addOrFindMasterStrings` (`src/server/storage/PGStorage.ts:189–`) loads all `ENGLISH_ID`
  strings, and for each incoming text does `findBy(engStrings, "text", text)` — **exact-text
  match**. On hit it returns the **existing** `TString` (its `masterId` and, transitively, all
  languages' translations keyed on that masterId); only novel text mints a new master. The
  in-memory `testStorage.ts:147` implementation has identical semantics.

**Consequence for covers**: a cover master whose title/subtitle text is byte-identical to text
already translated (via the TOC or front matter) automatically reuses that master string and its
translations the moment the cover is uploaded — zero translator action (SC-003). Cover-only
strings (copyright, address) are novel text → new masters → translated once per language and
editable thereafter (FR-007).

**Residual dependency (see R5)**: this is an **exact-text** match. Auto-population only fires on
byte-identical English text.

## R2 — Cover master styles and the `motherTongue` classification (FR-005) — PARTIALLY OPEN

**Decision (settled half)**: Extend `parse.ts` `knownStyleNames` with the cover masters' actual
style names. The masters use hyphen variants that differ from the names `parse.ts` recognizes
today:

- Present today (`src/server/xml/parse.ts:41–42`): `M.T._20_Cover_20_title`,
  `M.T._20_Cover_20_subtitle` (no hyphen).
- Needed (verified against real masters in the brainstorm): `M.T._20_-_20_Cover_20_Title`,
  `M.T._20_-_20_Cover_20_subtitle` (hyphen variants), plus the bare styles `Copyright_20_text`
  and `Book_20_number`, and `Table_20_Contents`.

Adding these names to `knownStyleNames` is a mechanical, unit-testable change (the extraction
xpath is built from that list — `parse.ts:47–66`).

**Mechanism (corrected in red-team — knowable from the code today)**: `parseNodes` does **not**
assign `motherTongue`. `parse.ts:70–73` sets `motherTongue: true` for **every** string matched by
the `knownStyleNames` xpath; `allStrings` (the whole document) is mapped at `motherTongue: false`
(`parse.ts:75–78`) and merged so any node not in the translatable set keeps `false`. The text is
extracted **either way** — membership in `knownStyleNames` does not decide whether a string
appears, only whether its flag is `true`. Therefore adding `Copyright_20_text` / `Book_20_number`
to `knownStyleNames` will deterministically classify them `motherTongue: true`. This is settled by
code reading, not by the fixture.

**What genuinely still needs the real fixture** (the residual OPEN part): (a) the **exact
style-name spelling/hyphenation** in the real masters, and (b) whether `motherTongue: true` is the
**semantically correct** pairing for the copyright/address fields, i.e. should they be paired
mother-tongue/majority in bilingual output, or appear once as majority-language-only? The flag has
three concrete downstream consumers that any answer must satisfy:

- **Bilingual pairing** in `makeLessonFile` (FR-008).
- **`calcLessonProgress`** (`src/core/models/Language.ts:70`) — for a mother-tongue language, only
  `motherTongue` strings count toward completeness, so the flag defines cover-completeness
  semantics.
- **`singleLanguageize`** (`src/core/models/DocString.ts:35`) — a `motherTongue` string with no
  majority-language sibling pushes its masterId onto a suppress-queue that is never popped, a
  concrete monolingual-output mis-blank hazard.

**Why (b) cannot be resolved now**: it depends on the exact XML structure of the real cover
masters (paragraph nesting, style parentage, whether address lines sit inside an `M.T.` pair or
stand alone). The fixtures do not yet exist (spec Assumptions — they must be created from the
maintainer's Drive copy), and **have no acquisition task/owner/fallback yet** (see plan Risk 6:
`sp:05-tasks` must make fixture creation an explicit blocking task, or the gate below can be
silently skipped).

**Plan**: create one real cover-master fixture early (blocking), write a `*.integration.test.ts`
that parses it and asserts (1) the `motherTongue` value of every extracted string, (2)
`calcLessonProgress` completeness semantics, and (3) `singleLanguageize` monolingual output
(including the no-sibling suppress-queue case) — not merely "round-trips in both modes." This test
is the executable resolution. If the classification is wrong, the fix is targeted: **omit** the
copyright/address styles from the M.T. set so they classify `motherTongue: false` (they still
extract via `allStrings`), or correct the style-name spelling — still no new entity, mapping, or
schema. See the plan's "Spike outcome → action matrix."

**Alternatives considered**: a metadata-driven field-mapping layer (rejected by the brainstorm —
~6 short strings, no payoff); assuming the flag is correct and skipping verification (rejected —
FR-008 correctness is unverifiable without touching the real document, per constitution §I
document-processing multi-layer verification).

## R3 — Assembly and completeness isolation (FR-001 / FR-012) — RESOLVED (split finding)

**Completeness — already correct, no change**: `missingQuarterParts`
(`src/core/models/Quarter.ts:26`) iterates only the TOC lesson and `expectedLessonNumbers(series)`
(1..13 per quarter). Any lesson number outside that set — including 97/98 — is simply never
examined, so `isCompleteQuarter` ignores covers. FR-012's completeness half needs **no code**; a
guard test asserts it (`Quarter.test.ts`).

**Assembly constituent selection — the one real defect to fix**: the assembly controller selects
constituents by `(book, series)` **only**:

```
// src/server/controllers/assemblyController.ts:128
baseLessons = (await storage.lessons()).filter(
  (lsn) => lsn.book === key.book && lsn.series === key.series
);
```

Once covers exist for that `(book, series)`, 97/98 are included in `baseLessons`, passed to
`assembleQuarter`, and `orderQuarterLessons` (`assembleQuarter.ts:168`) sorts non-TOC lessons
ascending and appends them — so 97/98 land after lesson 13 and **merge into the assembled
output**, violating FR-012. This fires in US16 scenario 2 (complete quarter + covers present).

**Decision**: constrain the constituent set at the controller selection to
`TOC ∪ expectedLessonNumbers(series)`:

```
const expected = new Set(expectedLessonNumbers(key.series));
baseLessons = (await storage.lessons()).filter(
  (lsn) => lsn.book === key.book && lsn.series === key.series &&
           (isTOCLesson(lsn) || expected.has(lsn.lesson))
);
```

Optionally add a defense-in-depth guard in `orderQuarterLessons` that drops any non-TOC lesson
outside the expected set, so a future caller cannot reintroduce the leak. The controller filter is
the primary fix.

**Rationale**: keeps the fix at the single point where constituents are chosen, mirrors the
completeness logic's own `expectedLessonNumbers` boundary, and requires no change to
`assembleQuarter`'s contract. Verified by re-running feature 007's golden-reference assembly with
cover lessons added and asserting byte-identical output.

## R4 — Upload filename recognition: cover format + `T`/`Q` prefix (FR-003) — RESOLVED

**Decision**: extend `metaFromFilename` (`src/frontend/web/lessons/UploadLessonForm.tsx:142`) to
detect cover format and map to the reserved number, running the detection **before** the existing
TOC fallthrough.

**Evidence**:

- Series prefix `T` vs `Q` is **already handled**: `metaFromFilename` uses `/[QT](\d+)/`
  (`UploadLessonForm.tsx:146`), so `English-Luke-T1-Cover-A4.odt` and `-Q1-` both yield series 1.
- Cover format is **not** handled: there is no `Cover-A4`/`Cover-A3` branch, and no `L\d+` match
  on a cover filename, so a cover currently falls through to `meta.lesson = TOC_LESSON`
  (`UploadLessonForm.tsx:155`) — misdetected as a TOC (Risk 5).

**New detection**: match `/Cover-A4/i` → `COVER_A4_LESSON` (97); `/Cover-A3/i` → `COVER_A3_LESSON`
(98); this branch takes precedence over the TOC fallthrough. Add a manual override control mirroring
the existing TOC checkbox: a "Cover" affordance with an A4/A3 format selector, mutually exclusive
with the TOC checkbox and the lesson-number picker.

**Verification**: unit-test `metaFromFilename` against all 8 real Luke master filenames (both `Q`
and `T` prefixes, both formats) — SC-002 (100% auto-detect).

**Alternatives considered**: parsing format from ODT metadata instead of the filename (rejected —
the brainstorm confirms quarter/format identity lives in the filename/artwork, not as document
text; filename detection matches the established TOC pattern).

## R5 — Auto-population depends on byte-identical English text (SC-003) — RESOLVED (constraint noted)

**Decision**: accept exact-text dedup as the mechanism; treat any SC-003 miss as a source-document
normalization issue, not a code change.

**Rationale**: R1 established the match is exact `text` equality. If a cover master's title differs
from the existing translated title by whitespace or punctuation, it mints a new master and SC-003
does not fire for that string. This is a property of the source documents, verifiable against the
real fixtures; the brainstorm's content-dedup decision explicitly accepts this trade-off given the
small, distinctive cover string set. No code mitigation is warranted (adding fuzzy matching would
violate YAGNI and risk incorrect cross-document string sharing).

## Summary of resolutions

| Item                                        | Status   | Resolution                                                                     |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| FR-006 dedup reuses master ID               | RESOLVED | Existing `addOrFindMasterStrings`, exact-text match — no change (R1)           |
| FR-005 cover style extraction               | RESOLVED | Add hyphen/bare style names to `knownStyleNames` (R2)                          |
| FR-005/FR-008 `motherTongue` on bare styles | **OPEN** | Verify via real-fixture `*.integration.test.ts`; small parse fix if wrong (R2) |
| FR-001/FR-012 completeness ignores 97/98    | RESOLVED | Already correct — guard test only (R3)                                         |
| FR-012 assembly excludes covers             | RESOLVED | Filter constituents to TOC ∪ expectedLessonNumbers (real code fix) (R3)        |
| FR-003 `T`/`Q` + cover-format detection     | RESOLVED | `[QT]` already works; add cover-format branch before TOC fallthrough (R4)      |
| SC-003 byte-identical dependency            | RESOLVED | Accept exact-match; source-normalization issue if it misses (R5)               |
