# Phase 0 Research: Assembled Quarter Download

All items below either resolve a "Deferred to Planning" question from the brainstorm or a technical unknown from the Technical Context. The WS-2a spike (`spike/FINDINGS.md`) and WS-2a′ `.odm` spike (`spike/odm/FINDINGS-odm.md`) are the primary evidence base; findings are cited rather than re-derived.

---

## R1. `soffice` invocation mechanism + per-job profile isolation

**Decision**: Merge the 14 constituent ODTs by driving `XDocumentInsertable.insertDocumentFromURL` from an **injected StarBasic macro** (`Standard.Module1.Assemble`) running in-process inside `soffice --headless`, against a **per-job isolated `-env:UserInstallation` profile**. Productionize the spike's three-step flow into a server wrapper (`sofficeAssemble.ts`):

1. **Warm** a fresh `mktemp` profile (`soffice --headless --convert-to odt` on a throwaway file) so LO builds its `user/basic` library tree.
2. **Inject** `macro/Module1.xba` into `<profile>/user/basic/Standard/`; `rm -f <profile>/.lock` (warmup leaves a stale lock).
3. **Run** `soffice --headless --norestore --nologo -env:UserInstallation=file://<profile> macro:///Standard.Module1.Assemble`, passing the ordered file list + output URL via env vars (as the spike's `SPIKE_FILES` / `SPIKE_OUT_URL`). The macro inserts a `PARAGRAPH_BREAK` + `BreakType=PAGE_BEFORE` before each doc 2..14 (**required** — without it lessons ran onto the prior page, 78 vs 91 pages) and calls `insertDocumentFromURL(url, {UpdateDocMode: NO_UPDATE})` (NO_UPDATE avoids a headless "update links?" hang), then `storeToURL(FilterName="writer8")`.

**Rationale**:

- The six required output properties (order, continuous numbering, first-page suppression, footers, image integrity, editability) are properties of the **UNO call**, not the driving language — the spike confirmed 5/6 solid and 2 with scriptable fixes using exactly this call.
- **Cross-platform local testability decides driver = Basic macro, not Python-UNO.** On macOS dev machines LO's bundled Python is `SIGKILL`ed on launch (a hardened-runtime nested `.app`), even outside the sandbox. Devs must be able to run `yarn test:integration` before commit; Python-UNO cannot run on their Macs. The Basic macro reaches the identical UNO surface in-process inside the `soffice` binary that _does_ run, and works on both macOS dev and Linux prod. (Python-UNO remains viable **only** on the Linux server — rejected as the primary driver solely because it is not locally testable.)
- `soffice` is already a proven production dependency (`webifyLesson` uses `soffice --headless --convert-to htm`), so no new system dependency is introduced.

**Alternatives considered**:

- **Python-UNO** — identical mechanism, but not runnable on macOS dev (SIGKILL). Rejected as primary driver.
- **Approach A1 — `.odm` master document** — tested in the sibling WS-2a′ spike specifically because it was believed to fix the pagination gaps. It does **not**: A2 output, a scripted `.odm`, and _Chris's actual `English_Luke-Q2-Master.odm`_ all render the same +1 offset and no odd rectos. Adds master-authoring + unproven-detach cost for zero pagination benefit. **NO-GO** (`spike/odm/FINDINGS-odm.md`).
- **Approach C — Node/XML concat** — would have to hand-solve automatic-style collisions, master-page binding, field resolution, and continuous numbering that `soffice` resolves natively. Not needed; rejected.

---

## R2. Resolving the 13 lessons + TOC for a (book, series) and validating completeness

**Decision**: A quarter's constituent set = the `-99` TOC lesson plus the 13 lessons whose absolute numbers are `(series-1)*13+1 .. series*13`, all filtered from `storage.lessons()` by `book` + `series`. Completeness (US4 / FR-006) is validated **before** any `soffice` work: resolve the expected 14-part set, confirm every member exists as a `Lesson` record, and confirm each generates via `makeLessonFile` without error. Any missing or failing member → block/fail with a message naming the specific lesson(s); produce no partial book.

**Rationale**:

- `storage.lessons()` returns `BaseLesson[]`; `series` is the domain field the glossary maps to "Quarter" (`Q{series}`). `isTOCLesson()` / `TOC_LESSON = 99` already model the TOC as lesson 99. `lessonCompare` gives the canonical order (TOC first by virtue of the assembly placing `-99` ahead, then ascending lesson number). No new persistence method needed.
- **"Lessons 1–13" in the spec is conceptual.** The data uses **absolute** lesson numbers: series 2 = lessons 14–26, series 3 = 27–39, series 4 = 40–52. The pure resolution helper (`expectedLessonNumbers(series)`) makes this explicit and unit-testable.
- **Series 1 is a genuinely incomplete quarter** (missing lesson 06 — only 12 lessons; noted in `spike/FINDINGS.md`). This is a concrete US4 test fixture: assembling series 1 must block with "missing Luke 1-6".

**Alternatives considered**: A dedicated `Persistence.quarterLessons(book, series)` method — rejected (YAGNI; the filter is trivial and belongs in a pure helper, keeping the `Persistence` interface stable across all four implementations).

---

## R3. Continuous numbering, first-page suppression, and the +1 offset (FR-003)

**Decision**: Match Chris's reference deliverable exactly. Ship continuous numbering + per-lesson first-page suppression (both spike-**confirmed** with the manual `PAGE_BEFORE` break) and **reproduce the reference's page-number = physical + 1 offset as-is** — the offset is expected output, not a defect. The odd-page-start policy is **dropped** (out of scope): the reference starts no lesson on an odd recto, so `style:page-usage="right"` / blank-verso work is not performed. **No open FR-003 tension remains — resolved by the "match the reference" decision (2026-07-08).**

**Rationale / evidence**:

- Spike confirmed: numbers run continuously (never reset per lesson) and every lesson's first physical page suppresses its number. ✅
- **Reference verified (2026-07-08):** rendering Chris's `English_Luke-Q1-Master-bilingual.odt` to PDF shows page number = physical page + 1 throughout (phys 9→"10" … 13→"14"; lesson 2 phys 16→"17" … 20→"21"; every lesson identical), continuous across lessons, each lesson's first physical page suppressed, and footer Quarter/Lesson fields populated. This is the **same** offset the spike measured on A2's output and on the `.odm` render (FINDINGS-odm) — the shipped `.odt` was **not** manually corrected. Therefore A2's pagination already matches the reference; the only remaining gap is FR-004's blank footer fields (R4).
- The former +1-offset root-cause investigation and the `page-usage="right"` odd-recto work are **withdrawn from scope**. The reference defines correctness; it carries the offset and no odd starts, so there is nothing to fix.

**Acceptance approach**: define numbering/layout correctness by functional/visual comparison against the committed reference `.odt` (see spec Assumptions, "Reference deliverables"), not against an abstract "book-correct" ideal.

**Alternatives considered**: root-causing/removing the +1 offset, and forcing odd rectos via `page-usage="right"` — both rejected because the reference (the acceptance target) has neither correction; performing them would make the output diverge from the deliverable it must match.

---

## R4. Footer Quarter/Lesson number fields blank after merge (FR-004 consistency)

**Decision**: **Flatten each lesson's footer `text:user-defined` Quarter/Lesson fields to literal static text before insertion** (spike route (a) — per-ODT pre-process, decoupled from LO, testable in isolation). For each constituent ODT: read its `meta.xml` custom properties (`Quarter`, `Lesson`), substitute the `<text:user-defined name="Quarter"/"Lesson">…</text:user-defined>` elements in `styles.xml` (where the footer lives) with their resolved literal values, re-zip, then feed the flattened copy to the merge.

**Rationale**: `insertDocumentFromURL` merges body content but **not** per-document custom properties, so the merged `meta.xml` is empty and every such field resolves blank. 13 lessons carry _different_ Lesson numbers, so a single merged-doc property namespace cannot satisfy them — flattening to per-lesson literal text before merge is the only correct fix. Confirmed cause + fix in `spike/FINDINGS.md` caveat 5.

**Sharp edge (carry to implement)**: re-zipping an ODT requires **mimetype stored first, uncompressed**. `fsUtils.zip` (`zip -r`) does not guarantee this ordering; the flatten step must write the mimetype entry stored-first (or use a dedicated ODF-safe repack) rather than blindly reusing `fsUtils.zip`. Unit-test the repacked ODT opens and the fields read as literal text.

**Alternatives considered**:

- **In-macro flatten** (route b) — walk each inserted lesson's footer and replace field ranges with literal text in the one soffice pass. Rejected as primary: harder to unit-test in isolation, couples the fix to LO/UNO.
- **A1-only lead** — Chris's _protected_ linked sections preserve per-lesson footer numbers. Rejected: reintroduces the protected/linked-section coupling this feature exists to eliminate (FR-002).

---

## R5. Background job model: registry, dedup, concurrency, timeout, retention

**Decision**: An **in-process (in-memory) `AssemblyJobRegistry`** — no table, no external queue (FR-011). Shape:

- **Job identity / dedup key**: `(languageId, book, series, mode)` where `mode ∈ {bilingual, single-language}` (FR-010). A second request for a key with a live (queued/running) job **attaches to** the existing job and returns its status/id rather than starting redundant work.
- **Status**: discriminated union `queued | running | ready | failed`; `failed` carries a human-readable `reason`; `ready` carries the downloadable result path/id. Indeterminate — no percentage (per clarification).
- **Concurrency**: the `soffice` merge step is **serialized (concurrency 1)** — `soffice` is effectively single-instance for a merge. Implement as a single-slot queue; additional distinct-key jobs wait in `queued`. (Per-job isolated profiles are used regardless, per R1.)
- **Timeout + kill**: hard per-job timeout (budget ~2–3× the ~40 s observed; final value set in implement) that **kills** the soffice process (a hung soffice sits at 0 % CPU forever) and transitions the job to `failed` with a reason.
- **Result retention**: reuse the existing `docStorage` tmp dir + its **24 h cleanup** (`cleanTmpDir` prunes entries older than 24 h). After that window the operator re-requests (matches spec "bounded window" assumption). No new retention mechanism.
- **Interruption**: if the process restarts, in-memory jobs vanish; the operator simply re-requests (FR-011). No partial/stale book is ever delivered.
- **Profile hygiene**: each job's `mktemp` profile is `rm -rf`'d on completion **and** on crash/timeout (spike caveat 4).

**Rationale**: Matches the small-team, low-concurrency scale and the brainstorm's explicit non-goal of durable/queued infrastructure. Everything reuses existing primitives (`docStorage`, `child_process`).

**Alternatives considered**: DB-backed job table or external queue (BullMQ/etc.) — rejected as over-engineering the constitution's Simplicity principle explicitly forbids here (YAGNI; FR-011 says non-durable is acceptable).

---

## R6. REST endpoint shape & polling

**Decision**: Four operations on a new `assemblyController` (registered in `serverApp.ts` beside `documentsController`), reusing the same access as per-lesson download (no new authz — FR/assumption). Poll-based (no websockets), indeterminate status. Full contract in `contracts/assembly-api.md`:

- `POST /api/languages/:languageId/quarters/:book/:series/assembly` — start (or attach to) a job for `{ mode }`; returns `{ jobId, status }`. Idempotent per dedup key (R5).
- `GET  /api/languages/:languageId/quarters/:book/:series/assembly?mode=…` — poll status by key `{ status, reason?, jobId }`.
- `GET  /api/assembly/:jobId/status` — poll by job id (alternative for a held id).
- `GET  /api/assembly/:jobId/download` — stream the finished `.odt` (only when `ready`); `documentName`-style filename.

**Rationale**: Mirrors the existing per-lesson download URL shape and the `useGetDocument` blob-download pattern, minimizing new frontend concepts. Poll interval ~1–2 s from a `useAssembleQuarter` hook; indeterminate UI needs nothing finer (per clarification).

**Alternatives considered**: WebSocket/SSE progress — rejected (indeterminate status needs no streaming; adds infra for no product value). Single long-poll request — rejected (the whole point of the job model is to not hang a request, FR-007).
