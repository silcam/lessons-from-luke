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
- **Terminal-attach / retry (FR-009 — Pass 5)**: attach/dedup applies to `queued`/`running` **and** a still-valid `ready` (its `resultPath` still present → returned so the client re-downloads; no freshness bar). A `failed` entry, and a `ready` entry whose `resultPath` is already **gone**, are treated as **absent**: `startOrAttach` evicts the terminal entry and starts a **fresh** job (new `jobId`, `queued`). Without this, a `POST` over a `failed` job would return the stale failure with no way to retry — a direct FR-009 violation.
- **Dedup atomicity (FR-010 — red-team)**: `startOrAttach(key)` MUST perform its check-then-insert **synchronously, before any `await`**: on a cache miss it inserts a `queued` placeholder for the key and only _then_ yields to async work (completeness check, generation, merge). If an `await` (e.g. `storage.lessons()`) runs between the "no live job" check and the insert, two concurrent starts (double-click / two operators) both observe "no job" and both start a full assembly — redundant `soffice` work + duplicate profiles. Node's single-threaded loop makes a purely synchronous check-then-insert atomic.
- **Block before running (FR-006/US4)**: completeness validation runs at the _start_ of `running`; a missing/failing constituent transitions directly to `failed` with a naming reason and **no** `resultPath`.
- **Interruption (FR-011)**: process restart drops all jobs; not persisted. Operator re-requests.
- **Terminal-entry eviction (red-team)**: `ready`/`failed` entries are NOT resident forever. The registry evicts a terminal entry on a TTL aligned with the `docStorage` 24 h cleanup window, and drops a `ready` entry as soon as its `resultPath` is found missing (the file having been pruned by `cleanTmpDir`). Without this, a long-lived process accumulates one resident entry per distinct key ever requested — an unbounded memory leak with no adversary involved.
- **Queue-depth cap (red-team)**: the registry enforces a maximum number of live (`queued` + `running`) jobs. `startOrAttach` rejects (surfaced as `429`, contract §1) when the cap is exceeded, rather than growing the `queued` backlog and tmp-dir footprint without bound.

### AssemblyJobRegistry (in-memory, server-only)

> **Process-scoping assumption (Pass 3 finding — HIGH).** This registry, the concurrency-1 soffice gate, and the queue-depth cap are **per-process** state and are correct **only under a single app worker**. Production runs under Passenger, whose default pool scales to multiple worker processes (no `passenger_max_pool_size` pin exists today). Under >1 worker each has its own registry, which breaks FR-010 dedup (two workers → two full assemblies for one key), the concurrency-1 _resource_ serializer (N simultaneous merges — the isolated per-job profile prevents corruption but not simultaneity), the cap (per-worker → N× the intended ceiling), and poll-by-key (may hit a worker that never held the job → spurious `404`). This is the **first** server state whose correctness depends on process affinity — every other shared server state lives in Postgres (`getAuthPool()` / better-auth sessions) precisely to survive multiple workers. **Resolution (in-scope; durable/queued infra is a spec non-goal):** pin Passenger to a single app process (`passenger_max_pool_size 1` + `passenger_min_instances 1`) and treat it as a **required operational deploy constraint** (enforcement lives in Passenger/Capistrano config, not application code). See plan.md "Deployment Topology".

Responsibilities (no domain data; not in `Persistence`):

- `startOrAttach(key, mode) → AssemblyJob` — dedup by `AssemblyJobKey`.
- `get(jobId) → AssemblyJob | undefined`; `getByKey(key) → AssemblyJob | undefined`.
- Serializes the soffice merge step (**concurrency 1**); additional distinct-key jobs sit in `queued`.
- Enforces per-job hard timeout + soffice kill → `failed`. **The timeout clock starts at run-start (slot acquisition), not at enqueue (Pass 2 finding D):** with concurrency-1 plus the queue-depth cap, jobs can legitimately sit `queued` behind ~40 s of prior work; timing from enqueue would spuriously `fail` a job before it ever ran. Queued wait is bounded by the queue-depth cap (admission control), not by timing out already-admitted jobs.
- **Marks `ready` only after verifying a non-empty result (Pass 2 finding F):** after the soffice run, `stat` the result path and require non-zero size (and a valid ODT mimetype-first entry) before `running → ready`; a truncated/zero-byte `storeToURL` output (disk-full, partial write) transitions to `failed` (`"assembly failed (internal)"`) rather than handing the operator a corrupt download.
- Owns per-job working-dir + profile lifecycle. **Working dirs live under a single known dedicated root, not a bare `mktemp -d`, and are swept on startup (Pass 3 finding — MEDIUM):** each job's constituents, flattened copies, and soffice profile live under `<docStorage>/assembly-work/<jobId>/` (still isolated per job — preserves Pass 2 finding B's collision fix). They are `rm -rf`'d eagerly on completion/caught-crash **and** the whole `assembly-work/` root is swept on registry init at server startup, because the eager cleanup never runs on abrupt death (SIGKILL / OOM / `custom:restart_passenger`, which fires on **every** Capistrano deploy). Without the startup sweep these orphans have **no app-controlled cleanup path** (they sit outside the `docStorage` 24 h `cleanTmpDir` sweep by Pass 2's design, and OS tmp policy is not guaranteed / does not apply to an app-local root).

### Constituent provenance & copy-before-flatten (Pass 5 finding — CRITICAL)

`makeLessonFile` is reused **unchanged**, and two verified facts about it constrain the assembly action:

- `makeLessonFile.ts:15` short-circuits the English+English case and **returns the raw source `docStorage.docFilepath(lesson)`** (the admin-uploaded source `.odt` under `docs/`) — not a tmp copy. This fires for **English mother-tongue bilingual** assembly, i.e. the golden-reference case the integration test assembles.
- `makeLessonFile.ts:34` otherwise hardcodes output to `docStorage.tmpFilePath(`${motherLang.name}_${lessonName(lesson)}.odt`)` in the **flat `docStorage` dir**; the caller cannot redirect it into `assembly-work/<jobId>/`.

**Rules the assembly action MUST follow:**

- The `makeLessonFile`-returned path is **strictly read-only**. `flattenFooterFields` and the merge MUST operate on a **copy** placed in `assembly-work/<jobId>/`, never in place — because that path can be the canonical source ODT in `docs/`, and an in-place `styles.xml`/zip mutation or `rm -rf` would **destroy non-recoverable source data** (CRITICAL).
- This copy is also the sole mechanism that gets constituents into the per-job working dir (`makeLessonFile` cannot target it), so it is what makes the collision-safe intermediates (Pass 2 finding B) and the startup-swept working-dir design (Pass 3) achievable rather than aspirational.
- Name the copies with **ASCII, deterministic, insertion-order** filenames (`00.odt` = TOC, `01.odt`..`13.odt`). This closes the macro surface: the injected StarBasic `insertDocumentFromURL(...)` references only controlled ASCII `file://` URLs — never an arbitrary Unicode DB-stored language name interpolated into a StarBasic string literal / URL. The human-facing language-named download filename is set separately at stream time (contract §4).

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

| Rule                                                        | Source               | Enforced in                                                                                                                                                                              |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 14 constituents exist                                   | FR-006, US4-1        | completeness check (pre-merge)                                                                                                                                                           |
| Each constituent generates without error                    | FR-006, US4-2        | completeness/generation check                                                                                                                                                            |
| No stricter translation bar than per-lesson                 | FR-005               | reuse `makeLessonFile` unchanged                                                                                                                                                         |
| Output fully editable (0 protected / 0 linked)              | FR-002               | soffice merge (spike-confirmed) + integration assertion                                                                                                                                  |
| Continuous numbering + first-page suppression               | FR-003               | soffice merge + `PAGE_BEFORE` break (spike-confirmed)                                                                                                                                    |
| Footer Quarter/Lesson numbers present                       | FR-004               | `flattenFooterFields` pre-process                                                                                                                                                        |
| Flattened footer values XML-escaped; missing prop tolerated | FR-004 (red-team)    | `flattenFooterFields` escapes `& < >` and falls back (derive from `series`/`lesson`) when the `meta.xml` custom property is absent/empty — else malformed `styles.xml` or a blank footer |
| One live job per `(languageId, book, series, mode)`         | FR-010               | registry dedup (synchronous check-then-insert — see "Dedup atomicity")                                                                                                                   |
| No partial book ever delivered                              | FR-006/FR-009/FR-011 | `failed` carries no `resultPath`                                                                                                                                                         |
| Live-job count within cap; terminal entries evicted         | red-team             | registry queue-depth cap (`429`) + TTL/pruned-file eviction                                                                                                                              |
| Failure `reason` is fixed-vocabulary (no raw stderr/paths)  | FR-009 (red-team)    | curated message; raw detail logged server-side only                                                                                                                                      |
| Constituent copied into per-job dir; source never mutated   | Pass 5 (CRITICAL)    | copy each `makeLessonFile` result into `assembly-work/<jobId>/` (ASCII `00..13.odt`) before flatten/merge; the returned path (raw `docs/` source for English+English) is read-only       |
| `POST` over `failed`/pruned-`ready` starts a fresh job      | FR-009 (Pass 5)      | terminal-attach rule: `failed` and pruned-`ready` treated as absent → new job; valid-`ready`/`queued`/`running` → attach                                                                 |
