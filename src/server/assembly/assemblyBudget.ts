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
 * Hard per-job registry timeout, measured from run-start.
 *
 * INVARIANT: the registry timeout may only fire AFTER soffice has already
 * self-killed. The registry timeout does NOT kill soffice — only
 * `sofficeAssemble`'s own timer does — so if the registry fired first it
 * would mark the job `failed`, free the concurrency-1 slot, and promote a
 * queued job while the original soffice process was still alive. Two
 * concurrent headless LibreOffice instances on a 2 GB swapless box risk an
 * OOM kill.
 *
 * Deriving this from `DEFAULT_TIMEOUT_MS` rather than hardcoding it is what
 * makes the invariant structural. Asserted in `assemblyBudget.test.ts`.
 */
export const ASSEMBLY_TIMEOUT_MS = DEFAULT_TIMEOUT_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS;

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
