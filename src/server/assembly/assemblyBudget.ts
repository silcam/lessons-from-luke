import { DEFAULT_TIMEOUT_MS } from "./sofficeAssemble";

/**
 * Bounds for the in-memory, process-scoped assembly job registry (FR-011 —
 * explicitly non-durable; see data-model.md "Process-scoping assumption").
 *
 * These live in their own module rather than in `serverApp.ts` so a test can
 * assert the ordering invariant below without importing the whole Express
 * app (every controller, plus `getAuthPool()`).
 */

/**
 * Max live (`queued` + `running`) jobs before a new key is rejected. soffice
 * merges are concurrency-1 and take tens of seconds, so a small cap keeps the
 * queue from growing unboundedly.
 */
export const ASSEMBLY_MAX_LIVE_JOBS = 5;

/** TTL for terminal entries, mirroring docStorage's existing 24h tmp-file retention. */
export const ASSEMBLY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Budget for everything in a job that is NOT the soffice merge: 14x
 * `makeLessonFile`, 14x copy + `prepareConstituentForAssembly`, and
 * `finalizeAssembledQuarter`. Measured at ~9s on an M3 with real fixtures;
 * the deployed box (2 vCPU Lightsail) is ~2.5-3.5x slower, so ~21-27s. Two
 * minutes is generous against that.
 */
export const ASSEMBLY_NON_SOFFICE_BUDGET_MS = 2 * 60 * 1000;

/**
 * Each render's own self-kill budget. The render is a **second** `soffice`
 * invocation (contract §5) — a full PDF export of the assembled quarter —
 * distinct from the merge that `DEFAULT_TIMEOUT_MS` bounds. Sized the same
 * order of magnitude as the merge timeout: exporting an already-merged
 * ~100-page book to PDF is comparable single-`soffice`-process work to the
 * 14-document merge itself.
 */
export const ASSEMBLY_RENDER_TIMEOUT_MS = 120 * 1000;

/**
 * Cap on the bounded poll that waits for a `soffice` process group to have
 * fully exited before the next `soffice` invocation starts (contract §4's
 * "Security Considerations" group-exit check). Not an open await — Security
 * Considerations requires this check to be bounded, and `ASSEMBLY_ABANDON_MS`'s
 * own rationale is that unbounded awaits inside the runner can wedge the
 * concurrency-1 slot for the life of the process. There are up to three such
 * polls per job (before render 1, before the re-finalize, before the
 * confirmation render), which is why the sum below carries the term ×3.
 */
export const ASSEMBLY_EXIT_POLL_CAP_MS = 10 * 1000;

/**
 * Hard per-job registry timeout, measured from run-start.
 *
 * INVARIANT: the registry timeout may only fire AFTER every `soffice`
 * invocation in the job has already self-killed — the merge
 * (`DEFAULT_TIMEOUT_MS`), and up to two renders (production + mandatory
 * confirmation render, `ASSEMBLY_RENDER_TIMEOUT_MS` each). The registry
 * timeout does NOT kill soffice — only `sofficeAssemble`'s own timer (for
 * the merge) and each render's own timer (for a render) do — so if the
 * registry fired first it would mark the job `failed`, free the
 * concurrency-1 slot, and promote a queued job while an original soffice
 * process group was still alive. Two concurrent headless LibreOffice
 * instances on a 2 GB swapless box risk an OOM kill.
 *
 * The render and exit-poll terms are carried unconditionally (never behind
 * a runtime branch) for the same reason: deriving the budget from which
 * branch a job happens to take would make the invariant conditional instead
 * of structural. The factor of 2 on the render term and 3 on the poll term
 * are each the documented worst case (contract §5).
 *
 * Deriving this from `DEFAULT_TIMEOUT_MS` rather than hardcoding it is what
 * makes the invariant structural. Asserted in `assemblyBudget.test.ts`.
 */
export const ASSEMBLY_TIMEOUT_MS =
  DEFAULT_TIMEOUT_MS +
  2 * ASSEMBLY_RENDER_TIMEOUT_MS +
  3 * ASSEMBLY_EXIT_POLL_CAP_MS +
  ASSEMBLY_NON_SOFFICE_BUDGET_MS;

/**
 * How long the registry will let a timed-out job keep holding the
 * concurrency-1 slot before force-releasing it. The escape hatch of last
 * resort — it should never fire.
 *
 * The slot is normally held until the runner actually settles, which is what
 * guarantees two `soffice` processes never overlap. But the runner has awaits
 * that nothing bounds: `PGStorage` configures no `statement_timeout`,
 * `query_timeout`, or `connect_timeout`, so a stalled connection inside the
 * ~28 `storage.tStrings()` calls hangs forever, and an `AbortSignal` cannot
 * cancel an in-flight porsager query. Without this hatch that would wedge the
 * slot for the life of the process.
 *
 * The residual risk is acceptable precisely because of WHICH scenario reaches
 * here. `soffice` self-kills at `DEFAULT_TIMEOUT_MS`, so a hung merge rejects
 * well before `ASSEMBLY_TIMEOUT_MS`. Reaching the registry timeout at all
 * means the NON-soffice work overran its budget — and getting a further
 * `ASSEMBLY_NON_SOFFICE_BUDGET_MS` past that means it is stuck in a DB await,
 * where there is provably no live `soffice` to collide with.
 *
 * Asserted `> ASSEMBLY_TIMEOUT_MS` in `assemblyBudget.test.ts`.
 */
export const ASSEMBLY_ABANDON_MS = ASSEMBLY_TIMEOUT_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS;

/**
 * Floor of Linux `MemAvailable` below which a genuinely new assembly job is
 * refused (the low-memory admission guard in `AssemblyJobRegistry`).
 *
 * THIS IS A PLACEHOLDER, not a sized number: it is chosen for safety against
 * the deployed box's ~1.31 GB idle `MemAvailable`, not from a measured peak
 * RSS of a 14-document soffice merge. To tune it, watch `MemAvailable` during
 * one real assembly in production —
 * `while :; do grep MemAvailable /proc/meminfo; sleep 1; done` — and set this
 * to the observed peak usage plus ~256 MB of headroom.
 */
export const ASSEMBLY_MIN_AVAILABLE_BYTES = 512 * 1024 * 1024;
