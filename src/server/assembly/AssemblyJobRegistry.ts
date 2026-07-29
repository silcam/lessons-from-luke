import { Book } from "../../core/models/Lesson";
import { ASSEMBLY_MIN_AVAILABLE_BYTES } from "./assemblyBudget";

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
 *
 * The `signal` is the registry's cancellation channel: it aborts when the
 * job's hard timeout fires. A runner SHOULD unwind promptly on abort — it
 * still owns the concurrency-1 slot until its promise settles, which is
 * exactly what stops a second `soffice` from starting alongside it.
 */
export type AssemblyRunner = (signal: AbortSignal) => Promise<string>;

/** Fixed-vocabulary reason used for a `429`-equivalent registry rejection. */
export const CAP_REJECTED_REASON = "server busy, retry shortly";

/** Fixed-vocabulary reason used when a job's hard timeout fires. */
export const TIMEOUT_REASON = "assembly timed out";

export type StartOrAttachResult =
  { outcome: "started" | "attached"; job: AssemblyJob } | { outcome: "rejected"; reason: string };

export interface AssemblyJobRegistryOptions {
  /** Max number of live (`queued` + `running`) jobs before a new key is rejected. */
  maxLiveJobs: number;
  /**
   * Hard per-job timeout in ms, measured from run-start (slot acquisition),
   * not enqueue.
   *
   * This timeout marks the job `failed` and aborts the runner's signal, but
   * it does NOT free the concurrency-1 slot — the runner still owns that
   * until it settles, and it may still own a live `soffice` process, which
   * `sofficeAssemble`'s own timer (not this one) is what kills. It must
   * therefore still be set strictly longer than that timer plus the job's
   * non-soffice work, so a merely-slow job is never failed out from under a
   * `soffice` that was about to succeed. See `assemblyBudget.ts`.
   */
  timeoutMs: number;
  /**
   * How long a timed-out job may keep holding the concurrency-1 slot before
   * the slot is force-released and logged. The escape hatch of last resort
   * for a runner wedged in an unbounded await (`PGStorage` configures no
   * statement/query timeouts, and an `AbortSignal` cannot cancel an in-flight
   * porsager query). MUST be strictly greater than `timeoutMs` — see
   * `ASSEMBLY_ABANDON_MS` in `assemblyBudget.ts` for the full rationale and
   * why the residual risk is acceptable.
   */
  abandonMs: number;
  /** TTL in ms for terminal (`ready`/`failed`) entries, aligned with docStorage's 24h cleanup. */
  ttlMs: number;
  /** Injectable existence check for a `ready` job's `resultPath` (real impl: fs.existsSync). */
  fileExists: (path: string) => boolean;
  /** Injectable clock (real impl: `Date.now`). */
  now: () => number;
  /** Injectable id generator (real impl: `crypto.randomUUID`). */
  makeJobId: () => string;
  /**
   * Injectable available-system-memory probe in bytes (real impl:
   * `availableSystemMemory`, which reads Linux `MemAvailable`). Omitted, or
   * returning `undefined`, disables the low-memory admission guard — which is
   * what makes the guard inert on macOS dev boxes and in tests.
   */
  availableMemory?: () => number | undefined;
  /**
   * Floor of available memory below which a genuinely new job is rejected.
   * Only consulted when `availableMemory` yields a number. Defaults to
   * `ASSEMBLY_MIN_AVAILABLE_BYTES`, which is where the tuning notes live.
   */
  minAvailableBytes?: number;
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
  /** Created on promotion; aborted when the job's hard timeout fires. */
  abort?: AbortController;
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
 * - **The slot is a resource owned by the runner, not a property of job
 *   status.** It is acquired on promotion and released only when the runner's
 *   promise actually settles. A job's status may go terminal long before
 *   that, and the two are deliberately decoupled: marking a job `failed` is a
 *   statement to the *user*, while holding the slot is a statement about a
 *   *process* that may still be alive.
 * - Per-job hard timeout measured from run-start, not enqueue. The timeout
 *   marks the job `failed` and aborts the runner's `AbortSignal` — but does
 *   NOT free the slot or promote a successor, because the runner may still
 *   own a live `soffice`. For the soffice merge, `sofficeAssemble`'s own
 *   timer is what actually kills the process, which is why `timeoutMs` must
 *   outlast it — see `assemblyBudget.ts`.
 * - Terminal (`ready`/`failed`) statuses are immutable: a runner that settles
 *   after its job already timed out has its outcome ignored, so a `failed`
 *   job is never resurrected — but its settlement DOES release the slot, and
 *   that release is identity-guarded so it can never free a successor's.
 * - `abandonMs` escape hatch: if a runner never settles at all (an unbounded
 *   DB await), the slot is force-released and loudly logged rather than
 *   wedging the feature for the life of the process.
 * - Optional low-memory admission guard on genuinely new jobs.
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
  /**
   * Whose runner currently owns the concurrency-1 slot. NOT "which job is
   * `running`" — a timed-out job is `failed` yet still holds its slot until
   * its runner settles, and an evicted job is gone from `jobsById` yet still
   * holds it too. Only `releaseSlot` (a real settlement) and the abandon
   * hatch may clear this.
   */
  private slotHolderJobId: string | undefined;
  /** When the current holder acquired the slot — the abandon hatch's clock. */
  private slotHeldSince: number | undefined;

  constructor(options: AssemblyJobRegistryOptions) {
    this.options = options;
  }

  /**
   * Start a new job for `key`, or attach to an existing live/valid-ready job
   * for the same key. `runner` is invoked at most once per job it actually
   * starts (never for an attach).
   */
  startOrAttach(key: AssemblyJobKey, runner: AssemblyRunner): StartOrAttachResult {
    this.checkSlotAbandon();
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

    // Low-memory admission guard. Deliberately AFTER the dedup lookup, so
    // attaching to an existing job always works, and after the cheap cap
    // check so the in-memory comparison short-circuits the file read. Also
    // deliberately NOT in `promoteNext` — refusing there would strand an
    // already-queued job forever, since promotion is only ever reattempted
    // from `startOrAttach`, the timeout branch, and `completeJob`.
    const availableBytes = this.options.availableMemory?.();
    if (availableBytes !== undefined) {
      const floor = this.options.minAvailableBytes ?? ASSEMBLY_MIN_AVAILABLE_BYTES;
      if (availableBytes < floor) {
        console.warn(
          `[AssemblyJobRegistry] refusing new job: ${availableBytes} bytes available, floor is ${floor}`
        );
        return { outcome: "rejected", reason: CAP_REJECTED_REASON };
      }
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
    this.checkSlotAbandon();
    const job = this.checkAndExpire(jobId);
    return job ? this.toPublic(job) : undefined;
  }

  /** Look up a job by its dedup key. */
  getByKey(key: AssemblyJobKey): AssemblyJob | undefined {
    this.checkSlotAbandon();
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
    return this.queue.length + (this.slotHolderJobId !== undefined ? 1 : 0);
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
      // Ask the runner to unwind, but deliberately do NOT free the slot or
      // promote a successor. Marking the job `failed` is a statement to the
      // user; the runner may still own a live `soffice` process, and
      // promoting now is precisely how two merges end up running at once.
      // The slot is released by `completeJob` when the runner really
      // settles, or by the `abandonMs` hatch if it never does.
      job.abort?.abort();
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

  /**
   * Remove a job entirely: from the id map, key map, and queue.
   *
   * Deliberately does NOT touch the slot. Eviction removes bookkeeping; the
   * slot is a resource a live runner may still hold, and an evicted job's
   * runner keeps holding it until it settles (`completeJob` releases it even
   * for a job that is no longer in `jobsById`).
   */
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
  }

  /** If the concurrency-1 slot is unowned, promote and run the next queued job. */
  private promoteNext(): void {
    if (this.slotHolderJobId !== undefined) {
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
    const now = this.options.now();
    const controller = new AbortController();
    job.abort = controller;
    job.status = { tag: "running" };
    job.runStartedAt = now;
    // Claim the slot BEFORE invoking the runner. `assemblyController`'s
    // runner calls `registry.getByKey` synchronously as its first act, which
    // re-enters `checkSlotAbandon` — with `slotHeldSince` unset that would
    // read as an abandoned slot and force-release the job that is only just
    // starting.
    this.slotHolderJobId = nextJobId;
    this.slotHeldSince = now;

    // A runner that throws synchronously must become a rejected promise, not
    // an exception unwinding out of `promoteNext` (which would leave the slot
    // held by a job that never started). Deferring to the microtask queue
    // also keeps `completeJob` from re-entering `promoteNext` on a live
    // stack frame.
    let running: Promise<string>;
    try {
      running = job.runner(controller.signal);
    } catch (error: unknown) {
      running = Promise.reject(error);
    }

    running
      .then((resultPath: string) => {
        this.completeJob(nextJobId as string, { tag: "ready", resultPath });
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.completeJob(nextJobId as string, { tag: "failed", reason });
      });
  }

  /**
   * Record a job's outcome (unless it already went terminal) and, either way,
   * release the slot its runner has been holding.
   */
  private completeJob(jobId: string, status: AssemblyJobStatus): void {
    const job = this.jobsById.get(jobId);
    if (job) {
      if (job.status.tag === "ready" || job.status.tag === "failed") {
        // The job already reached a terminal state — it timed out. Recording
        // this late settlement would resurrect a `failed` job as `ready` and
        // refresh its `terminalAt` (extending its TTL). Terminal states are
        // immutable, so the OUTCOME is dropped.
        //
        // The slot release below is not dropped, though: this settlement is
        // the very event the slot was being held for. It is the expected
        // path whenever a job times out, not an invariant breach — the
        // invariant holds precisely because nothing was promoted in between.
        console.warn(
          `[AssemblyJobRegistry] job ${jobId} settled after reaching terminal state ` +
            `"${job.status.tag}" (it timed out). Outcome ignored — terminal statuses are ` +
            `immutable — but its concurrency-1 slot is released now.`
        );
      } else {
        job.status = status;
        job.terminalAt = this.options.now();
      }
    }
    // Outside the `if (job)`: an evicted job is gone from `jobsById` yet its
    // runner still owned the slot until this moment.
    this.releaseSlot(jobId);
  }

  /**
   * Release the concurrency-1 slot if — and only if — `jobId` is its current
   * holder, then promote the next queued job.
   *
   * The identity guard is what makes a late settlement safe: by the time a
   * long-abandoned runner finally settles, the slot may belong to a
   * successor, and freeing that would put two `soffice` merges side by side.
   */
  private releaseSlot(jobId: string): void {
    if (this.slotHolderJobId !== jobId) {
      return;
    }
    this.slotHolderJobId = undefined;
    this.slotHeldSince = undefined;
    this.promoteNext();
  }

  /**
   * The `abandonMs` escape hatch. Lazily evaluated (matching the registry's
   * no-background-timer design) from `startOrAttach`, `get`, and `getByKey`:
   * if the slot has been held past `abandonMs`, force-release it so the
   * feature is not wedged for the life of the process.
   *
   * This can only be reached by a runner stuck in an await nothing bounds —
   * see `ASSEMBLY_ABANDON_MS` for why that scenario provably has no live
   * `soffice` to collide with. It is still a bug every time it happens,
   * hence `console.error`.
   */
  private checkSlotAbandon(): void {
    if (this.slotHolderJobId === undefined || this.slotHeldSince === undefined) {
      return;
    }
    if (this.options.now() - this.slotHeldSince < this.options.abandonMs) {
      return;
    }
    const abandonedJobId = this.slotHolderJobId;
    console.error(
      `[AssemblyJobRegistry] job ${abandonedJobId} has held the concurrency-1 assembly slot ` +
        `for over ${this.options.abandonMs}ms without settling; force-releasing it. Its runner ` +
        `is wedged in an unbounded await — see ASSEMBLY_ABANDON_MS in assemblyBudget.ts.`
    );
    // Best-effort cancellation: if nothing ever read this job, its own
    // timeout branch never fired and so never aborted it.
    this.jobsById.get(abandonedJobId)?.abort?.abort();
    this.slotHolderJobId = undefined;
    this.slotHeldSince = undefined;
    // Promote here rather than relying on the caller: `startOrAttach` returns
    // early on an attach and would never reach its own `promoteNext`, leaving
    // the successor queued until some unrelated later call woke it.
    this.promoteNext();
  }
}
