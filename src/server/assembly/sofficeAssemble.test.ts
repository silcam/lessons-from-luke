/// <reference types="jest" />

jest.mock("child_process", () => ({ spawn: jest.fn() }));

import { EventEmitter } from "events";
import { spawn } from "child_process";
import {
  sofficeAssemble,
  profileDirFor,
  DEFAULT_TIMEOUT_MS,
  SofficeAssembleTimeoutError,
  SofficeAssembleAbortedError,
} from "./sofficeAssemble";

/** Minimal fake `ChildProcess`: an EventEmitter with a `pid` and no-op `stdout`/`stderr`. */
class FakeChildProcess extends EventEmitter {
  pid: number;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

const spawnMock = spawn as unknown as jest.Mock;

afterEach(() => {
  spawnMock.mockReset();
  jest.useRealTimers();
});

test("constructs the run-step soffice invocation with the macro URI and per-job profile/env vars", async () => {
  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(222);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-abc",
    files: ["/docs/assembly-work/job-abc/00.odt", "/docs/assembly-work/job-abc/01.odt"],
    outputPath: "/docs/assembly-work/job-abc/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });

  // Let the warm step "succeed" so the flow proceeds to the run step.
  queueMicrotask(() => warmChild.emit("close", 0));
  queueMicrotask(() => runChild.emit("close", 0));

  await promise;

  const runCall = spawnMock.mock.calls[1];
  expect(runCall[0]).toBe("soffice");
  const runArgs: string[] = runCall[1];
  expect(runArgs).toEqual(
    expect.arrayContaining([
      "--headless",
      "--norestore",
      "--nologo",
      expect.stringContaining("-env:UserInstallation=file://"),
      expect.stringContaining(profileDirFor("/docs/assembly-work", "job-abc")),
      "macro:///Standard.Module1.Assemble",
    ])
  );

  const runOpts = runCall[2];
  expect(runOpts.env.SPIKE_FILES).toBe(
    "/docs/assembly-work/job-abc/00.odt\n/docs/assembly-work/job-abc/01.odt"
  );
  expect(runOpts.env.SPIKE_OUT_URL).toContain("file://");
  expect(runOpts.env.SPIKE_OUT_URL).toContain("/docs/assembly-work/job-abc/out.odt");
});

test("sets SPIKE_TEMPLATE_URL on the run child's env from the templatePath option", async () => {
  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(222);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-template",
    files: ["/docs/assembly-work/job-template/00.odt"],
    outputPath: "/docs/assembly-work/job-template/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });

  queueMicrotask(() => warmChild.emit("close", 0));
  queueMicrotask(() => runChild.emit("close", 0));

  await promise;

  const runOpts = spawnMock.mock.calls[1][2];
  expect(runOpts.env.SPIKE_TEMPLATE_URL).toBe("file:///docs/templates/quarter-styles.ott");
});

test("spawns every soffice process detached in its own process group", async () => {
  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(222);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-detach",
    files: ["/docs/assembly-work/job-detach/00.odt"],
    outputPath: "/docs/assembly-work/job-detach/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });

  queueMicrotask(() => warmChild.emit("close", 0));
  queueMicrotask(() => runChild.emit("close", 0));

  await promise;

  expect(spawnMock).toHaveBeenCalledTimes(2);
  for (const call of spawnMock.mock.calls) {
    const opts = call[2];
    expect(opts.detached).toBe(true);
  }
});

test("kills the whole process group (not a lone PID) when the hard timeout fires", async () => {
  jest.useFakeTimers();
  const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);

  const runChild = new FakeChildProcess(333);
  const warmChild = new FakeChildProcess(111);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-timeout",
    files: ["/docs/assembly-work/job-timeout/00.odt"],
    outputPath: "/docs/assembly-work/job-timeout/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
    timeoutMs: 5_000,
  });
  promise.catch(() => {
    // Assertions below observe the rejection directly.
  });

  queueMicrotask(() => warmChild.emit("close", 0));
  await Promise.resolve();
  await Promise.resolve();

  jest.advanceTimersByTime(5_000);

  await expect(promise).rejects.toBeInstanceOf(SofficeAssembleTimeoutError);

  // A group kill targets the NEGATIVE pid (the process group), never the
  // lone child PID directly.
  expect(killSpy).toHaveBeenCalledWith(-333, expect.any(String));
  expect(killSpy).not.toHaveBeenCalledWith(333, expect.any(String));

  killSpy.mockRestore();
});

test("still rejects with the timeout error when the process-group kill throws ESRCH", async () => {
  // The group commonly exits between the timer firing and the kill landing
  // (oosplash forks soffice.bin), so `process.kill` throws ESRCH. A throw
  // escaping the timer callback would leave this promise unsettled forever —
  // and the registry now holds its concurrency-1 slot until it settles.
  jest.useFakeTimers();
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  const killSpy = jest.spyOn(process, "kill").mockImplementation(() => {
    const err: NodeJS.ErrnoException = new Error("kill ESRCH");
    err.code = "ESRCH";
    throw err;
  });

  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(444);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-esrch",
    files: ["/docs/assembly-work/job-esrch/00.odt"],
    outputPath: "/docs/assembly-work/job-esrch/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
    timeoutMs: 5_000,
  });
  promise.catch(() => {
    // Assertions below observe the rejection directly.
  });

  queueMicrotask(() => warmChild.emit("close", 0));
  await Promise.resolve();
  await Promise.resolve();

  jest.advanceTimersByTime(5_000);

  await expect(promise).rejects.toBeInstanceOf(SofficeAssembleTimeoutError);
  expect(warnSpy).toHaveBeenCalled();

  killSpy.mockRestore();
  warnSpy.mockRestore();
});

test("aborts mid-run: kills the process group and rejects with the aborted error", async () => {
  const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
  const controller = new AbortController();

  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(555);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-abort",
    files: ["/docs/assembly-work/job-abort/00.odt"],
    outputPath: "/docs/assembly-work/job-abort/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
    signal: controller.signal,
  });
  promise.catch(() => {
    // Assertions below observe the rejection directly.
  });

  queueMicrotask(() => warmChild.emit("close", 0));
  await Promise.resolve();
  await Promise.resolve();

  controller.abort();

  await expect(promise).rejects.toBeInstanceOf(SofficeAssembleAbortedError);
  expect(killSpy).toHaveBeenCalledWith(-555, expect.any(String));

  killSpy.mockRestore();
});

test("rejects without spawning anything when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    sofficeAssemble({
      jobId: "job-pre-abort",
      files: ["/docs/assembly-work/job-pre-abort/00.odt"],
      outputPath: "/docs/assembly-work/job-pre-abort/out.odt",
      workRoot: "/docs/assembly-work",
      templatePath: "/docs/templates/quarter-styles.ott",
      signal: controller.signal,
    })
  ).rejects.toBeInstanceOf(SofficeAssembleAbortedError);

  expect(spawnMock).not.toHaveBeenCalled();
});

test("derives a distinct per-job profile path under the dedicated assembly-work root", async () => {
  const warmChildA = new FakeChildProcess(1);
  const runChildA = new FakeChildProcess(2);
  const warmChildB = new FakeChildProcess(3);
  const runChildB = new FakeChildProcess(4);
  spawnMock
    .mockImplementationOnce(() => warmChildA)
    .mockImplementationOnce(() => runChildA)
    .mockImplementationOnce(() => warmChildB)
    .mockImplementationOnce(() => runChildB);

  const promiseA = sofficeAssemble({
    jobId: "job-A",
    files: ["/docs/assembly-work/job-A/00.odt"],
    outputPath: "/docs/assembly-work/job-A/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });
  queueMicrotask(() => warmChildA.emit("close", 0));
  queueMicrotask(() => runChildA.emit("close", 0));
  await promiseA;

  const promiseB = sofficeAssemble({
    jobId: "job-B",
    files: ["/docs/assembly-work/job-B/00.odt"],
    outputPath: "/docs/assembly-work/job-B/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });
  queueMicrotask(() => warmChildB.emit("close", 0));
  queueMicrotask(() => runChildB.emit("close", 0));
  await promiseB;

  const runArgsA: string[] = spawnMock.mock.calls[1][1];
  const runArgsB: string[] = spawnMock.mock.calls[3][1];
  const profileArgA = runArgsA.find((arg) => arg.startsWith("-env:UserInstallation="));
  const profileArgB = runArgsB.find((arg) => arg.startsWith("-env:UserInstallation="));

  expect(profileArgA).toContain(profileDirFor("/docs/assembly-work", "job-A"));
  expect(profileArgB).toContain(profileDirFor("/docs/assembly-work", "job-B"));
  expect(profileArgA).not.toEqual(profileArgB);
});

test("rejects on a non-zero warm exit without ever spawning the run step", async () => {
  // The warm step is what builds the profile's `user/basic` tree, so a bad
  // warm exit means there is nothing usable to inject the macro into. The
  // "run step was never spawned" assertion is the one that pins the
  // behaviour: rejecting alone would also pass if we spawned the merge and
  // abandoned it, leaving a detached `soffice` behind.
  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(222);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-warm-fail",
    files: ["/docs/assembly-work/job-warm-fail/00.odt"],
    outputPath: "/docs/assembly-work/job-warm-fail/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });

  queueMicrotask(() => warmChild.emit("close", 1));

  await expect(promise).rejects.toThrow(/warm step exited with code 1/);
  expect(spawnMock).toHaveBeenCalledTimes(1);
});

test("reports a signal-killed warm step as killed, not as 'code null'", async () => {
  // `close` carries `(null, "SIGKILL")` when the child died to a signal — an
  // OOM kill or an external `kill` on the group. "exited with code null"
  // would read as a bug in this wrapper rather than what happened.
  const warmChild = new FakeChildProcess(111);
  const runChild = new FakeChildProcess(222);
  spawnMock.mockImplementationOnce(() => warmChild).mockImplementationOnce(() => runChild);

  const promise = sofficeAssemble({
    jobId: "job-warm-killed",
    files: ["/docs/assembly-work/job-warm-killed/00.odt"],
    outputPath: "/docs/assembly-work/job-warm-killed/out.odt",
    workRoot: "/docs/assembly-work",
    templatePath: "/docs/templates/quarter-styles.ott",
  });

  queueMicrotask(() => warmChild.emit("close", null, "SIGKILL"));

  await expect(promise).rejects.toThrow(/warm step was killed by SIGKILL/);
  expect(spawnMock).toHaveBeenCalledTimes(1);
});

test("profileDirFor derives the per-job profile path used by the run-step args", () => {
  expect(profileDirFor("/docs/assembly-work", "job-xyz")).toBe(
    "/docs/assembly-work/job-xyz/profile"
  );
});

test("DEFAULT_TIMEOUT_MS leaves generous headroom over the ~15s measured baseline", () => {
  // 15,259ms measured for a 14-insert merge on an M3 against real fixtures
  // (Luke series 2). The deployed 2-vCPU box is several times slower, so the
  // ceiling has to be a large multiple, not a small one.
  expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * 15_000);
});
