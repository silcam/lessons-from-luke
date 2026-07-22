# Surface Contract: Covers in the Platform

This feature introduces **no new API endpoint**. Covers are lessons with reserved numbers, so
they flow through the existing document endpoints unchanged. This document records the reused
endpoints, the behavioral edits, and the client-visible display/naming contract.

## Reused endpoints (no signature change)

### 1. Upload English cover master

`POST /api/admin/documents` (existing — `documentsController.ts`)

- Body: `EnglishUploadMeta` (`{ languageId: ENGLISH_ID, book, series, lesson }`) + multipart file.
- **Change**: `lesson` may now be `97` (A4 cover) or `98` (A3 cover). No server-side change — the
  value is chosen by the client upload form (see §Client detection). `uploadEnglishDoc` already
  `createLesson`s or versions by `(book, series, lesson)` (`uploadDocument.ts:16`), so a reserved
  cover number is handled identically to `99` (TOC).
- **Extraction change**: `parse.ts` recognizes the cover masters' style names, so the response's
  extracted `tStrings` include the cover text (title, subtitle, copyright, address).
- Response: `{ lesson, tStrings }` (unchanged shape).

### 2. Download a (translated) cover

`GET /api/languages/:languageId/lessons/:lessonId/document?majorityLanguageId=<id>` (existing —
`documentsController.ts:15`)

- Works for a cover `lessonId` with **no change**: `makeLessonFile` renders the cover as an
  ordinary lesson in bilingual (`majorityLanguageId=<ref>`) or single-language
  (`majorityLanguageId=0`) mode (FR-008).
- **Client-side change only**: `useGetDocument` names the saved file via
  `documentName(language.name, lesson)` (`useGetDocument.tsx:21`), which now returns
  `<Language>_<Book>-Q<series>-Cover-<A4|A3>.odt` for covers (FR-010).

### 3. Translate cover strings

Existing translation endpoints (`tStringsController`, `lessonsController`) — **no change**. Cover
strings appear as ordinary strings; shared strings arrive pre-translated via dedup (FR-006),
cover-only strings are translated once and remain editable (FR-007).

## Edited endpoint behavior

### 4. Assemble quarter (FR-012 isolation)

`POST /api/languages/:languageId/quarters/:book/:series/assembly` (feature 007 — `assemblyController.ts`)

- **Change (behavioral, no signature change)**: the constituent selection is constrained from
  "all lessons with matching `(book, series)`" to `TOC ∪ expectedLessonNumbers(series)`. Reserved
  cover numbers (97/98) are excluded, so the assembled output and the completeness/blocked response
  are **identical with and without covers present**.
- No change to request/response shape, status codes, or the job model.

## Client display / naming contract (FR-010 / FR-011)

Guaranteed by the `core` helpers (`lessonName`, `documentName`, `isCoverLesson`); asserted by unit
tests and Cypress:

| Surface                                                      | Cover rendering                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Document/lesson lists (`LessonsBox`, `TranslateHome`, admin) | `Cover (A4)` / `Cover (A3)` — never `Lesson 97/98`                               |
| Translation index (`TranslateIndex`)                         | `Cover (A4)` / `Cover (A3)` via `lessonName` — **currently bypassed** (see note) |
| Language-page download rows (`LanguageView`)                 | `Cover (A4)` / `Cover (A3)` with Bilingual \| Single-Language links              |
| Download filename                                            | `<Language>_<Book>-Q<series>-Cover-<A4\|A3>.odt`                                 |
| Upload form (detection)                                      | Pre-selected Cover + format from filename, with manual override                  |

> **FR-011 correction (red-team):** not every display path currently routes through `lessonName`.
> `TranslateIndex.tsx:24` interpolates `` `${lesson.book} ${lesson.series}-${lesson.lesson}` ``
> directly, so a cover renders as **"Luke 1-97"** — a confirmed reserved-number leak (also mis-renders
> the TOC as "Luke 1-99" today). Implementation MUST replace that interpolation with
> `lessonName(lesson, t)`. See plan Risk 4.

## Client detection contract (FR-003)

`metaFromFilename` (`UploadLessonForm.tsx`) maps filenames to `EnglishUploadMeta`:

| Filename pattern        | Detected `lesson`                  |
| ----------------------- | ---------------------------------- |
| `…Cover-A4…` (any case) | `97`                               |
| `…Cover-A3…` (any case) | `98`                               |
| `…L<NN>…`               | `<NN>` (unchanged)                 |
| otherwise               | `99` (TOC — unchanged fallthrough) |

Series prefix: `/[QT](\d+)/` accepts both `Q1` and `T1` → series 1 (existing). Book: `Act…` →
`Acts` (existing). Cover detection MUST precede the TOC fallthrough. Manual override control lets
the operator set Cover/format/series when detection is absent or wrong.
