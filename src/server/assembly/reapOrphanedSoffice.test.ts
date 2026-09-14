/// <reference types="jest" />

import fs from "fs";
import os from "os";
import path from "path";
import {
  matchesAssemblyJob,
  parseProcessGroupId,
  reapOrphanedSoffice,
} from "./reapOrphanedSoffice";

/**
 * `/proc/<pid>/cmdline` is NUL-separated, so the fixtures carry real NULs —
 * a space-separated fixture would validate a shape production never sees.
 */
function cmdline(...args: string[]): string {
  return args.join("\0") + "\0";
}

const JOB_ID = "b2f1c0de-1111-2222-3333-444455556666";

function sofficeRunCmdline(jobId: string): string {
  return cmdline(
    "/usr/lib/libreoffice/program/soffice.bin",
    "--headless",
    "--norestore",
    "--nologo",
    `-env:UserInstallation=file:///srv/app/docs/assembly-work/${jobId}/profile`,
    "macro:///Standard.Module1.Assemble"
  );
}

describe("matchesAssemblyJob", () => {
  it("matches a soffice run-step command line carrying the job's own profile arg", () => {
    expect(matchesAssemblyJob(sofficeRunCmdline(JOB_ID), JOB_ID)).toBe(true);
  });

  it("matches the warm step too (same per-job profile arg)", () => {
    const warm = cmdline(
      "/usr/lib/libreoffice/program/oosplash",
      "--headless",
      "--norestore",
      "--nologo",
      `-env:UserInstallation=file:///srv/app/docs/assembly-work/${JOB_ID}/profile`,
      "--convert-to",
      "odt",
      "/srv/app/docs/assembly-work/warm.txt"
    );
    expect(matchesAssemblyJob(warm, JOB_ID)).toBe(true);
  });

  it("does not match a soffice belonging to a different job", () => {
    const other = "99999999-aaaa-bbbb-cccc-dddddddddddd";
    expect(matchesAssemblyJob(sofficeRunCmdline(other), JOB_ID)).toBe(false);
  });

  it("does not match a non-soffice process that merely mentions the job id", () => {
    const tar = cmdline("/bin/tar", "-czf", `/backups/${JOB_ID}.tar.gz`, "/srv/app/docs");
    expect(matchesAssemblyJob(tar, JOB_ID)).toBe(false);
  });

  it("does not match a soffice without the per-job profile argument", () => {
    const unrelated = cmdline(
      "/usr/bin/soffice",
      "--headless",
      "--convert-to",
      "pdf",
      "/tmp/a.odt"
    );
    expect(matchesAssemblyJob(unrelated, JOB_ID)).toBe(false);
  });

  it("does not match an unreadable or empty command line", () => {
    expect(matchesAssemblyJob("", JOB_ID)).toBe(false);
    expect(matchesAssemblyJob("\0\0", JOB_ID)).toBe(false);
  });

  it("never matches on an empty job id, which would otherwise match everything", () => {
    expect(matchesAssemblyJob(sofficeRunCmdline(JOB_ID), "")).toBe(false);
  });
});

describe("parseProcessGroupId", () => {
  it("reads pgrp from a normal stat line", () => {
    expect(parseProcessGroupId("4242 (soffice.bin) S 1 4200 4200 0 -1 4194560 1234")).toBe(4200);
  });

  it("survives a comm containing spaces and parentheses", () => {
    // Parsing starts after the LAST ')', which is why this works.
    expect(parseProcessGroupId("77 (weird (name) here) S 1 55 55 0 -1 0")).toBe(55);
  });

  it("returns undefined for unparseable contents", () => {
    expect(parseProcessGroupId("")).toBeUndefined();
    expect(parseProcessGroupId("no parens here at all")).toBeUndefined();
    expect(parseProcessGroupId("1 (x) S 1 notanumber")).toBeUndefined();
  });
});

describe("reapOrphanedSoffice", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reapOrphanedSoffice-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("kills nothing and does not throw when the work root is absent or empty", () => {
    const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);

    expect(() => reapOrphanedSoffice(path.join(tmpRoot, "nope"))).not.toThrow();
    expect(() => reapOrphanedSoffice(tmpRoot)).not.toThrow();
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  it("is inert when /proc cannot be read, even with job dirs present", () => {
    // This is the macOS-dev path: identity is unverifiable, so nothing is
    // killed rather than falling back to a weaker signal. On Linux the scan
    // runs but matches nothing, so the assertion holds there too.
    const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
    fs.mkdirSync(path.join(tmpRoot, JOB_ID, "profile"), { recursive: true });

    reapOrphanedSoffice(tmpRoot);

    expect(killSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });
});
