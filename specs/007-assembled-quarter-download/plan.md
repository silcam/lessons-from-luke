# Implementation Plan: Assembled Quarter Download

**Branch**: `007-assembled-quarter-download` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-assembled-quarter-download/spec.md`

## Summary

Automate what is today a manual LibreOffice master-document workflow: from the language page, one per-quarter action assembles the Table of Contents plus lessons 1–13 (absolute lesson numbers `(series-1)*13+1 .. series*13`, plus the `-99` TOC) into a single, self-contained, fully editable `.odt` with continuous page numbering and per-lesson first-page number suppression, in both bilingual and single-language modes. Assembly runs as a background, in-memory job (indeterminate "Assembling…" status → ready / failed), delivers the finished file for download, blocks incomplete quarters with a message naming the missing lesson(s), and never emits a partial book.

**Technical approach** (proven by the WS-2a spike, `spike/FINDINGS.md`, verdict GO): reuse the existing per-lesson `makeLessonFile` pipeline unchanged to generate the 14 constituent ODTs, then merge them with **LibreOffice headless via the `insertDocumentFromURL` UNO call driven from an injected StarBasic macro** against a per-job isolated `-env:UserInstallation` profile — productionizing the spike's warm-profile / inject-macro / run flow into a server action. A per-ODT footer field-flatten pre-process closes the one non-trivial spike gap (blank Quarter/Lesson footer numbers). Job tracking is an in-process registry (no table, no queue) keyed on `(languageId, book, series, mode)`, with the soffice step serialized (concurrency 1).

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-06-assembled-quarter-download-requirements.md](../brainstorms/2026-07-06-assembled-quarter-download-requirements.md)

### Key Decisions Carried Forward

- **Assembly mechanism = LibreOffice headless (`soffice`), not a pure-XML merge**: `soffice` natively resolves automatic-style collisions, master-page binding, field resolution, and continuous numbering that a hand-rolled merge would have to solve one-by-one. Proven viable by the WS-2a spike.
- **Background job + polling, not a long synchronous request**: assembling 14 documents through `soffice` (~30–40 s observed for 14 files) exceeds a comfortable request time.
- **Block incomplete quarters with a clear reason** rather than allowing partial assembly.
- **No stricter translation-completeness bar than today**: "complete" means all 13 lessons + TOC exist and generate without error, not that translation progress is 100%.
- **In-memory / process-scoped job tracking** (non-goal: any persistent job table or external queue).

### Deferred Questions (resolved during planning)

- **`soffice` invocation mechanism** → Injected StarBasic macro + `insertDocumentFromURL` against a per-job isolated profile (see research.md R1). Chosen over Python-UNO for cross-platform local testability (LO's bundled Python is SIGKILLed on macOS dev machines).
- **Profile-dir isolation & timeout/kill policy** → per-job `mktemp` profile, warm→inject→run, `rm -rf` on completion/crash; hard timeout with process kill for a hung soffice (research.md R1, R5).
- **Polling mechanism / job-ID scheme** → REST start + poll endpoints, in-memory registry keyed `(languageId, book, series, mode)`; download by job id (contracts/assembly-api.md).
- **Where the 13 lessons + TOC are looked up** → `storage.lessons()` filtered by `(book, series)`; completeness validated against the expected 14-part set (data-model.md, research.md R2).
- **Continuous numbering / footers / editability** → confirmed feasible by the spike; the +1 page-number offset is **matched, not removed** — Chris's reference `.odt` carries the identical offset (verified 2026-07-08), so A2's pagination already matches the acceptance target (research.md R3). Odd-page starts dropped from scope. Only remaining gap: footer field-flatten (FR-004).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: Express (server), existing `makeLessonFile` / `mergeXml` per-lesson pipeline, LibreOffice `soffice` headless (already a production dependency via `webifyLesson`), `child_process.exec`/`spawn`, React 16 + Redux Toolkit + styled-components (frontend), Axios + file-saver (download)
**Storage**: No new persistent storage. Domain reads go through the existing `Persistence` interface (`storage.lessons()`, `storage.lesson(id)`). Assembly job state is an **in-memory process-scoped registry** (FR-011 — explicitly non-durable). Output ODTs and constituents live in the existing `docStorage` tmp dir (24 h cleanup reused for result retention).
**Testing**: Jest unit TDD (`*.test.ts`) for imperative logic (job registry, file resolution/ordering, completeness validation, footer field-flatten); Jest integration (`*.integration.test.ts`, `yarn test:integration`, opt-in, serialized) for the real `soffice` merge; Cypress E2E for the operator flow on the language page
**Target Platform**: Linux server (production, Passenger + nvm Node 24); macOS/Linux dev workstations. Web deployment target only — **desktop/Electron is out of scope** (assembly is a server-only action; the isomorphic `core` and offline path are untouched).
**Project Type**: Web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`); this feature touches `server` + `frontend/web` only.
**Performance Goals**: No throughput target. Single-quarter assembly budget ~30–60 s (14 files, observed 30–40 s in spike); UI must never present a frozen control (indeterminate progress).
**Constraints**:

- `soffice` is effectively single-instance / single-concurrency for a merge — the assembly step MUST be serialized (concurrency 1) or use fully isolated per-job profiles with a hard timeout + kill.
- Output MUST be fully editable: 0 `text:protected`, 0 linked `.odt`, 0 `text:section-source` (spike-confirmed FR-002).
- No stricter translation-completeness bar than per-lesson download; reuse its partial-translation fallback unchanged.
- Introduce no change to existing per-lesson download endpoints/UI.
  **Scale/Scope**: Small-team, low-concurrency internal publishing tool. 4 REST endpoints, 1 server assembly action + job registry, 1 language-page UI control cluster (assemble + progress + download), ~4 complete quarters per book.

## Presentation Design

**Component Framework**: React 16 + styled-components, using the existing `src/frontend/common/base-components/` kit (`Button`, `Div`, `Table`, `Label`, `SelectInput`) per `DESIGN.md`. Register: product — clear, efficient, utilitarian ("Field Manual").
**Interaction Patterns**: Mirror the existing per-lesson `useGetDocument` / `GetDocumentButton` pattern (Axios blob download + `file-saver`). Add a small polling hook for the background job's status. State is local component state + Redux where it already lives (`state.lessons`, `state.languages`); no new global slice needed for the transient job.
**Accessibility Target**: WCAG 2.2 AA, consistent with the rest of the app. The "Assembling…" indicator must be announced (not a purely visual spinner) and the control must remain keyboard-operable and never appear frozen.

### UI Decisions

| Screen / Component                                                                                                  | User Story     | Approach                                                                                                                                                                                                    | Design Skills                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Per-quarter "Assemble quarter" control cluster on `LanguageView` (Bilingual \| Single-Language), grouped per series | US1, US2, US12 | Extend `LanguageView.tsx`: add a per-quarter row/section above or beside the per-lesson table, offering Bilingual and Single-Language assemble actions consistent with existing `GetDocumentButton` styling | `/design-language-to-daisyui` (n/a — this app uses base-components/styled-components, so `/impeccable` + DESIGN.md instead) |
| "Assembling…" in-progress indicator (indeterminate)                                                                 | US3            | Indeterminate status text/affordance driven by a polling hook; queued/running → "Assembling…", ready → auto-download or "Download" affordance, failed → human-readable reason                               | `/design-clarify` (status + error microcopy), `/design-onboard` (first-run empty/blocked state)                             |
| Blocked / failed message (names missing or failing lesson(s))                                                       | US4            | Inline human-readable message rendered in place of the progress affordance; identifies missing/failing lesson(s); offers retry (re-trigger)                                                                 | `/design-clarify` (error/blocked copy)                                                                                      |

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**:

- `/impeccable` — bring the new controls into line with `DESIGN.md` (flat, no-shadow, Helvetica scale, `Colors.ts` palette) and the existing per-lesson controls.
- `/design-clarify` — finalize the "Assembling…", blocked, and failure microcopy so a non-technical operator understands state and next action.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                   | Gate                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| I. Test-First (TDD, RGR, ~95–100% coverage) | Imperative logic (job registry, file resolution, completeness validation, footer field-flatten) gets unit TDD; the `soffice` merge — an external-binary surface the constitution explicitly routes to **integration tests** — gets `*.integration.test.ts`; the operator flow gets Cypress E2E.                                                                                                                         | PASS — layer mapping matches constitution §I "Document Processing and Multi-Layer Verification". |
| II. Type Safety & Static Analysis           | Explicit return types, no `any` (use `unknown` + guards), strict boolean expressions, `type` imports, ESLint max-warnings 0. New job-status/mode types are discriminated unions.                                                                                                                                                                                                                                        | PASS (enforced by pre-commit).                                                                   |
| III. Code Quality                           | JSDoc on new public functions/types; naming per glossary (Assembled quarter book, Assembly job, Assembly mode, TOC lesson, Quarter); import order.                                                                                                                                                                                                                                                                      | PASS.                                                                                            |
| IV. Pre-commit Gates                        | `yarn typecheck` + lint-staged (eslint → prettier → jest related). No `--no-verify`.                                                                                                                                                                                                                                                                                                                                    | PASS.                                                                                            |
| V. Warnings/Deprecations                    | Zero-tolerance; addressed as they arise.                                                                                                                                                                                                                                                                                                                                                                                | PASS.                                                                                            |
| VI. Layered Architecture & Dual Targets     | Server-only feature. Domain reads (`lessons`, `tStrings`) go through `Persistence`. The in-memory job registry and `soffice` orchestration are **server-only infrastructure that stores no domain data and is never imported into `core` or the desktop offline path** — squarely inside the boundary rules (analogous to the Principle VI server-only exemption reasoning). No change to `core`, no change to desktop. | PASS.                                                                                            |
| VII. Simplicity                             | In-memory registry (no queue/table), reuse existing pipeline + `soffice` dependency + `docStorage` tmp cleanup, mirror existing download UI. YAGNI: no durable jobs, no PDF, no covers.                                                                                                                                                                                                                                 | PASS.                                                                                            |

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/007-assembled-quarter-download/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── assembly-api.md   # REST contract for start/poll/download/status
├── spec.md
└── spike/               # WS-2a + WS-2a′ spike deliverables (assemble.sh, macro, FINDINGS)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── models/
│       └── Quarter.ts                 # NEW (optional): quarter/series lesson-set resolution helpers
│                                       #   (expectedLessonNumbers(series), isCompleteQuarter(...))
│                                       #   — pure, isomorphic, unit-tested. May instead live as
│                                       #   helpers alongside Lesson.ts.
├── server/
│   ├── actions/
│   │   ├── assembleQuarter.ts          # NEW: orchestrates constituent generation + soffice merge
│   │   ├── assembleQuarter.test.ts     # NEW: unit TDD (resolution, ordering, validation — soffice mocked)
│   │   ├── assembleQuarter.integration.test.ts  # NEW: real soffice merge, opt-in, serialized
│   │   ├── flattenFooterFields.ts      # NEW: per-ODT Quarter/Lesson field → literal text pre-process
│   │   └── flattenFooterFields.test.ts # NEW: unit TDD against a fixture ODT/styles.xml
│   ├── assembly/
│   │   ├── AssemblyJobRegistry.ts      # NEW: in-memory job registry (dedup, status, serialization)
│   │   ├── AssemblyJobRegistry.test.ts # NEW: unit TDD (dedup, lifecycle, concurrency-1)
│   │   ├── sofficeAssemble.ts          # NEW: warm-profile / inject-macro / run wrapper (from spike)
│   │   └── macro/Module1.xba           # NEW: the Assemble StarBasic macro (from spike template)
│   └── controllers/
│       ├── assemblyController.ts       # NEW: REST endpoints (start / status / download)
│       └── assemblyController.test.ts  # NEW: controller unit tests
└── frontend/
    └── web/
        ├── languages/
        │   └── LanguageView.tsx        # EDIT: add per-quarter assemble control cluster
        └── documents/
            ├── useAssembleQuarter.tsx  # NEW: start + poll + download hook (mirrors useGetDocument)
            └── AssembleQuarterButton.tsx  # NEW: control + progress/blocked/failed states

cypress/integration/
└── assembleQuarter.cy.ts               # NEW: E2E operator flow
```

**Structure Decision**: Web application, isomorphic four-layer. This feature adds a server assembly action + in-memory registry + REST controller (registered in `serverApp.ts` beside `documentsController`) and a web-frontend control cluster on the existing `LanguageView`. It reuses `makeLessonFile`, `mergeXml`, and `docStorage` unchanged, and adds the `soffice` merge orchestration proven in the spike. No `core` domain-data changes beyond optional pure quarter-set helpers; no desktop changes.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios below will get a corresponding acceptance spec file created during `sp:05-tasks` under `specs/acceptance-specs/`, in the GWT format the acceptance pipeline consumes.

| User Story                                         | Acceptance Spec File                                            | Scenarios |
| -------------------------------------------------- | --------------------------------------------------------------- | --------- |
| US1: Assemble and download a complete quarter book | `specs/acceptance-specs/US01-assemble-and-download-quarter.txt` | 3         |
| US2: Choose bilingual or single-language output    | `specs/acceptance-specs/US02-bilingual-or-single-language.txt`  | 3         |
| US3: See progress and receive the finished file    | `specs/acceptance-specs/US03-progress-and-delivery.txt`         | 3         |
| US4: Blocked when the quarter is incomplete        | `specs/acceptance-specs/US04-blocked-incomplete-quarter.txt`    | 2         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` → `acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Golden-reference check (FR-003/FR-004)**: The `*.integration.test.ts` layer for the real `soffice` merge asserts pagination/footer parity against a committed reference `.odt` (Chris's `English_Luke-Q<n>-Master-bilingual.odt`, added as a fixture during `sp:05-tasks`). The assertion is **functional/visual equivalence** on the five axes in spec Assumptions ("Reference deliverables") — content + order, continuous numbering, first-page suppression, populated footer fields, and page-number sequence (incl. the reference's +1 offset) — extracted via PDF render + `pdftotext`, **not** a byte-for-byte ODT diff (the LO-merge and manual-export routes never produce clean file diffs).

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

## Risks (carried into red-team / implement)

1. **[RESOLVED — was TOP RISK] The +1 page-number offset and odd-page starts (FR-003).** Closed by the 2026-07-08 decision to match Chris's reference deliverable. Rendering the reference `English_Luke-Q1-Master-bilingual.odt` to PDF confirmed it carries the identical page = physical + 1 offset and starts no lesson on an odd recto — the same behavior A2 already produces. So the offset is **matched, not removed** (no root-cause investigation), and the odd-page-start MUST is **dropped from scope** (no `page-usage="right"` / blank-verso work). The reference `.odt` is now the acceptance oracle for pagination (research.md R3; spec Assumptions "Reference deliverables"). Residual risk is only in the acceptance harness: "match" must be functional/visual equivalence, not a byte-for-byte diff.
2. **Footer Quarter/Lesson number fields blank after merge (FR-004 consistency).** Closed by the field-flatten pre-process (research.md R4); watch the `zip` mimetype-first / stored-uncompressed sharp edge in `fsUtils.zip`.
3. **`soffice` single-concurrency + hung-process risk.** Serialize the merge (concurrency 1), per-job isolated profile, hard timeout + kill (a hung soffice sits at 0 % CPU forever). research.md R1/R5.
4. **Local integration testing on macOS**: LO bundled Python is SIGKILLed; the Basic-macro driver is the cross-platform choice so devs can run `test:integration` before commit. research.md R1.
5. **Series 1 is an incomplete quarter (missing lesson 06)** — a concrete US4 fixture, and a reminder that "1–13" is conceptual: the real lesson numbers are absolute per series.

## Adversarial Hardening (Red-Team Pass 1)

Findings from the `/sp:04-red-team` adversarial review that are NOT covered by the sections above. Each is design-impacting or a concrete failure mode the happy-path design omits. Access control is deliberately out of scope (spec: "introduces no new access rules of its own"); none of these add authorization — they harden the in-memory job model, the soffice lifecycle, and the ODT pre-process the plan already builds.

### Performance & Resource Bounds

- **[HIGH] In-memory registry must have an eviction rule and a queue-depth cap.** `AssemblyJobRegistry` accumulates `ready`/`failed` entries with no documented eviction, so a long-running server process grows unboundedly **even with no adversary** (every distinct `(languageId, book, series, mode)` ever requested leaves a resident entry). Because the merge is concurrency-1 and each job is expensive (14× `makeLessonFile` + a ~40 s `soffice` merge), an accidental burst of distinct-key requests (multiple operators, multiple languages/series/modes) also lets the `queued` backlog and the tmp-dir footprint grow without bound. Mitigation (all in-memory — no durable infra, so within scope): (1) evict terminal (`ready`/`failed`) registry entries on a TTL aligned with the `docStorage` 24 h retention window (below), and drop a `ready` entry once its `resultPath` is gone; (2) impose a **maximum queue depth / max concurrent live jobs**; when exceeded, reject the start with `429 Too Many Requests` and a "server busy, retry shortly" reason rather than growing the queue. This is design-impacting → new `429` response added to `contracts/assembly-api.md`; eviction rule added to `data-model.md`.
- **[MEDIUM-HIGH] Result retention via `docStorage` 24 h cleanup is silently broken unless the merged output is written through `tmpFilePath()`.** `cleanTmpDir()` prunes by `parseInt(filename) < old` — it only ever deletes files whose on-disk name **begins with the epoch-ms timestamp** that `tmpFilePath()` prepends (`${timestamp}_${baseName}`). If the assembled output is written with a human-facing name like `English_Luke-Q1-bilingual.odt`, `parseInt(...)` is `NaN`, `NaN < old` is `false`, and the file is **never pruned** → unbounded disk leak, defeating the plan's "24 h cleanup reused for result retention" claim. Mitigation: the assembled **result** `.odt` MUST be created via `docStorage.tmpFilePath(...)` so it carries the timestamp prefix; the **on-disk** name is decoupled from the `Content-Disposition` download filename (the latter is set per `documentName()` conventions at stream time, contract §4). Do not hand-name files into `docsTmpPath()`. **(Corrected by Pass 2 finding B — see below):** this applies to the **result only**. The intermediate constituents and flattened copies do **not** go through `tmpFilePath` (that would leak them into the flat `docStorage` dir and re-collide with concurrent jobs — see finding on "Constituent-file name collision"); they live in the per-job `mktemp` working subdir and are `rm -rf`'d eagerly on completion/crash, so they need no 24 h retention.
- **[LOW] Clarify whether completeness-validation `makeLessonFile` output is reused by the merge.** FR-006/US4 completeness "each of the 14 generates without error" is validated by running `makeLessonFile` on all 14 constituents. If the merge step then regenerates them, the quarter is built twice (~doubling the already-long job). The plan should generate each constituent once, cache the resulting path, and feed those same paths (post field-flatten) into the merge.

### Edge Cases & Concurrency

- **[HIGH] Dedup (FR-010) has a TOCTOU race unless `startOrAttach` registers the job synchronously.** The controller flow is `POST → look up existing job → else create`. If any `await` (e.g. `storage.lessons()` for completeness, `storage.language(...)`) runs **between** the "no live job for this key" check and the registry insert, two near-simultaneous POSTs (the classic double-click, or two operators) both observe "no job" and both start a full assembly — redundant `soffice` work, duplicate temp profiles, and a violation of FR-010. Mitigation: `AssemblyJobRegistry.startOrAttach(key)` MUST insert a placeholder (`queued`) entry for the key **synchronously, before yielding to any `await`**, and return the existing entry if one is already present. All async work (completeness check, generation, merge) happens _after_ the slot is claimed. Node's single-threaded event loop makes a synchronous check-then-insert atomic; an `await` in the middle breaks that guarantee.
- **[MEDIUM] `soffice` contention with the existing `webifyLesson` path.** The concurrency-1 serialization guards assembly-vs-assembly, but `webifyLesson` (triggered on admin English-doc upload) also spawns `soffice`. `soffice` is effectively single-instance per user profile; a concurrent `webifyLesson` and assembly merge can collide (second invocation attaches to the first's running instance, or fails). The per-job isolated `-env:UserInstallation` profile is the intended decoupler — the plan MUST confirm (integration test) that an assembly merge with its isolated profile runs correctly while a default-profile `webifyLesson` `soffice` is active, and vice versa. If isolation is insufficient, the concurrency-1 gate must extend across _both_ soffice consumers.
- **[MEDIUM] Constituent-file name collision under concurrent distinct-key jobs.** `makeLessonFile` writes to `tmpFilePath(`${lang.name}_${lessonName(lesson)}.odt`)`, and the flatten step produces a second copy. Two live jobs for the same language but different modes (bilingual vs single-language) resolve the _same_ `lessonName`, and `tmpFilePath` only disambiguates by epoch-ms — same-millisecond calls collide, and the two modes' content differs, so a mid-merge overwrite corrupts one job's output. Mitigation: give each job its own working subdirectory (e.g. under the per-job `mktemp` area already created for the profile) for its constituents + flattened copies, rather than sharing the flat `docsTmpPath()`.

### Error Handling & Failure Modes

- **[MEDIUM] Killing a hung `soffice` must kill the process _group_, not just the parent PID.** `soffice` launches via an `oosplash` launcher that forks the real `soffice.bin`; killing the PID Node spawned can leave an orphaned `soffice.bin` running (at 0 % CPU, holding its profile/lock) — leaking the concurrency slot's assumptions and the temp profile. Mitigation: spawn the merge in its own process group (`detached: true` + `kill(-pid, ...)`, or equivalent) so the timeout kill reaps the whole tree; verify no orphaned `soffice.bin` remains after a forced timeout in the integration test; `rm -rf` the profile only after the tree is confirmed dead.
- **[MEDIUM] `ready` job whose result file was pruned must degrade to "re-request", not error.** A job can sit `ready` in the registry while `cleanTmpDir()` (run on the next `tmpFilePath()` call, ~24 h later) deletes its `resultPath`. A subsequent download then hits a missing file. Mitigation: the download handler MUST stat the file and, when absent, return `404` (mapped by the client to "expired — re-request", FR-011) rather than a 500 / stream error; the status poll for a `ready` job with a missing file should likewise report the job as gone (`404`) so the UI prompts a fresh assemble. This is design-impacting → clarified in `contracts/assembly-api.md` §4 and the poll responses.
- **[MEDIUM] The human-readable failure `reason` must be a curated message, never raw process output.** FR-009's `reason` is surfaced to the operator and returned over the API (contract §1/§2). If it echoes raw `soffice` stderr, a Node error `.stack`, or absolute server paths, it leaks internal filesystem layout and tooling detail into the UI. Mitigation: map failures to a fixed vocabulary — "missing constituent: Luke Q1 L6", "a lesson failed to generate: Luke Q1 L3", "assembly timed out", "assembly failed (internal)". Log the raw detail server-side; never place it in `reason`. Design-impacting → noted in the contract.

### Security & Robustness (admin-authored content)

> These inputs originate from admin-only uploads (`/api/admin/documents`) and DB-stored language names, not untrusted external input — so these are **correctness/robustness** hardening on trusted-but-fallible content, not external-attacker mitigations.

- **[MEDIUM] `flattenFooterFields` must XML-escape substituted values and tolerate missing metadata.** The step reads each constituent's `meta.xml` custom `Quarter`/`Lesson` properties and substitutes them as literal text into `styles.xml`. If a value contains XML metacharacters (`&`, `<`, `>`) or is absent/empty, naive string substitution produces malformed `styles.xml` (the merged ODT fails to open) or a blank/incorrect footer. Mitigation: XML-escape every substituted value; when a property is missing, fall back to a defined value (e.g. derive from the lesson's own `series`/`lesson`) rather than emitting an empty field; unit-test with metacharacter-bearing and missing-property fixtures. Design-impacting → validation rule added to `data-model.md`.
- **[LOW-MEDIUM] Validate `:book` against the `Book` union and sanitize the `Content-Disposition` filename.** `:book` flows from the URL into lesson lookups and the download filename; it MUST be validated against `"Luke" | "Acts"` (else `400`, per contract) rather than trusted. The `Content-Disposition` filename incorporates the language name (DB-stored) and path params — strip CR/LF and quote characters before interpolation so a stray character in a name can't split the header. Design-impacting → `400` on invalid `:book` reaffirmed in the contract.

### Accessibility Requirements

- **[LOW] Indeterminate-progress and terminal states need explicit assistive-tech handling.** The "Assembling…" indicator must live in an `aria-live="polite"` region (or use `role="status"`) so screen-reader users hear the transition; a purely visual spinner satisfies neither the plan's stated goal nor WCAG 2.2 AA. The assemble control, while a job runs, should use `aria-disabled="true"` (remaining focusable and announced) rather than the `disabled` attribute (which drops it from the tab order and silences its state). On transition to `failed`, move focus to (or announce) the error message so the reason and retry affordance are discoverable without a visual scan; on `ready`, announce that the download is available (especially if it auto-downloads, which is otherwise silent). These are presentation-only refinements — no contract/data-model impact.

## Adversarial Hardening (Red-Team Pass 2)

Pass 2 targets **second-order effects introduced by Pass 1's mitigations** plus one genuinely new gap Pass 1 missed. Findings converge downward in severity (Pass 1 had multiple Highs; Pass 2 has one). Access control remains out of scope.

### Concurrency & Job-Model Interactions (second-order from Pass 1)

- **[HIGH] The queue-depth cap (429) must not reject an _attach_; dedup-check MUST precede the cap-check.** Pass 1 added a max live-job cap that `startOrAttach` enforces with a `429`. But if the cap is checked _before_ the dedup lookup, an operator attaching to their **own** already-running job (the double-click, or the normal POST-then-poll cycle) gets a `429` whenever the queue is saturated — a direct violation of FR-010 ("the requester MUST be shown the progress of the existing job"). Mitigation: the synchronous critical section is strictly ordered **dedup-check → (on miss) cap-check → insert placeholder**. An attach to an existing live job for the key returns that job unconditionally and neither counts against nor is rejected by the cap; only a genuinely new key can be `429`'d. Second wrinkle: the `429` body Pass 1 specified as `{ status: "failed", reason }` carries **no `jobId`** and collides with the terminal `failed` job tag the client destructures from a `202`. The client MUST branch on **HTTP status** (429 = transient "server busy, retry shortly", not a terminal job failure), and the rejection should not masquerade as a `failed` job that offers a "retry the assembly" affordance for work that never started. Design-impacting → `contracts/assembly-api.md` §1 (ordering + 429 body/semantics clarified).

- **[MEDIUM] Congruence: Pass 1 finding #2 and finding #5 contradict each other on where intermediates live.** Finding #2 (result retention) says "the assembled `.odt` **and every intermediate flattened constituent** MUST be created via `docStorage.tmpFilePath(...)`" (→ intermediates in the flat `docStorage` dir). Finding #5 (collision) says constituents + flattened copies go "under the per-job `mktemp` area … **rather than** sharing the flat `docsTmpPath()`" (→ intermediates NOT in `docStorage`). An implementer cannot satisfy both. Reconciliation (applied above): **intermediates → per-job `mktemp` subdir** (collision-safe, `rm -rf`'d eagerly, no 24 h retention needed); **result only → `docStorage` via `tmpFilePath`** (carries the timestamp prefix for the 24 h prune). Finding #2's "and every intermediate flattened constituent" is an overreach and has been corrected. Note: the result-write still triggers `cleanTmpDir` (it calls `tmpFilePath`), so retention pruning continues to run per assembly.

- **[MEDIUM] The per-job hard timeout clock MUST start at run-start, not at enqueue.** Pass 1/R5 specify a hard timeout that kills a hung `soffice`. But with concurrency-1 and the new queue-depth cap, several distinct-key jobs can legitimately sit `queued` behind ~40 s of prior work each. If the timeout clock starts at _enqueue_, a job waiting its turn can be marked `failed` (timed out) **before it ever runs** — a spurious failure. Mitigation: the timeout measures only the `running` phase (from slot acquisition); queued wait is bounded instead by the queue-depth cap (which rejects at admission, not by timing out already-admitted jobs). Design-impacting → noted in `contracts/assembly-api.md` and research R5 intent.

### Input Robustness (new gap — not a Pass 1 second-order effect)

- **[MEDIUM] `Content-Disposition` filename must RFC 5987-encode the non-ASCII language name.** This is a **translation app**: the `<Language>` component of the download filename is routinely a mother-tongue name in a non-Latin script (Arabic, Devanagari, CJK, …). A bare `Content-Disposition: attachment; filename="<Language>_…"` param cannot carry those bytes — user agents mangle, drop, or mojibake them, and some reject the header. Pass 1's finding #10 handled CR/LF/quote injection but **not** the encoding of legitimate non-ASCII names (no overlap). Mitigation: emit both a sanitized ASCII `filename="…"` fallback **and** a `filename*=UTF-8''<pct-encoded>` parameter (RFC 5987/6266); percent-encode the language name after the existing CR/LF/quote strip. Design-impacting → `contracts/assembly-api.md` §4.

- **[LOW-MEDIUM] Validate numeric `:series` and `:languageId` → `400`, don't let `NaN` degrade to "missing everything".** Pass 1 hardened `:book`, but `:series`/`:languageId` are still `parseInt`'d from the URL untrusted. A non-numeric `:series` yields `NaN`; `expectedLessonNumbers(NaN)` produces no matches, so the quarter silently "fails completeness" with a confusing "missing all lessons" message instead of a clean input rejection. Mitigation: validate both params parse to finite integers up front and return `400 Bad Request` (alongside the existing invalid-`:book` `400`) rather than routing garbage through completeness logic. Design-impacting → `contracts/assembly-api.md` §1.

### Failure Detection

- **[LOW] Verify the merge produced a non-empty result before marking the job `ready`.** `storeToURL` can, under disk-full or a partial write, leave a truncated or zero-byte `.odt` while the macro run returns without an obvious error. Marking such a job `ready` hands the operator a corrupt download that passes no completeness gate. Mitigation: after the `soffice` run, `stat` the result path and require a non-zero size (and, cheaply, a valid ODT zip mimetype-first entry) before the `running → ready` transition; otherwise `failed` with `"assembly failed (internal)"`. Presentation/logic-only — no contract or data-model impact.

## Applied Learnings

_No entries — the `.specify/solutions/tooling/*` learnings are spec-kit-workflow-internal (acceptance-spec routing, harness/model schema), none relevant to soffice/ODT assembly or the job registry. Omitted deliberately._
