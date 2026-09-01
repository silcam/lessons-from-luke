/// <reference types="jest" />

import {
  AssemblyJobRegistry,
  AssemblyJobKey,
  AssemblyRunner,
  AssemblyJobRegistryOptions,
  CAP_REJECTED_REASON,
  TIMEOUT_REASON,
} from "./AssemblyJobRegistry";

/** A promise plus its externally-callable resolve/reject, for controlling runner timing in tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush the microtask queue enough times for chained `.then`s inside the registry to settle. */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function makeKey(overrides: Partial<AssemblyJobKey> = {}): AssemblyJobKey {
  return { languageId: 1, book: "Luke", series: 1, mode: "bilingual", ...overrides };
}

/** A controllable clock for lazily-evaluated timeout/TTL checks. */
function makeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/** A controllable id generator so assertions on distinct jobIds are deterministic. */
function makeIdGen() {
  let n = 0;
  return () => `job-${++n}`;
}

function makeRegistry(overrides: Partial<AssemblyJobRegistryOptions> = {}) {
  const clock = makeClock();
  const makeJobId = makeIdGen();
  const registry = new AssemblyJobRegistry({
    maxLiveJobs: 10,
    timeoutMs: 1000,
    abandonMs: 100_000,
    ttlMs: 5000,
    fileExists: () => true,
    now: clock.now,
    makeJobId,
    ...overrides,
  });
  return { registry, clock, makeJobId };
}

/** A runner that never resolves/rejects until the test tells it to. */
function pendingRunner(): {
  runner: AssemblyRunner;
  resolve: (path: string) => void;
  reject: (e: unknown) => void;
  calls: number;
  signals: AbortSignal[];
} {
  const d = deferred<string>();
  const state = { calls: 0 };
  const signals: AbortSignal[] = [];
  const runner: AssemblyRunner = (signal: AbortSignal) => {
    state.calls += 1;
    signals.push(signal);
    return d.promise;
  };
  return {
    runner,
    resolve: d.resolve,
    reject: d.reject,
    signals,
    get calls() {
      return state.calls;
    },
  };
}

describe("AssemblyJobRegistry", () => {
  describe("startOrAttach: dedup / attach on a live job", () => {
    it("starts a new queued/running job for a brand new key", () => {
      const { registry } = makeRegistry();
      const { runner } = pendingRunner();

      const result = registry.startOrAttach(makeKey(), runner);

      expect(result.outcome).toBe("started");
      if (result.outcome !== "started") throw new Error("unreachable");
      expect(result.job.key).toEqual(makeKey());
      expect(["queued", "running"]).toContain(result.job.status.tag);
    });

    it("attaches to an existing live job for the same key instead of invoking a second runner", () => {
      const { registry } = makeRegistry();
      const first = pendingRunner();
      const second = pendingRunner();

      const started = registry.startOrAttach(makeKey(), first.runner);
      const attached = registry.startOrAttach(makeKey(), second.runner);

      expect(started.outcome).toBe("started");
      expect(attached.outcome).toBe("attached");
      if (started.outcome === "rejected" || attached.outcome === "rejected") {
        throw new Error("unreachable");
      }
      expect(attached.job.jobId).toBe(started.job.jobId);
      expect(first.calls).toBe(1);
      expect(second.calls).toBe(0);
    });

    it("treats distinct keys (differing in any field) as independent jobs", () => {
      const { registry } = makeRegistry();
      const a = registry.startOrAttach(makeKey({ languageId: 1 }), pendingRunner().runner);
      const b = registry.startOrAttach(makeKey({ languageId: 2 }), pendingRunner().runner);
      const c = registry.startOrAttach(
        makeKey({ mode: "single-language" }),
        pendingRunner().runner
      );

      if (a.outcome === "rejected" || b.outcome === "rejected" || c.outcome === "rejected") {
        throw new Error("unreachable");
      }
      const ids = new Set([a.job.jobId, b.job.jobId, c.job.jobId]);
      expect(ids.size).toBe(3);
    });
  });

  describe("dedup-before-cap ordering", () => {
    it("allows an attach to an existing key even when the registry is at its cap", () => {
      const { registry } = makeRegistry({ maxLiveJobs: 2 });
      const keyA = makeKey({ languageId: 1 });
      const keyB = makeKey({ languageId: 2 });

      const startedA = registry.startOrAttach(keyA, pendingRunner().runner);
      registry.startOrAttach(keyB, pendingRunner().runner);
      // Registry is now at cap (2 live jobs). Attaching to keyA must still succeed.
      const attached = registry.startOrAttach(keyA, pendingRunner().runner);

      expect(startedA.outcome).toBe("started");
      expect(attached.outcome).toBe("attached");
      if (startedA.outcome === "rejected" || attached.outcome === "rejected") {
        throw new Error("unreachable");
      }
      expect(attached.job.jobId).toBe(startedA.job.jobId);
    });

    it("rejects a genuinely new key once the cap is reached, without touching the existing jobs", () => {
      const { registry } = makeRegistry({ maxLiveJobs: 2 });
      registry.startOrAttach(makeKey({ languageId: 1 }), pendingRunner().runner);
      registry.startOrAttach(makeKey({ languageId: 2 }), pendingRunner().runner);

      const rejected = registry.startOrAttach(makeKey({ languageId: 3 }), pendingRunner().runner);

      expect(rejected.outcome).toBe("rejected");
      if (rejected.outcome !== "rejected") throw new Error("unreachable");
      expect(rejected.reason).toBe(CAP_REJECTED_REASON);
      // The rejection carries no jobId (contract §1: 429 body has no jobId / status).
      expect((rejected as { job?: unknown }).job).toBeUndefined();
    });
  });

  describe("terminal-attach / retry semantics", () => {
    it("treats a failed entry as absent: a subsequent start evicts it and begins a fresh job", async () => {
      const { registry } = makeRegistry();
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      first.reject(new Error("boom"));
      await flush();
      expect(registry.get(started.job.jobId)?.status.tag).toBe("failed");

      const second = pendingRunner();
      const retried = registry.startOrAttach(makeKey(), second.runner);

      expect(retried.outcome).toBe("started");
      if (retried.outcome === "rejected") throw new Error("unreachable");
      expect(retried.job.jobId).not.toBe(started.job.jobId);
      expect(retried.job.status.tag).not.toBe("failed");
      expect(second.calls).toBe(1);
    });

    it("treats a ready entry whose result file has been pruned as absent: starts a fresh job", async () => {
      let exists = true;
      const { registry } = makeRegistry({
        fileExists: (p: string) => exists && p === "/tmp/result.odt",
      });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      first.resolve("/tmp/result.odt");
      await flush();
      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "ready",
        resultPath: "/tmp/result.odt",
      });

      // The result file has since been pruned by the 24h docStorage cleanup.
      exists = false;

      const second = pendingRunner();
      const retried = registry.startOrAttach(makeKey(), second.runner);

      expect(retried.outcome).toBe("started");
      if (retried.outcome === "rejected") throw new Error("unreachable");
      expect(retried.job.jobId).not.toBe(started.job.jobId);
      expect(second.calls).toBe(1);
    });

    it("attaches to a still-valid ready entry (result file present) instead of restarting", async () => {
      const { registry } = makeRegistry({ fileExists: () => true });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      first.resolve("/tmp/result.odt");
      await flush();

      const second = pendingRunner();
      const attached = registry.startOrAttach(makeKey(), second.runner);

      expect(attached.outcome).toBe("attached");
      if (attached.outcome === "rejected") throw new Error("unreachable");
      expect(attached.job.jobId).toBe(started.job.jobId);
      expect(attached.job.status).toEqual({ tag: "ready", resultPath: "/tmp/result.odt" });
      expect(second.calls).toBe(0);
    });
  });

  describe("concurrency-1 serialization of the runner", () => {
    it("keeps a second distinct-key job queued (runner not invoked) until the running slot frees up", async () => {
      const { registry } = makeRegistry();
      const jobA = pendingRunner();
      const jobB = pendingRunner();

      const startedA = registry.startOrAttach(makeKey({ languageId: 1 }), jobA.runner);
      const startedB = registry.startOrAttach(makeKey({ languageId: 2 }), jobB.runner);
      if (startedA.outcome === "rejected" || startedB.outcome === "rejected") {
        throw new Error("unreachable");
      }

      // A acquired the free slot; B must wait.
      expect(registry.get(startedA.job.jobId)?.status.tag).toBe("running");
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("queued");
      expect(jobB.calls).toBe(0);

      // Freeing A's slot must let B's runner start running.
      jobA.resolve("/tmp/a.odt");
      await flush();

      expect(registry.get(startedA.job.jobId)?.status).toEqual({
        tag: "ready",
        resultPath: "/tmp/a.odt",
      });
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      expect(jobB.calls).toBe(1);
    });
  });

  describe("per-job timeout measured from run-start, not enqueue", () => {
    it("does not time out a job that is still queued behind a long-running predecessor", () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, maxLiveJobs: 10 });
      const jobA = pendingRunner();
      const jobB = pendingRunner();

      const startedA = registry.startOrAttach(makeKey({ languageId: 1 }), jobA.runner);
      clock.advance(1500); // A has been "running" well past the per-job timeout budget...
      const startedB = registry.startOrAttach(makeKey({ languageId: 2 }), jobB.runner);
      if (startedA.outcome === "rejected" || startedB.outcome === "rejected") {
        throw new Error("unreachable");
      }

      // ...but B has not even started running yet, so B must not be spuriously failed.
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("queued");
    });

    it("fails a running job once its own run-start timeout budget elapses, but holds its slot until the orphaned runner settles", async () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, maxLiveJobs: 10 });
      const jobA = pendingRunner();
      const jobB = pendingRunner();

      const startedA = registry.startOrAttach(makeKey({ languageId: 1 }), jobA.runner);
      const startedB = registry.startOrAttach(makeKey({ languageId: 2 }), jobB.runner);
      if (startedA.outcome === "rejected" || startedB.outcome === "rejected") {
        throw new Error("unreachable");
      }

      clock.advance(1001); // A's run-start timeout has now elapsed.
      const jobAStatus = registry.get(startedA.job.jobId)?.status;
      expect(jobAStatus).toEqual({ tag: "failed", reason: TIMEOUT_REASON });
      await flush();

      // A's runner is still in flight and may still own a live soffice, so
      // B must NOT be promoted into a slot A has not actually let go of.
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("queued");
      expect(jobB.calls).toBe(0);

      // Only A's real settlement releases the slot.
      jobA.reject(new Error("soffice assembly timed out"));
      await flush();

      // B's OWN timeout clock starts at slot acquisition — it must not be
      // considered timed out just because 1001ms have elapsed since ITS
      // enqueue too.
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      expect(jobB.calls).toBe(1);
      clock.advance(999);
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      clock.advance(2);
      expect(registry.get(startedB.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });
    });

    it("aborts the runner's signal when the job times out", () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000 });
      const job = pendingRunner();
      const started = registry.startOrAttach(makeKey(), job.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      expect(job.signals[0].aborted).toBe(false);

      clock.advance(1001);
      registry.get(started.job.jobId); // the timeout is lazy; this fires it.

      expect(job.signals[0].aborted).toBe(true);
    });

    it("gives each promoted job its own signal", async () => {
      const { registry } = makeRegistry();
      const jobA = pendingRunner();
      const jobB = pendingRunner();

      registry.startOrAttach(makeKey({ languageId: 1 }), jobA.runner);
      registry.startOrAttach(makeKey({ languageId: 2 }), jobB.runner);
      jobA.resolve("/tmp/a.odt");
      await flush();

      expect(jobB.calls).toBe(1);
      expect(jobB.signals[0]).not.toBe(jobA.signals[0]);
      expect(jobB.signals[0].aborted).toBe(false);
    });
  });

  describe("terminal states are immutable once a job has timed out", () => {
    /**
     * The registry timeout does not cancel the runner — there is no abort
     * channel — so a timed-out job's runner keeps going and settles later.
     * That late settlement must not be recorded.
     */
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it("keeps a timed-out job failed with TIMEOUT_REASON when its runner later resolves", async () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, ttlMs: 5000 });
      const job = pendingRunner();
      const started = registry.startOrAttach(makeKey(), job.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });

      job.resolve("/tmp/late-result.odt");
      await flush();

      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });
      expect(warn).toHaveBeenCalled();
    });

    it("keeps a timed-out job's TIMEOUT_REASON when its runner later rejects", async () => {
      // The likely production path: soffice self-kills, sofficeAssemble
      // throws, and the runner's rejection would otherwise overwrite the
      // registry's own timeout reason.
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, ttlMs: 5000 });
      const job = pendingRunner();
      const started = registry.startOrAttach(makeKey(), job.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      expect(registry.get(started.job.jobId)?.status.tag).toBe("failed");

      job.reject(new Error("soffice assembly timed out"));
      await flush();

      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });
    });

    it("does not extend the terminal TTL when the runner settles late", async () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, ttlMs: 5000 });
      const job = pendingRunner();
      const started = registry.startOrAttach(makeKey(), job.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      registry.get(started.job.jobId); // the timeout is lazy; this is what fires it.
      clock.advance(4000); // 4s into the 5s TTL...
      job.resolve("/tmp/late-result.odt"); // ...and the runner settles.
      await flush();

      // The TTL is still measured from the ORIGINAL terminalAt, so 1.1s more
      // is enough to evict. Were terminalAt refreshed, this would survive.
      clock.advance(1100);
      expect(registry.get(started.job.jobId)).toBeUndefined();
    });

    it("promotes the successor only once the timed-out predecessor's runner settles", async () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, maxLiveJobs: 10 });
      const jobA = pendingRunner();
      const jobB = pendingRunner();

      const startedA = registry.startOrAttach(makeKey({ languageId: 1 }), jobA.runner);
      const startedB = registry.startOrAttach(makeKey({ languageId: 2 }), jobB.runner);
      if (startedA.outcome === "rejected" || startedB.outcome === "rejected") {
        throw new Error("unreachable");
      }

      clock.advance(1001); // A times out — but A's runner still owns the slot.
      registry.get(startedA.job.jobId);
      await flush();
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("queued");
      expect(jobB.calls).toBe(0);

      jobA.resolve("/tmp/late-result.odt");
      await flush();

      // The late settlement releases the slot without resurrecting A.
      expect(registry.get(startedA.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      expect(jobB.calls).toBe(1);
      // And B's own run-start clock starts at ITS promotion, not A's.
      clock.advance(999);
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
    });

    it("does not start a second runner for a retried key while the timed-out predecessor is still in flight", async () => {
      // The retry path: the user hits the button again after seeing the
      // timeout. `startOrAttach` evicts the `failed` entry and starts a fresh
      // job — which must NOT run until the orphaned runner (possibly still
      // holding a live soffice) has let the slot go.
      const { registry, clock } = makeRegistry({ timeoutMs: 1000 });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });

      const retry = pendingRunner();
      const retried = registry.startOrAttach(makeKey(), retry.runner);
      if (retried.outcome === "rejected") throw new Error("unreachable");

      expect(retried.job.jobId).not.toBe(started.job.jobId);
      expect(retried.job.status.tag).toBe("queued");
      expect(retry.calls).toBe(0);

      first.reject(new Error("soffice assembly timed out"));
      await flush();

      expect(registry.get(retried.job.jobId)?.status.tag).toBe("running");
      expect(retry.calls).toBe(1);
    });

    it("releases the slot when an evicted job's runner finally settles", async () => {
      // A job can be evicted (retried, or TTL'd) while its runner is still in
      // flight — it is gone from the id map but still owns the slot.
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, ttlMs: 5000 });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      registry.get(started.job.jobId); // fire the lazy timeout
      clock.advance(5001);
      expect(registry.get(started.job.jobId)).toBeUndefined(); // TTL-evicted

      const next = pendingRunner();
      const queued = registry.startOrAttach(makeKey({ languageId: 9 }), next.runner);
      if (queued.outcome === "rejected") throw new Error("unreachable");
      expect(queued.job.status.tag).toBe("queued");
      expect(next.calls).toBe(0);

      first.resolve("/tmp/late.odt");
      await flush();

      expect(next.calls).toBe(1);
      expect(registry.get(queued.job.jobId)?.status.tag).toBe("running");
    });

    it("does not release a live runner's slot when its job is TTL-evicted", () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, ttlMs: 5000 });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");

      clock.advance(1001);
      registry.get(started.job.jobId); // fire the lazy timeout
      clock.advance(5001);
      expect(registry.get(started.job.jobId)).toBeUndefined(); // TTL-evicted

      // The evicted job's runner never settled, so nothing else may run.
      const next = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 9 }), next.runner);
      expect(next.calls).toBe(0);
    });

    it("fails the job and frees the slot when a runner throws synchronously", async () => {
      const { registry } = makeRegistry();
      const thrower: AssemblyRunner = () => {
        throw new Error("synchronous boom");
      };
      const started = registry.startOrAttach(makeKey({ languageId: 1 }), thrower);
      if (started.outcome === "rejected") throw new Error("unreachable");

      await flush();
      expect(registry.get(started.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: "synchronous boom",
      });

      const next = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 2 }), next.runner);
      expect(next.calls).toBe(1);
    });

    it("does not trip the abandon check from a runner that looks itself up synchronously", () => {
      // `assemblyController`'s runner calls `registry.getByKey` as its first
      // act, re-entering `checkSlotAbandon` before `startOrAttach` returns.
      // The slot's clock must already be set by then.
      const { registry } = makeRegistry({ abandonMs: 1 });
      let lookedUpStatus: string | undefined;
      const runner: AssemblyRunner = () => {
        lookedUpStatus = registry.getByKey(makeKey())?.status.tag;
        return new Promise<string>(() => {});
      };

      registry.startOrAttach(makeKey(), runner);

      expect(lookedUpStatus).toBe("running");
      // The slot is still held, so a second key cannot start.
      const next = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 2 }), next.runner);
      expect(next.calls).toBe(0);
    });
  });

  describe("abandonMs force-release hatch", () => {
    let error: jest.SpyInstance;
    let warn: jest.SpyInstance;
    beforeEach(() => {
      error = jest.spyOn(console, "error").mockImplementation(() => {});
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      error.mockRestore();
      warn.mockRestore();
    });

    it("force-releases and loudly logs a slot held past abandonMs", () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, abandonMs: 3000, ttlMs: 500 });
      const wedged = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 1 }), wedged.runner);

      const successor = pendingRunner();
      const queued = registry.startOrAttach(makeKey({ languageId: 2 }), successor.runner);
      if (queued.outcome === "rejected") throw new Error("unreachable");
      expect(successor.calls).toBe(0);

      // The wedged runner never settles. Assert on the SUCCESSOR — by now
      // the abandoned job may already be TTL-gone.
      clock.advance(3001);
      expect(registry.get(queued.job.jobId)?.status.tag).toBe("running");
      expect(successor.calls).toBe(1);
      expect(error).toHaveBeenCalled();
    });

    it("does not let the abandoned runner's later settlement clobber its successor", async () => {
      const { registry, clock } = makeRegistry({ timeoutMs: 1000, abandonMs: 3000, ttlMs: 500 });
      const wedged = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 1 }), wedged.runner);
      const successor = pendingRunner();
      const queued = registry.startOrAttach(makeKey({ languageId: 2 }), successor.runner);
      if (queued.outcome === "rejected") throw new Error("unreachable");

      clock.advance(3001);
      registry.get(queued.job.jobId); // fires the lazy abandon check
      expect(successor.calls).toBe(1);

      wedged.resolve("/tmp/very-late.odt");
      await flush();

      // The identity guard keeps the successor's slot intact.
      expect(registry.get(queued.job.jobId)?.status.tag).toBe("running");
      const third = pendingRunner();
      registry.startOrAttach(makeKey({ languageId: 3 }), third.runner);
      expect(third.calls).toBe(0);
    });
  });

  describe("low-memory admission guard", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it("rejects a genuinely new job when available memory is below the floor", () => {
      const { registry } = makeRegistry({
        availableMemory: () => 100 * 1024 * 1024,
        minAvailableBytes: 512 * 1024 * 1024,
      });

      const rejected = registry.startOrAttach(makeKey(), pendingRunner().runner);
      expect(rejected.outcome).toBe("rejected");
      if (rejected.outcome !== "rejected") throw new Error("unreachable");
      // Reuses the cap reason so the caller's 429 contract is unchanged.
      expect(rejected.reason).toBe(CAP_REJECTED_REASON);
      expect(warn).toHaveBeenCalled();
    });

    it("still attaches to an existing live job under memory pressure", () => {
      const memory = { bytes: 4096 * 1024 * 1024 };
      const { registry } = makeRegistry({
        availableMemory: () => memory.bytes,
        minAvailableBytes: 512 * 1024 * 1024,
      });
      const started = registry.startOrAttach(makeKey(), pendingRunner().runner);
      expect(started.outcome).toBe("started");

      memory.bytes = 100 * 1024 * 1024;
      const attached = registry.startOrAttach(makeKey(), pendingRunner().runner);
      expect(attached.outcome).toBe("attached");
    });

    it("is inert when the memory probe is absent or cannot read a value", () => {
      const { registry } = makeRegistry({ minAvailableBytes: 512 * 1024 * 1024 });
      expect(registry.startOrAttach(makeKey(), pendingRunner().runner).outcome).toBe("started");

      const { registry: withUnreadableProbe } = makeRegistry({
        availableMemory: () => undefined,
        minAvailableBytes: 512 * 1024 * 1024,
      });
      expect(withUnreadableProbe.startOrAttach(makeKey(), pendingRunner().runner).outcome).toBe(
        "started"
      );
    });
  });

  describe("queue-depth cap", () => {
    it("rejects a new key once maxLiveJobs live (queued+running) jobs already exist", () => {
      const { registry } = makeRegistry({ maxLiveJobs: 1 });
      const first = registry.startOrAttach(makeKey({ languageId: 1 }), pendingRunner().runner);
      expect(first.outcome).toBe("started");

      const rejected = registry.startOrAttach(makeKey({ languageId: 2 }), pendingRunner().runner);
      expect(rejected.outcome).toBe("rejected");
      if (rejected.outcome !== "rejected") throw new Error("unreachable");
      expect(rejected.reason).toBe(CAP_REJECTED_REASON);
    });
  });

  describe("TTL eviction of terminal entries", () => {
    it("evicts a ready entry once its TTL elapses, even though its result file is still present", async () => {
      const { registry, clock } = makeRegistry({ ttlMs: 5000, fileExists: () => true });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");
      first.resolve("/tmp/result.odt");
      await flush();
      expect(registry.getByKey(makeKey())?.status.tag).toBe("ready");

      clock.advance(5001);

      expect(registry.getByKey(makeKey())).toBeUndefined();
      expect(registry.get(started.job.jobId)).toBeUndefined();
    });

    it("evicts a failed entry once its TTL elapses", async () => {
      const { registry, clock } = makeRegistry({ ttlMs: 5000 });
      const first = pendingRunner();
      const started = registry.startOrAttach(makeKey(), first.runner);
      if (started.outcome === "rejected") throw new Error("unreachable");
      first.reject(new Error("boom"));
      await flush();
      expect(registry.getByKey(makeKey())?.status.tag).toBe("failed");

      clock.advance(5001);

      expect(registry.getByKey(makeKey())).toBeUndefined();
    });
  });

  describe("lookups", () => {
    it("get() returns undefined for an unknown jobId", () => {
      const { registry } = makeRegistry();
      expect(registry.get("no-such-job")).toBeUndefined();
    });

    it("getByKey() returns undefined when no job exists for the key", () => {
      const { registry } = makeRegistry();
      expect(registry.getByKey(makeKey())).toBeUndefined();
    });
  });
});
