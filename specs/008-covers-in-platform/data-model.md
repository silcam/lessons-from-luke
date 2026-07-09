# Phase 1 Data Model: Covers in the Platform

**No schema change. No migration. No `Persistence` contract change.** Covers reuse the existing
`Lesson` / `LessonString` / `TString` model entirely; the only additions are two reserved
lesson-number constants and derived display/type helpers in the isomorphic `core`.

## Entities (all existing — reused unchanged)

### Lesson (`src/core/models/Lesson.ts`) — reused

A cover **is** a `Lesson`. No new fields.

| Field           | Type             | Cover semantics                                                        |
| --------------- | ---------------- | ---------------------------------------------------------------------- |
| `lessonId`      | number           | Surrogate id (unchanged).                                              |
| `book`          | `Book`           | `"Luke"` \| `"Acts"` (unchanged).                                      |
| `series`        | number           | Quarter/series (unchanged).                                            |
| `lesson`        | number           | **Reserved**: `97` = A4 cover, `98` = A3 cover (`99` = TOC precedent). |
| `version`       | number           | Re-upload versioning (unchanged — covers version like any lesson).     |
| `lessonStrings` | `LessonString[]` | Extracted cover text, linked to master strings (unchanged).            |

### LessonString / TString / DocString — reused unchanged

Cover text is extracted into `DocString`s by `parse.ts`, deduplicated to `TString` master ids by
`storage.addOrFindMasterStrings`, and linked as `LessonString`s — identical to lessons and the
TOC. A cover string's `motherTongue` flag (on `DocString`/`LessonString`) drives bilingual pairing
in `makeLessonFile`, exactly as for lessons. **Open verification**: the flag assigned to bare cover
styles (`Copyright_20_text`, `Book_20_number`, address paragraphs) — see research.md R2.

## New constants & helpers (`src/core/models/Lesson.ts`) — additions only

```text
COVER_A4_LESSON = 97            // reserved lesson number for the A4 (cut-sheet) cover
COVER_A3_LESSON = 98            // reserved lesson number for the A3 (full-spread booklet) cover

type CoverFormat = "A4" | "A3"

isCoverLesson(lesson): boolean          // lesson === 97 || lesson === 98
coverFormat(lesson): CoverFormat | null // 97 → "A4", 98 → "A3", else null
```

- Mirror the existing `TOC_LESSON = 99` / `isTOCLesson` precedent (`Lesson.ts:8,47`).
- Pure, isomorphic, explicit return types, JSDoc'd. Unit-tested.

## Reserved Lesson Number space (per `(book, series)`)

| Number | Meaning           | Introduced by    |
| ------ | ----------------- | ---------------- |
| 1..13  | Real lessons      | existing         |
| 97     | A4 cover          | **this feature** |
| 98     | A3 cover          | **this feature** |
| 99     | Table of Contents | feature (prior)  |

`expectedLessonNumbers(series)` returns only the 13 real lesson numbers; the TOC and covers are
handled by explicit predicates (`isTOCLesson`, `isCoverLesson`), never by range membership. This
is why completeness and assembly must key on `TOC ∪ expectedLessonNumbers` and treat 97/98 as
extras (see research.md R3).

## Display & naming rules (FR-010 / FR-011)

`lessonName(lesson, t)` (`Lesson.ts:23`) — add a cover branch **before** the TOC/lesson branches:

| Condition            | Output                                 |
| -------------------- | -------------------------------------- |
| `isCoverLesson` & A4 | `Cover (A4)` (or `t("Cover (A4)")`)    |
| `isCoverLesson` & A3 | `Cover (A3)`                           |
| `isTOCLesson`        | `<Book> <series>-TOC` (unchanged)      |
| otherwise            | `<Book> <series>-<lesson>` (unchanged) |

`documentName(languageName, lesson)` (`Lesson.ts:30`) — add a cover branch:

| Condition       | Output filename                                           |
| --------------- | --------------------------------------------------------- |
| `isCoverLesson` | `<Language>_<Book>-Q<series>-Cover-<A4\|A3>.odt` (FR-010) |
| `isTOCLesson`   | `<Language>_<Book>-Q<series>-TOC.odt` (unchanged)         |
| otherwise       | `<Language>_<Book>-Q<series>-L<NN>.odt` (unchanged)       |

**Invariant (FR-011)**: no code path may render a cover as `Lesson 97`/`Lesson 98`. Every display
and download-name path routes through `lessonName`/`documentName`; the branches above are the
single leverage point. `sp:05-tasks`/red-team sweep for any raw `lesson.lesson` interpolation that
bypasses these helpers.

## Assembly constituent rule (FR-012)

The assembly constituent set for a `(book, series)` is exactly `{ TOC } ∪ { lessons whose number ∈
expectedLessonNumbers(series) }`. Reserved cover numbers (97/98) are **excluded** at selection
(`assemblyController.ts`), so:

- **Completeness** (`missingQuarterParts`/`isCompleteQuarter`): already ignores 97/98 — no change.
- **Assembled output**: byte-for-byte identical with and without covers present — enforced by the
  US16 regression test that re-runs feature 007's golden-reference assembly with cover lessons added.

## Storage (FR-013) — unchanged contract

All cover data access uses the existing `Persistence` methods:

- `storage.createLesson({ book, series, lesson: 97|98 })` — on first cover upload (via
  `uploadEnglishDoc`, unchanged).
- `storage.lessons()` / `storage.lesson(id)` — listing and download.
- `storage.addOrFindMasterStrings(texts)` — dedup + auto-population.
- `storage.updateLesson(...)`, `storage.tStrings(...)` — translation, unchanged.

Because covers are lessons with reserved numbers, all four implementations (`PGStorage`,
`PGTestStorage`/`TransactionalTestStorage`, `PGDevStorage`, `LocalStorage`) work without
modification (FR-013). No desktop-specific handling.
