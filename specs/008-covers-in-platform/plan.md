# Implementation Plan: Covers in the Platform

**Branch**: `008-covers-in-platform` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-covers-in-platform/spec.md`

## Summary

Bring quarter covers into the platform exactly the way the Table of Contents was
brought in — as **reserved lesson numbers** within each `(book, series)`:
**97 = A4 cover, 98 = A3 cover** (99 = TOC precedent). English cover masters upload
through the existing English-document path, their text is extracted as translatable
strings, shared strings auto-populate from existing translations via the **already-present
content-based master-string dedup** (`storage.addOrFindMasterStrings`), and translated
covers download from the language page through the **unchanged** `makeLessonFile`
pipeline. No new document-kind entity, no schema migration, no `Persistence` contract
change.

**Technical approach**: covers are ordinary `Lesson` rows carrying two new reserved
lesson-number constants. The feature is a set of small, surgical edits at four seams the
reserved-number model touches:

1. **Extraction** (`src/server/xml/parse.ts`): add the cover masters' actual style names
   (`M.T._20_-_20_Cover_20_Title`/`subtitle` hyphen variants, `Copyright_20_text`,
   `Book_20_number`) to `knownStyleNames` so cover text is extracted.
2. **Display** (`src/core/models/Lesson.ts`): branch `lessonName` and `documentName` on the
   new `isCoverLesson` helper so covers render "Cover (A4)"/"Cover (A3)" and download as
   `<Language>_<Book>-Q<series>-Cover-<A4|A3>.odt` — never "Lesson 97/98" (FR-011, FR-010).
3. **Upload detection** (`src/frontend/web/lessons/UploadLessonForm.tsx`): recognize
   `Cover-A4`/`Cover-A3` in the filename (accepting both `Q` and `T` series prefixes) and
   pre-select book/series/format, with a manual override control mirroring the TOC checkbox.
4. **Assembly isolation** (`src/server/controllers/assemblyController.ts`): constrain the
   assembly constituent set to `TOC ∪ expectedLessonNumbers(series)` so reserved cover
   numbers can never leak into an assembled quarter (FR-012).

Auto-population (FR-006) requires **no code** — `saveDocStrings` already calls
`storage.addOrFindMasterStrings`, which reuses an existing English master string (and its
translations) on byte-identical text. Bilingual/monolingual output (FR-008) requires **no
code** — `makeLessonFile` handles covers as ordinary lessons.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-09-covers-in-platform-requirements.md](../brainstorms/2026-07-09-covers-in-platform-requirements.md)

### Key Decisions Carried Forward

- **Reserved lesson numbers, not a document-kind entity** (TOC=99 precedent): zero
  schema / `Persistence` change across the four storage implementations; constitution
  Principle VII (KISS). Locked in specify: **97 = A4, 98 = A3**.
- **Both formats as two documents**: A4 and A3 each get a reserved number per series; heavy
  string overlap means translating one mostly fills the other. A4-only would leave §22
  half-automated.
- **Auto-population = TString content dedup, no field-mapping layer**: the masters contain
  only ~6 short strings, so a mapping mechanism has no payoff. **Verified**: the dedup lives
  in `storage.addOrFindMasterStrings` (`PGStorage.ts:189`, `testStorage.ts:147`) and is
  already invoked on every English upload via `saveDocStrings` (`updateLesson.ts:41`).
- **Fully separate from quarter assembly**: covers never gate or join the assembled interior
  (print shop color/B&W split, SOP §22.1).

### Deferred Questions (resolved / carried forward during planning)

- **[FR-006] Does upload reuse an existing master ID for identical English text?** →
  **RESOLVED YES.** `addOrFindMasterStrings` finds by exact `text` among `ENGLISH_ID`
  strings and returns the existing `TString` (masterId + translations) when present; only
  novel text mints a new master. No dedup-on-upload adjustment, no mapping layer needed
  (research.md R1).
- **[FR-001/FR-012] Does completeness ignore 97/98? Does assembly?** → **Completeness:
  RESOLVED — already correct** (`missingQuarterParts` iterates only TOC + `expectedLessonNumbers`,
  so extras are ignored). **Assembly: NOT correct as-is — this is the one real code defect
  the feature must fix** (`assemblyController.ts:128` selects constituents by `book && series`
  only; covers would be appended after lesson 13). Mitigation: filter constituents to
  `TOC ∪ expectedLessonNumbers(series)` (research.md R3).
- **[FR-003] `T` vs `Q` series prefix** → both handled by the existing `/[QT](\d+)/` regex in
  `metaFromFilename`; cover-format detection is the new part (research.md R4).
- **[FR-005 second half] Do the bare cover styles (`Copyright_20_text`, `Book_20_number`,
  non-M.T. address paragraphs) extract as _majority-language_ strings under the existing
  bilingual pairing rules?** → **OPEN — carried into research.md R2 as the feature's only
  genuine technical unknown.** The `motherTongue` flag `parseNodes` assigns drives bilingual
  pairing (FR-008) and cannot be traced without the real cover masters (fixtures don't yet
  exist — see Assumptions). Resolve early via a small parse spike against one real cover.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), the existing `makeLessonFile` / `mergeXml` /
`parse` per-lesson document pipeline, libxmljs2 (ODT XML), LibreOffice `soffice` headless
(unchanged, via `webifyLesson`), React 16 + Redux Toolkit + styled-components (frontend),
Axios + file-saver (download). **No new dependency.**
**Storage**: No new persistent storage, **no migration**, no `Persistence` contract change.
Covers are `Lesson` rows with reserved lesson numbers; all domain access goes through the
existing interface (`storage.lessons()`, `storage.lesson(id)`, `storage.createLesson(...)`,
`storage.addOrFindMasterStrings(...)`). Cover master ODTs live in `docStorage` (`docs/`) like
any English master (FR-013).
**Testing**: Jest unit TDD (`*.test.ts`) for the pure/imperative logic (reserved-number
constants + `isCoverLesson`, `lessonName`/`documentName` cover branches, `metaFromFilename`
cover detection, the assembly constituent filter, completeness-ignores-covers assertions);
Jest integration (`*.integration.test.ts`) for the real ODT round-trip on a **real cover
master fixture** (extraction of the new styles + `motherTongue` flag verification for
FR-005/FR-008); Cypress E2E for the operator upload → translate → download flow.
**Target Platform**: Linux server (production, Passenger + nvm Node 24); macOS/Linux dev
workstations. Covers flow through the **generic lesson pipeline** — no desktop/Electron
special-casing; whatever the desktop already does with lessons applies to covers unchanged.
**Project Type**: Web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`);
this feature touches `core` (naming + constants), `server` (parse styles + assembly filter),
and `frontend/web` (upload detection + language-page display).
**Performance Goals**: None new. Cover documents are tiny (~6 strings) — cheaper than a
lesson to parse and generate.
**Constraints**:

- FR-012 is a **byte-for-byte protective guarantee**: assembly output and completeness
  reporting MUST be identical with and without covers present. The constituent-filter change
  is the mechanism; a regression test asserts it.
- FR-011 is absolute: no surface (lists, links, filenames) may render a cover as
  "Lesson 97/98". Every display path routes through `lessonName`/`documentName`, so the
  branch there is the single leverage point.
- Reuse the existing English-document upload, re-upload/versioning, partial-translation
  download, and dedup behavior unchanged — no cover special-casing beyond the four seams above.

**Scale/Scope**: Small internal publishing tool. 2 reserved-number constants + 1 predicate;
~4 small function branches; 1 upload-form detection/override addition; 1 assembly constituent
filter; parse known-style additions. 8 English Luke cover masters (4 series × 2 formats).

## Presentation Design

**Component Framework**: React 16 + styled-components, using the existing
`src/frontend/common/base-components/` kit (`Checkbox`, `SelectInput`, `Label`,
`NumberPicker`, `Table`, `Button`) per `DESIGN.md`. Register: product — clear, efficient,
utilitarian ("Field Manual").
**Interaction Patterns**: Extend the existing `UploadLessonForm` (English upload) and
`LanguageView` (download list) — no new page, no new route. Reuse the existing
`GetDocumentButton` / `useGetDocument` download path unchanged (it already keys on the
`Lesson`, so covers download through it once `documentName` branches on cover format).
**Accessibility Target**: WCAG 2.2 AA, consistent with the rest of the app. The cover-format
control must be a labelled, keyboard-operable select/checkbox (mirrors the existing TOC
checkbox), and cover rows in the download table must be identified by their human-readable
name, not a number.

### UI Decisions

| Screen / Component                               | User Story | Approach                                                                                                                                                                                                                                                                 | Design Skills                                |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Cover detection + override on `UploadLessonForm` | US1        | Extend the English `UploadLessonForm`: filename detection pre-selects Cover + format (A4/A3); add a manual override control (a "Cover" affordance with an A4/A3 format selector) alongside the existing TOC checkbox, made mutually exclusive with TOC/lesson.           | `/design-clarify` (label/override microcopy) |
| Cover rows in `LanguageView` download table      | US3        | No structural change — covers appear as ordinary rows once they carry progress; the row label comes from `lessonName` (→ "Cover (A4)") and the download link filename from `documentName`. Verify Bilingual \| Single-Language buttons render for covers as for lessons. | `/design-clarify` (row-label consistency)    |
| Cover strings in the translation UI (US2)        | US2        | **No new UI** — cover strings appear in the existing translation views as ordinary strings; shared strings show pre-filled translations, cover-only strings show empty/editable. Verification only.                                                                      | — (reuses existing translate components)     |

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**:

- `/impeccable` — bring the new cover-format override control into line with `DESIGN.md`
  (flat, no-shadow, Helvetica scale, `Colors.ts` palette) and the adjacent TOC checkbox.
- `/design-clarify` — finalize the Cover/format override labels and ensure cover rows read
  unambiguously as covers (never a bare number) in the download list.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                   | Gate                                                                                                                                                                                                                                                                                                                                                                                | Status                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| I. Test-First (TDD, RGR, ~95–100% coverage) | Pure/imperative logic (constants + `isCoverLesson`, `lessonName`/`documentName` branches, `metaFromFilename` detection, assembly constituent filter, completeness-ignores-covers) gets unit TDD. ODT extraction of the new styles + the `motherTongue`-flag question (FR-005/FR-008) gets `*.integration.test.ts` against a real cover fixture. The operator flow gets Cypress E2E. | PASS — layer mapping matches constitution §I "Document Processing and Multi-Layer Verification". |
| II. Type Safety & Static Analysis           | Explicit return types, no `any`, strict boolean expressions (note: existing `lessonName`/`documentName`/`metaFromFilename` use `==`/truthy patterns — new branches use explicit comparisons), `type` imports, ESLint max-warnings 0. New reserved-number constants are `const`; `isCoverLesson` returns `boolean`.                                                                  | PASS (enforced by pre-commit).                                                                   |
| III. Code Quality                           | JSDoc on new public helpers (`isCoverLesson`, cover constants, cover-format type); naming per glossary (Cover, Cover Format, Cover String, Reserved Lesson Number); import order.                                                                                                                                                                                                   | PASS.                                                                                            |
| IV. Pre-commit Gates                        | `yarn typecheck` + lint-staged (eslint → prettier → jest related). No `--no-verify`.                                                                                                                                                                                                                                                                                                | PASS.                                                                                            |
| V. Warnings/Deprecations                    | Zero-tolerance; addressed as they arise.                                                                                                                                                                                                                                                                                                                                            | PASS.                                                                                            |
| VI. Layered Architecture & Dual Targets     | Covers are domain data → all access through `Persistence`, no contract change (FR-013). `core` naming helpers stay isomorphic (no Node/DOM/Electron APIs). `parse.ts` (server-only ODT) and the assembly filter (server-only) never enter `core` or the desktop offline path. No desktop change — covers use the generic lesson path.                                               | PASS.                                                                                            |
| VII. Simplicity                             | No new entity, no migration, no new endpoint, no new dependency, no mapping layer. Reuse dedup, `makeLessonFile`, `GetDocumentButton`, the TOC-checkbox override pattern. Four surgical edits + parse style additions. YAGNI: no PDF export, no A3 imposition, no cover-into-assembly bundling.                                                                                     | PASS.                                                                                            |

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/008-covers-in-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1 dedup, R2 style/motherTongue OPEN, R3 assembly, R4 filename)
├── data-model.md        # Phase 1 output (reserved-number model, no schema change)
├── quickstart.md        # Phase 1 output (upload → translate → download walkthrough)
├── contracts/
│   └── covers-surface.md # Reused/edited endpoints + display/naming contract (no NEW endpoint)
└── spec.md
```

### Source Code (repository root)

```text
src/
├── core/
│   └── models/
│       ├── Lesson.ts              # EDIT: add COVER_A4_LESSON=97, COVER_A3_LESSON=98,
│       │                          #   isCoverLesson(), coverFormat(); branch lessonName()
│       │                          #   ("Cover (A4)"/"Cover (A3)") and documentName()
│       │                          #   (<Language>_<Book>-Q<series>-Cover-<A4|A3>.odt)
│       ├── Lesson.test.ts         # EDIT: cover-naming + isCoverLesson unit tests
│       └── Quarter.test.ts        # EDIT: assert completeness ignores 97/98 (guard, no code change)
├── server/
│   ├── xml/
│   │   ├── parse.ts               # EDIT: add cover master style names to knownStyleNames
│   │   └── parse.test.ts          # EDIT: unit tests for new style extraction
│   └── controllers/
│       ├── assemblyController.ts  # EDIT: filter constituents to TOC ∪ expectedLessonNumbers(series)
│       └── assemblyController.test.ts  # EDIT: assert covers never enter the constituent set
└── frontend/
    └── web/
        └── lessons/
            ├── UploadLessonForm.tsx   # EDIT: cover-format detection in metaFromFilename +
            │                          #   Cover/format override control
            └── UploadLessonForm.test.tsx  # EDIT (or NEW): detection + override unit tests

src/server/actions/
└── assembleQuarter.ts             # OPTIONAL EDIT: defense-in-depth guard in orderQuarterLessons
                                   #   to drop non-TOC lessons outside expectedLessonNumbers
                                   #   (the controller filter is the real fix)

test/docs/serverDocs/
└── Luke-<series>-97v01.odt        # NEW fixtures: real English cover masters (A4=97, A3=98),
    Luke-<series>-98v01.odt        #   analogous to the existing Luke-<series>-99v01.odt TOC fixture

src/server/xml/
└── <cover>.integration.test.ts    # NEW: real-cover ODT extraction + motherTongue-flag verification (R2)

cypress/integration/
└── covers.cy.ts                   # NEW: E2E upload → translate → download operator flow
```

**Structure Decision**: Web application, isomorphic four-layer. This feature makes small,
targeted edits at the four seams the reserved-lesson-number model touches — naming (`core`),
extraction + assembly isolation (`server`), and upload detection (`frontend/web`) — plus real
cover-master test fixtures. It adds **no** new endpoint, entity, migration, or dependency, and
reuses the dedup, `makeLessonFile`, and download pipelines unchanged. No `core` contract change;
no desktop change.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios below will get a corresponding
> acceptance spec file created during `sp:05-tasks` under `specs/acceptance-specs/`, in the GWT
> format the acceptance pipeline consumes. The next free block after US12 (feature 007) is US13.

| User Story                                                 | Acceptance Spec File                                           | Scenarios |
| ---------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| US13: Upload English cover masters                         | `specs/acceptance-specs/US13-upload-cover-masters.txt`         | 4         |
| US14: Cover text auto-populates from existing translations | `specs/acceptance-specs/US14-cover-autopopulate.txt`           | 3         |
| US15: Download translated covers from the language page    | `specs/acceptance-specs/US15-download-translated-covers.txt`   | 3         |
| US16: Covers never affect quarter assembly                 | `specs/acceptance-specs/US16-covers-never-affect-assembly.txt` | 2         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**FR-012 regression fence (US16)**: The assembly isolation guarantee is asserted at the
integration/unit layer by assembling the same complete quarter **with and without** cover
lessons (97/98) present and asserting the constituent set — and therefore the assembled output
— is identical. Because feature 007 already commits golden-reference masters
(`English_Luke-Q<n>-Master-bilingual.odt`) and a source-immutability hash guard, US16 extends
that harness: add cover lessons to storage, re-run, assert byte-identical output and identical
`missingQuarterParts`/`isCompleteQuarter` results.

**FR-005/FR-008 real-fixture check (US13/US15)**: extraction of the cover masters' actual
style names and — critically — the `motherTongue` flag assigned to bare cover styles
(`Copyright_20_text`, `Book_20_number`, address paragraphs) is verified by a
`*.integration.test.ts` that parses a **real** committed cover master fixture and asserts each
extracted string's `motherTongue`/majority-language classification, then round-trips it through
`makeLessonFile` in both bilingual and single-language modes. This is the executable resolution
of research.md R2.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

## Risks (carried into red-team / implement)

1. **[TOP — OPEN UNKNOWN] Bare cover styles' `motherTongue` classification (FR-005/FR-008).**
   `Copyright_20_text`, `Book_20_number`, and the publisher-address paragraphs are **not**
   `M.T.`/`L.M.`-prefixed, so how `parseNodes` sets their `motherTongue` flag — which drives
   bilingual pairing and therefore whether downloaded covers pair correctly — is unverified and
   cannot be settled without a real cover master. Mitigation: resolve early with a parse spike
   against one real cover fixture before building the download path (research.md R2). If the
   flag is wrong, a small pairing-rule or style-classification adjustment is needed — but still
   no new entity or mapping layer.
2. **[HIGH — the one real code defect] Covers leak into assembly (FR-012).**
   `assemblyController.ts:128` selects constituents by `(book, series)` only; once covers exist,
   97/98 append after lesson 13 in `orderQuarterLessons`. This fires in US16 scenario 2 (complete
   quarter + covers present). Mitigation: filter the constituent set to
   `TOC ∪ expectedLessonNumbers(series)` in the controller (real fix), optionally guard
   `orderQuarterLessons` (defense-in-depth). Completeness is already correct — do **not** touch it.
3. **[MEDIUM] FR-011 leak surfaces.** A cover rendered as "Lesson 97" anywhere is a defect. All
   known display paths route through `lessonName`/`documentName`, but `sp:05-tasks`/red-team
   should sweep for any raw `lesson.lesson` interpolation (e.g. `LessonsBox`, `TranslateHome`,
   admin lesson lists) that bypasses the helper.
4. **[MEDIUM] SC-003 depends on byte-identical English text.** Auto-population only fires when the
   cover's title/subtitle is byte-for-byte identical to the existing front-matter/TOC master
   string (dedup is exact-text). If the cover master's title differs by whitespace/punctuation, it
   mints a new master and SC-003 fails. Verify against the real cover fixture; if mismatched, it is
   a source-document normalization issue, not a code change.
5. **[LOW] Upload misdetection today.** `metaFromFilename` has no cover branch, so a cover filename
   currently falls through to `lesson = TOC_LESSON` — a cover would be misdetected as a TOC. The
   new cover-detection branch must run **before** the TOC fallthrough and be covered by a unit test
   for each of the 8 real master filenames (both `Q` and `T` prefixes) per SC-002.

## Applied Learnings

_No entries — the `.specify/solutions/tooling/*` learnings are spec-kit-workflow-internal
(acceptance-spec routing, harness/model schema, ralph epic detection); none relevant to ODT
cover extraction, reserved lesson numbers, or the assembly constituent filter. Omitted
deliberately (mirrors feature 007's finding)._
