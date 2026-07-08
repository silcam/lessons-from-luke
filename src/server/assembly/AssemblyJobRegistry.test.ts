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
} {
  const d = deferred<string>();
  const state = { calls: 0 };
  const runner: AssemblyRunner = () => {
    state.calls += 1;
    return d.promise;
  };
  return {
    runner,
    resolve: d.resolve,
    reject: d.reject,
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

    it("fails a running job once its own run-start timeout budget elapses, then starts the next queued job's own clock at that moment", async () => {
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

      // B's slot is freed by A's timeout; B's OWN timeout clock starts now, at
      // slot-acquisition time — it must not immediately be considered timed
      // out just because 1001ms have elapsed since ITS enqueue too.
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      clock.advance(999);
      expect(registry.get(startedB.job.jobId)?.status.tag).toBe("running");
      clock.advance(2);
      expect(registry.get(startedB.job.jobId)?.status).toEqual({
        tag: "failed",
        reason: TIMEOUT_REASON,
      });
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
