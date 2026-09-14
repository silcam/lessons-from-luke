/// <reference types="jest" />

import fs from "fs";
import os from "os";
import path from "path";
import { sweepAssemblyWork } from "./sweepAssemblyWork";

describe("sweepAssemblyWork", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sweepAssemblyWork-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("removes pre-existing per-job subdirs under the work root", () => {
    const workRoot = path.join(tmpRoot, "assembly-work");
    const orphanA = path.join(workRoot, "job-a");
    const orphanB = path.join(workRoot, "job-b");
    fs.mkdirSync(orphanA, { recursive: true });
    fs.mkdirSync(orphanB, { recursive: true });
    fs.writeFileSync(path.join(orphanA, "profile-file.txt"), "leftover");

    sweepAssemblyWork(workRoot);

    expect(fs.existsSync(orphanA)).toBe(false);
    expect(fs.existsSync(orphanB)).toBe(false);
    // The root itself survives (it's the dedicated, known root new jobs write under).
    expect(fs.existsSync(workRoot)).toBe(true);
  });

  it("does not throw if the work root doesn't exist yet", () => {
    const workRoot = path.join(tmpRoot, "does-not-exist", "assembly-work");
    expect(() => sweepAssemblyWork(workRoot)).not.toThrow();
  });
});
