import { Book } from "../../core/models/Lesson";

/**
 * The two per-lesson download modes an assembled quarter can be produced in.
 * See specs/007-assembled-quarter-download/data-model.md "AssemblyMode".
 */
export type AssemblyMode = "bilingual" | "single-language";

/**
 * The dedup identity for a live assembly job (FR-010). Equality is on all
 * four fields.
 */
export interface AssemblyJobKey {
  languageId: number;
  book: Book;
  series: number;
  mode: AssemblyMode;
}

/**
 * Discriminated job status union (no percentage — indeterminate, per
 * clarification). See data-model.md "AssemblyJobStatus".
 */
export type AssemblyJobStatus =
  | { tag: "queued" }
  | { tag: "running" }
  | { tag: "ready"; resultPath: string }
  | { tag: "failed"; reason: string };

/**
 * The transient unit of work tracked by {@link AssemblyJobRegistry}.
 */
export interface AssemblyJob {
  jobId: string;
  key: AssemblyJobKey;
  status: AssemblyJobStatus;
  createdAt: number;
}

/**
 * The caller-supplied async work for a single job (e.g. the 14x
 * `makeLessonFile` + soffice merge, or a test double). Resolves with the
 * finished result's absolute path, or rejects with an `Error` whose message
 * becomes the `failed` job's `reason`.
 *
 * The registry is deliberately ignorant of what this does — it only
 * schedules it (concurrency-1), times it, and records its outcome. See
 * data-model.md "AssemblyJobRegistry (in-memory, server-only)".
 */
export type AssemblyRunner = () => Promise<string>;

/** Fixed-vocabulary reason used for a `429`-equivalent registry rejection. */
export const CAP_REJECTED_REASON = "server busy, retry shortly";

/** Fixed-vocabulary reason used when a job's hard timeout fires. */
export const TIMEOUT_REASON = "assembly timed out";

export type StartOrAttachResult =
  | { outcome: "started" | "attached"; job: AssemblyJob }
  | { outcome: "rejected"; reason: string };

export interface AssemblyJobRegistryOptions {
  /** Max number of live (`queued` + `running`) jobs before a new key is rejected. */
  maxLiveJobs: number;
  /** Hard per-job timeout in ms, measured from run-start (slot acquisition), not enqueue. */
  timeoutMs: number;
  /** TTL in ms for terminal (`ready`/`failed`) entries, aligned with docStorage's 24h cleanup. */
  ttlMs: number;
  /** Injectable existence check for a `ready` job's `resultPath` (real impl: fs.existsSync). */
  fileExists: (path: string) => boolean;
  /** Injectable clock (real impl: `Date.now`). */
  now: () => number;
  /** Injectable id generator (real impl: `crypto.randomUUID`). */
  makeJobId: () => string;
}

/**
 * In-memory, process-scoped registry of assembly jobs (FR-011 — no
 * persistence). See specs/007-assembled-quarter-download/data-model.md
 * "AssemblyJobRegistry (in-memory, server-only)" for the full behavior
 * contract this class must satisfy:
 *
 * - Dedup/attach on an existing live (`queued`/`running`) or still-valid
 *   `ready` job for the same {@link AssemblyJobKey} (FR-010).
 * - Synchronous check-then-insert: the dedup lookup and placeholder insert
 *   for a genuinely new key happen with no `await` between them.
 * - Dedup-before-cap ordering: an attach is never rejected by the queue-depth
 *   cap; only a genuinely new key can be.
 * - Terminal-attach / retry: a `failed` entry, or a `ready` entry whose
 *   result file is gone, is treated as absent and evicted in favor of a
 *   fresh job.
 * - Concurrency-1 serialization of the underlying runner (the soffice
 *   merge step is single-instance).
 * - Per-job hard timeout measured from run-start, not enqueue.
 * - Queue-depth cap surfaced as a rejection (mapped to `429` by the caller).
 * - TTL eviction of terminal entries, plus immediate eviction of a `ready`
 *   entry once its result file is found missing.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.3;
 * real implementation lands in lessons-from-luke-koog.6.1.4.
 */
export class AssemblyJobRegistry {
  constructor(_options: AssemblyJobRegistryOptions) {
    throw new Error("not implemented");
  }

  /**
   * Start a new job for `key`, or attach to an existing live/valid-ready job
   * for the same key. `runner` is invoked at most once per job it actually
   * starts (never for an attach).
   */
  startOrAttach(_key: AssemblyJobKey, _runner: AssemblyRunner): StartOrAttachResult {
    throw new Error("not implemented");
  }

  /** Look up a job by its opaque id. */
  get(_jobId: string): AssemblyJob | undefined {
    throw new Error("not implemented");
  }

  /** Look up a job by its dedup key. */
  getByKey(_key: AssemblyJobKey): AssemblyJob | undefined {
    throw new Error("not implemented");
  }
}
