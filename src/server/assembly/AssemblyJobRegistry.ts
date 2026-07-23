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
 * Bookkeeping the registry keeps per job in addition to the public
 * {@link AssemblyJob} shape: the runner to invoke on promotion, and the
 * timestamps needed to lazily evaluate the run-start timeout and the
 * terminal-entry TTL.
 */
interface InternalJob extends AssemblyJob {
  runner: AssemblyRunner;
  /** Set when the job is promoted to `running` (slot acquisition time). */
  runStartedAt?: number;
  /** Set when the job reaches a terminal (`ready`/`failed`) status. */
  terminalAt?: number;
}

/**
 * In-memory, process-scoped registry of assembly jobs (FR-011 — no
 * persistence). See specs/007-assembled-quarter-download/data-model.md
 * "AssemblyJobRegistry (in-memory, server-only)" for the full behavior
 * contract this class satisfies:
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
 * All time-based rules (timeout, TTL) are evaluated lazily — there is no
 * background timer. A job's staleness is checked whenever it is read or
 * looked up (`get`, `getByKey`, or the dedup lookup inside `startOrAttach`),
 * scoped to that one job so unrelated jobs are never disturbed as a
 * side effect of an unrelated call.
 *
 * Server-only infrastructure — MUST NOT be imported into `src/core` or
 * `src/desktop` (Constitution Principle VI).
 */
export class AssemblyJobRegistry {
  private readonly options: AssemblyJobRegistryOptions;
  private readonly jobsById = new Map<string, InternalJob>();
  private readonly keyToJobId = new Map<string, string>();
  private readonly queue: string[] = [];
  private runningJobId: string | undefined;

  constructor(options: AssemblyJobRegistryOptions) {
    this.options = options;
  }

  /**
   * Start a new job for `key`, or attach to an existing live/valid-ready job
   * for the same key. `runner` is invoked at most once per job it actually
   * starts (never for an attach).
   */
  startOrAttach(key: AssemblyJobKey, runner: AssemblyRunner): StartOrAttachResult {
    const keyString = this.toKeyString(key);
    const existingJobId = this.keyToJobId.get(keyString);
    if (existingJobId !== undefined) {
      const existing = this.checkAndExpire(existingJobId);
      if (existing) {
        if (existing.status.tag === "queued" || existing.status.tag === "running") {
          return { outcome: "attached", job: this.toPublic(existing) };
        }
        if (
          existing.status.tag === "ready" &&
          this.options.fileExists(existing.status.resultPath)
        ) {
          return { outcome: "attached", job: this.toPublic(existing) };
        }
        // `failed`, or `ready` with a pruned result file: treat as absent.
        this.evict(existingJobId);
      }
    }

    if (this.countLiveJobs() >= this.options.maxLiveJobs) {
      return { outcome: "rejected", reason: CAP_REJECTED_REASON };
    }

    const jobId = this.options.makeJobId();
    const job: InternalJob = {
      jobId,
      key: { ...key },
      status: { tag: "queued" },
      createdAt: this.options.now(),
      runner,
    };
    this.jobsById.set(jobId, job);
    this.keyToJobId.set(keyString, jobId);
    this.queue.push(jobId);
    this.promoteNext();

    return { outcome: "started", job: this.toPublic(this.mustGetJob(jobId)) };
  }

  /** Look up a job by its opaque id. */
  get(jobId: string): AssemblyJob | undefined {
    const job = this.checkAndExpire(jobId);
    return job ? this.toPublic(job) : undefined;
  }

  /** Look up a job by its dedup key. */
  getByKey(key: AssemblyJobKey): AssemblyJob | undefined {
    const jobId = this.keyToJobId.get(this.toKeyString(key));
    if (jobId === undefined) {
      return undefined;
    }
    const job = this.checkAndExpire(jobId);
    return job ? this.toPublic(job) : undefined;
  }

  /** Stable string identity for a dedup key. */
  private toKeyString(key: AssemblyJobKey): string {
    return `${key.languageId}|${key.book}|${key.series}|${key.mode}`;
  }

  private countLiveJobs(): number {
    return this.queue.length + (this.runningJobId !== undefined ? 1 : 0);
  }

  private mustGetJob(jobId: string): InternalJob {
    const job = this.jobsById.get(jobId);
    if (!job) {
      throw new Error(`AssemblyJobRegistry: unknown jobId ${jobId}`);
    }
    return job;
  }

  private toPublic(job: InternalJob): AssemblyJob {
    return { jobId: job.jobId, key: job.key, status: job.status, createdAt: job.createdAt };
  }

  /**
   * Evaluate `jobId`'s lazy staleness rules (run-start timeout while
   * `running`; TTL while terminal) and apply any resulting transition,
   * scoped to this one job. Returns the (possibly now-`failed`) job, or
   * `undefined` if it doesn't exist or was just TTL-evicted.
   */
  private checkAndExpire(jobId: string): InternalJob | undefined {
    const job = this.jobsById.get(jobId);
    if (!job) {
      return undefined;
    }
    const now = this.options.now();

    if (
      job.status.tag === "running" &&
      job.runStartedAt !== undefined &&
      now - job.runStartedAt >= this.options.timeoutMs
    ) {
      job.status = { tag: "failed", reason: TIMEOUT_REASON };
      job.terminalAt = now;
      if (this.runningJobId === jobId) {
        this.runningJobId = undefined;
      }
      this.promoteNext();
    }

    if (
      (job.status.tag === "ready" || job.status.tag === "failed") &&
      job.terminalAt !== undefined &&
      now - job.terminalAt >= this.options.ttlMs
    ) {
      this.evict(jobId);
      return undefined;
    }

    return job;
  }

  /** Remove a job entirely: from the id map, key map, queue, and running slot. */
  private evict(jobId: string): void {
    const job = this.jobsById.get(jobId);
    if (!job) {
      return;
    }
    this.jobsById.delete(jobId);
    const keyString = this.toKeyString(job.key);
    if (this.keyToJobId.get(keyString) === jobId) {
      this.keyToJobId.delete(keyString);
    }
    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }
    if (this.runningJobId === jobId) {
      this.runningJobId = undefined;
    }
  }

  /** If the single concurrency slot is free, promote and run the next queued job. */
  private promoteNext(): void {
    if (this.runningJobId !== undefined) {
      return;
    }
    let nextJobId = this.queue.shift();
    while (nextJobId !== undefined && !this.jobsById.has(nextJobId)) {
      nextJobId = this.queue.shift();
    }
    if (nextJobId === undefined) {
      return;
    }

    const job = this.mustGetJob(nextJobId);
    this.runningJobId = nextJobId;
    job.status = { tag: "running" };
    job.runStartedAt = this.options.now();

    job
      .runner()
      .then((resultPath: string) => {
        this.completeJob(nextJobId as string, { tag: "ready", resultPath });
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.completeJob(nextJobId as string, { tag: "failed", reason });
      });
  }

  /** Record a running job's outcome, free its slot, and promote the next queued job. */
  private completeJob(jobId: string, status: AssemblyJobStatus): void {
    const job = this.jobsById.get(jobId);
    if (job) {
      job.status = status;
      job.terminalAt = this.options.now();
    }
    if (this.runningJobId === jobId) {
      this.runningJobId = undefined;
    }
    this.promoteNext();
  }
}
