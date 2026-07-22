/// <reference types="jest" />

jest.mock("child_process", () => ({ spawn: jest.fn() }));

import { EventEmitter } from "events";
import { spawn } from "child_process";
import {
  sofficeAssemble,
  profileDirFor,
  DEFAULT_TIMEOUT_MS,
  SofficeAssembleTimeoutError,
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

test("profileDirFor derives the per-job profile path used by the run-step args", () => {
  expect(profileDirFor("/docs/assembly-work", "job-xyz")).toBe(
    "/docs/assembly-work/job-xyz/profile"
  );
});

test("DEFAULT_TIMEOUT_MS is a positive multiple of the ~40s observed baseline", () => {
  expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(40_000);
});
