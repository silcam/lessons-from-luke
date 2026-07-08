# Phase 1 Data Model: Assembled Quarter Download

This feature introduces **no persistent/domain data model changes**. It reads existing domain entities through `Persistence` and adds transient, in-memory runtime types for the background job. Terminology follows `specs/glossary.md`.

---

## Existing domain entities (read-only, reused unchanged)

### Lesson / BaseLesson (`src/core/models/Lesson.ts`)

- `book: Book` ("Luke" | "Acts"), `series: number` (= **Quarter**), `lesson: number` (absolute lesson number; `99` = TOC via `TOC_LESSON` / `isTOCLesson()`), `version`, `lessonId`, plus `lessonStrings` on the loaded `Lesson`.
- Read via `storage.lessons()` (all `BaseLesson[]`) and `storage.lesson(id)` (full `Lesson`). **No new `Persistence` method.**

### Language (`src/core/models/Language.ts`)

- Supplies `languageId`, `motherTongue`, `defaultSrcLang` — used to derive `majorityLanguageId` exactly as `documentsController` does today (bilingual = `defaultSrcLang`/self; single-language = `0`).

### TString / LessonString

- Consumed indirectly through `makeLessonFile`, unchanged. Partial-translation fallback is inherited (FR-005) — no new completeness policy.

---

## New runtime (transient, in-memory) types — server-only

> These are process-scoped, never persisted (FR-011), never imported into `core`/desktop.

### AssemblyMode

Discriminated value mirroring the two per-lesson download modes.

| Value               | Meaning                                               | Maps to                                         |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `"bilingual"`       | Mother tongue alongside a majority/reference language | `majorityLanguageId = defaultSrcLang` (or self) |
| `"single-language"` | Mother tongue only                                    | `majorityLanguageId = 0`                        |

Glossary: **Assembly mode**.

### AssemblyJobKey

The dedup identity (FR-010). Equality on all four fields.

```
{ languageId: number; book: Book; series: number; mode: AssemblyMode }
```

### AssemblyJobStatus

Discriminated union (no percentage — indeterminate, per clarification):

| Tag       | Additional fields    | Meaning                                                      |
| --------- | -------------------- | ------------------------------------------------------------ |
| `queued`  | —                    | Accepted, waiting for the serialized soffice slot            |
| `running` | —                    | Constituents generating / soffice merge in progress          |
| `ready`   | `resultPath: string` | Finished `.odt` available for download                       |
| `failed`  | `reason: string`     | Human-readable failure (names failing lesson where possible) |

### AssemblyJob

The transient unit of work (glossary: **Assembly job**).

```
{
  jobId: string;              // opaque id (e.g. randomUUID) for download/status-by-id
  key: AssemblyJobKey;
  status: AssemblyJobStatus;
  createdAt: number;          // epoch ms — for retention alignment with docStorage 24h cleanup
}
```

**State transitions**:

```
        start (new key)
   ─────────────────────────►  queued
                                  │  soffice slot free
                                  ▼
                               running ──── success ───►  ready ──(24h cleanup / process restart)──► gone
                                  │
                                  └──── error / timeout / missing-or-failing constituent ───►  failed
```

- **Attach (FR-010)**: `start` on a key with an existing `queued`/`running` job returns that job — no new job, no redundant work.
- **Block before running (FR-006/US4)**: completeness validation runs at the _start_ of `running`; a missing/failing constituent transitions directly to `failed` with a naming reason and **no** `resultPath`.
- **Interruption (FR-011)**: process restart drops all jobs; not persisted. Operator re-requests.

### AssemblyJobRegistry (in-memory, server-only)

Responsibilities (no domain data; not in `Persistence`):

- `startOrAttach(key, mode) → AssemblyJob` — dedup by `AssemblyJobKey`.
- `get(jobId) → AssemblyJob | undefined`; `getByKey(key) → AssemblyJob | undefined`.
- Serializes the soffice merge step (**concurrency 1**); additional distinct-key jobs sit in `queued`.
- Enforces per-job hard timeout + soffice kill → `failed`.
- Owns per-job `mktemp` profile lifecycle (create → cleanup on completion/crash).

---

## Derived / computed sets (pure, isomorphic — unit-tested)

### expectedLessonNumbers(series) → number[]

The 13 absolute lesson numbers for a quarter: `(series-1)*13+1 .. series*13`. (Series 2 → 14..26, etc.) The TOC (`99`) is handled separately and placed first.

### Quarter completeness (FR-006 / US4)

A `(book, series)` is **complete** iff, among `storage.lessons()` filtered to that `(book, series)`:

- the `-99` TOC lesson exists, **and**
- every number in `expectedLessonNumbers(series)` has a matching lesson, **and**
- each of the 14 generates via `makeLessonFile` without error.

Otherwise assembly is **blocked/failed** naming the missing/failing lesson(s). **Series 1 is a real incomplete fixture** (missing lesson 6).

### Assembly order

TOC first, then lessons ascending by absolute number — consistent with `lessonCompare` and the spike's proven ordering (front matter → L(n) → … ).

---

## Validation rules summary

| Rule                                                | Source               | Enforced in                                             |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| All 14 constituents exist                           | FR-006, US4-1        | completeness check (pre-merge)                          |
| Each constituent generates without error            | FR-006, US4-2        | completeness/generation check                           |
| No stricter translation bar than per-lesson         | FR-005               | reuse `makeLessonFile` unchanged                        |
| Output fully editable (0 protected / 0 linked)      | FR-002               | soffice merge (spike-confirmed) + integration assertion |
| Continuous numbering + first-page suppression       | FR-003               | soffice merge + `PAGE_BEFORE` break (spike-confirmed)   |
| Footer Quarter/Lesson numbers present               | FR-004               | `flattenFooterFields` pre-process                       |
| One live job per `(languageId, book, series, mode)` | FR-010               | registry dedup                                          |
| No partial book ever delivered                      | FR-006/FR-009/FR-011 | `failed` carries no `resultPath`                        |
