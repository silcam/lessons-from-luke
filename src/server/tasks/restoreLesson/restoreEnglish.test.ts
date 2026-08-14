/// <reference types="jest" />

/**
 * Unit tests for restoreEnglish.ts (task 5.7.2): the copy shim (I15), the
 * known-bad hard denial and byte/symlink verification preconditions (I16,
 * I23), source-equals-destination (I15), the upload/relink dispatch, and
 * the post-upload mode/owner repair-then-abort sequence (I18, I21). All
 * fixtures/temp dirs — no real database, no real `uploadEnglishDoc`/
 * `webifyLesson` (both are injected via `RestoreEnglishDeps`).
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md
 * §restore-english, specs/018-lesson1-translation-restore/plan.md
 * §The restore-source document must survive being used,
 * §The verified document and the used document must be the same bytes (I23),
 * §Known-bad document guard, §Aborting after the upload has already happened.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { RestoreLessonAbortError } from "./identity";
import { computeDiagnosisChecksum, computeReportChecksum } from "./report";
import {
  computeDestinationDocPath,
  computeDestinationPreviewPath,
  copyShimUploadedFile,
  FileModeOps,
  hashFile,
  isInsideDocsRoot,
  ModeOwner,
  repairAndVerifyFileModes,
  RestoreEnglishDeps,
  restoreEnglish,
  RestoredLessonResult,
  verifyMasterDocument,
} from "./restoreEnglish";
import { AffectedLesson, DiagnosisReport, MasterDocumentCandidate } from "./types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "restore-english-test-"));
}

function writeFile(dir: string, name: string, content: string): string {
  const filepath = path.join(dir, name);
  fs.writeFileSync(filepath, content);
  return filepath;
}

function candidateFor(filepath: string, overrides: Partial<MasterDocumentCandidate> = {}) {
  const { sha256, sizeBytes } = hashFile(filepath);
  const candidate: MasterDocumentCandidate = {
    filepath,
    version: 157,
    sha256,
    sizeBytes,
    englishTextSetMatchesSnapshot: true,
    isKnownBadUpload: false,
    missingFromDocument: [],
    extraInDocument: [],
    ...overrides,
  };
  return candidate;
}

function baseAffectedLesson(
  candidateMasterDocuments: MasterDocumentCandidate[] = []
): AffectedLesson {
  return {
    book: "Luke",
    series: 1,
    lesson: 1,
    productionLessonId: 42,
    snapshotLessonId: 42,
    productionVersion: 158,
    snapshotVersion: 157,
    bumpCount: 1,
    mappingStrategy: "snapshotAnchored",
    knownBadVersions: [158],
    expectedBumpCount: 1,
    candidateMasterDocuments,
  };
}

function baseReport(affectedLesson: AffectedLesson): DiagnosisReport {
  const partial: Omit<DiagnosisReport, "diagnosisChecksum" | "reportChecksum"> = {
    diagnosisId: "11111111-1111-1111-1111-111111111111",
    generatedAt: "2026-08-13T00:00:00.000Z",
    toolVersion: "1.0.0",
    mode: "diagnose",
    identity: {
      productionMarkerPresent: true,
      snapshotConfirmationToken: "confirmed-by-operator",
      productionLessonVersion: affectedLesson.productionVersion,
      snapshotLessonVersion: affectedLesson.snapshotVersion,
      snapshotIsOlder: true,
    },
    productionFingerprint: {
      databaseName: "lessons-from-luke",
      lessonCount: 1,
      maxMasterId: 1,
      maxLessonStringId: 1,
    },
    affectedLessons: [affectedLesson],
    languageIdentityChecks: [],
    mappings: [],
    findings: [],
    perLanguageCounts: [],
    legacyLessonStringRowCounts: { production: 0, snapshot: 0 },
    blastRadius: { sharedMasterIds: 0, lessons: [] },
    plannedWrites: [],
    duplicateRowsBaseline: [],
    conflicts: [],
  };
  const diagnosisChecksum = computeDiagnosisChecksum(partial as DiagnosisReport);
  const withDiagnosisChecksum = { ...partial, diagnosisChecksum, reportChecksum: "" };
  const reportChecksum = computeReportChecksum(withDiagnosisChecksum as DiagnosisReport);
  return { ...withDiagnosisChecksum, reportChecksum } as DiagnosisReport;
}

function makeDeps(overrides: Partial<RestoreEnglishDeps> = {}): RestoreEnglishDeps {
  return {
    upload: jest.fn(async () => ({ lessonId: 42, version: 159 }) as RestoredLessonResult),
    relink: jest.fn(async () => ({ lessonId: 42, version: 159 }) as RestoredLessonResult),
    webify: jest.fn(async () => undefined),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// copyShimUploadedFile (I15)
// ─────────────────────────────────────────────────────────────────────────

describe("copyShimUploadedFile", () => {
  test("mv copies the source, leaving it intact and byte-identical", async () => {
    const dir = tmpDir();
    const source = writeFile(dir, "source.odt", "the only recovery source");
    const dest = path.join(dir, "dest.odt");

    const shim = copyShimUploadedFile(source);
    await shim.mv(dest);

    expect(fs.existsSync(source)).toBe(true);
    expect(fs.readFileSync(source, "utf8")).toBe("the only recovery source");
    expect(fs.readFileSync(dest, "utf8")).toBe("the only recovery source");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// isInsideDocsRoot (I23 symlink guard)
// ─────────────────────────────────────────────────────────────────────────

describe("isInsideDocsRoot", () => {
  test("true for a file directly inside the root", () => {
    const dir = tmpDir();
    const file = writeFile(dir, "doc.odt", "x");
    expect(isInsideDocsRoot(file, dir)).toBe(true);
  });

  test("false for a symlink pointing outside the root", () => {
    const root = tmpDir();
    const outside = tmpDir();
    const outsideFile = writeFile(outside, "elsewhere.odt", "x");
    const link = path.join(root, "linked.odt");
    fs.symlinkSync(outsideFile, link);
    expect(isInsideDocsRoot(link, root)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// verifyMasterDocument: known-bad hard denial, verification, hash, symlink,
// source-equals-destination
// ─────────────────────────────────────────────────────────────────────────

describe("verifyMasterDocument", () => {
  test("hard-denies a known-bad candidate with no override", () => {
    const dir = tmpDir();
    const coverFile = writeFile(dir, "Luke-1-01v158.odt", "cover-page content");
    const candidate = candidateFor(coverFile, { version: 158, isKnownBadUpload: true });
    const affectedLesson = baseAffectedLesson([candidate]);
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);

    expect(() =>
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: coverFile,
        docsRoot: dir,
        destinationPath,
      })
    ).toThrow(RestoreLessonAbortError);

    try {
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: coverFile,
        docsRoot: dir,
        destinationPath,
      });
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as RestoreLessonAbortError).exitCode).toBe(22);
      expect((err as RestoreLessonAbortError).message).toMatch(/known-bad/i);
    }
  });

  test("rejects a document not present as a verified candidate", () => {
    const dir = tmpDir();
    const unrelated = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const affectedLesson = baseAffectedLesson([]); // no candidates recorded
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);

    expect(() =>
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: unrelated,
        docsRoot: dir,
        destinationPath,
      })
    ).toThrow(RestoreLessonAbortError);
  });

  test("aborts (22) when the file's bytes no longer match the diagnose-time hash", () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    // Mutate the file after the candidate was hashed — simulates I23's threat.
    fs.writeFileSync(doc, "someone replaced this file");
    const affectedLesson = baseAffectedLesson([candidate]);
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);

    try {
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: doc,
        docsRoot: dir,
        destinationPath,
      });
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as RestoreLessonAbortError).exitCode).toBe(22);
    }
  });

  test("aborts (22) when the candidate resolves outside the docs root via a symlink", () => {
    const root = tmpDir();
    const outside = tmpDir();
    const outsideFile = writeFile(outside, "Luke-1-01v157.odt", "pre-incident content");
    const link = path.join(root, "Luke-1-01v157.odt");
    fs.symlinkSync(outsideFile, link);
    const candidate = candidateFor(link, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const destinationPath = computeDestinationDocPath(root, affectedLesson, 159);

    try {
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: link,
        docsRoot: root,
        destinationPath,
      });
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as RestoreLessonAbortError).exitCode).toBe(22);
    }
  });

  test("aborts (22) when the source resolves to the same path as the destination", () => {
    const dir = tmpDir();
    const affectedLesson = baseAffectedLesson([]);
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);
    fs.writeFileSync(destinationPath, "content");
    const candidate = candidateFor(destinationPath, { version: 159, isKnownBadUpload: false });
    affectedLesson.candidateMasterDocuments = [candidate];

    try {
      verifyMasterDocument({
        affectedLesson,
        masterDocumentPath: destinationPath,
        docsRoot: dir,
        destinationPath,
      });
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as RestoreLessonAbortError).exitCode).toBe(22);
    }
  });

  test("passes for a verified, unchanged, in-root candidate that differs from the destination", () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);

    const verified = verifyMasterDocument({
      affectedLesson,
      masterDocumentPath: doc,
      docsRoot: dir,
      destinationPath,
    });
    expect(verified).toEqual(candidate);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// repairAndVerifyFileModes (I18, I21)
// ─────────────────────────────────────────────────────────────────────────

describe("repairAndVerifyFileModes", () => {
  function fakeOps(
    store: Map<string, ModeOwner>,
    opts: { chownFails?: boolean } = {}
  ): FileModeOps {
    return {
      stat: (filepath) => {
        const entry = store.get(filepath);
        if (!entry) throw new Error(`no fake stat for ${filepath}`);
        return entry;
      },
      chmod: (filepath, mode) => {
        const entry = store.get(filepath)!;
        store.set(filepath, { ...entry, mode });
      },
      chown: (filepath, uid, gid) => {
        if (opts.chownFails) throw new Error("EPERM: operation not permitted");
        const entry = store.get(filepath)!;
        store.set(filepath, { ...entry, uid, gid });
      },
    };
  }

  test("does nothing when the target already matches the sibling", () => {
    const store = new Map<string, ModeOwner>([
      ["/docs/sibling.odt", { mode: 0o644, uid: 1000, gid: 1000 }],
      ["/docs/new.odt", { mode: 0o644, uid: 1000, gid: 1000 }],
    ]);
    expect(() =>
      repairAndVerifyFileModes(["/docs/new.odt"], "/docs/sibling.odt", fakeOps(store))
    ).not.toThrow();
  });

  test("repairs a mode mismatch via chmod and does not abort", () => {
    const store = new Map<string, ModeOwner>([
      ["/docs/sibling.odt", { mode: 0o644, uid: 1000, gid: 1000 }],
      ["/docs/new.odt", { mode: 0o600, uid: 1000, gid: 1000 }],
    ]);
    expect(() =>
      repairAndVerifyFileModes(["/docs/new.odt"], "/docs/sibling.odt", fakeOps(store))
    ).not.toThrow();
    expect(store.get("/docs/new.odt")).toEqual({ mode: 0o644, uid: 1000, gid: 1000 });
  });

  test("attempts repair, and when it still doesn't match, aborts (31) naming the files, actual vs expected modes, and the fix command", () => {
    const store = new Map<string, ModeOwner>([
      ["/docs/sibling.odt", { mode: 0o644, uid: 1000, gid: 2000 }],
      ["/docs/new.odt", { mode: 0o600, uid: 1000, gid: 1000 }],
    ]);
    // chown fails (as it would non-root against a foreign gid) so the
    // owner mismatch survives the repair attempt — mode is still fixed.
    const ops = fakeOps(store, { chownFails: true });

    try {
      repairAndVerifyFileModes(["/docs/new.odt"], "/docs/sibling.odt", ops);
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      const abortErr = err as RestoreLessonAbortError;
      expect(abortErr.exitCode).toBe(31);
      expect(abortErr.message).toMatch(/Lesson 1 may currently be unreadable/);
      expect(abortErr.message).toContain("/docs/new.odt");
      expect(abortErr.message).toMatch(
        /chmod 644 \/docs\/new\.odt && chown 1000:2000 \/docs\/new\.odt/
      );
    }
    // The mode was still repaired even though owner repair failed.
    expect(store.get("/docs/new.odt")!.mode).toBe(0o644);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// restoreEnglish(): upload path, force-relink path, copy-not-rename,
// englishRestore recording
// ─────────────────────────────────────────────────────────────────────────

describe("restoreEnglish", () => {
  test("uploads the verified candidate via the copy shim, calls webify, and records englishRestore", async () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const report = baseReport(affectedLesson);
    const deps = makeDeps();

    const result = await restoreEnglish({
      report,
      masterDocumentPath: doc,
      forceRelink: false,
      dumpPath: "/dumps/pre-restore.dump",
      docsRoot: dir,
      deps,
    });

    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.relink).not.toHaveBeenCalled();
    expect(deps.webify).toHaveBeenCalledTimes(1);

    // Copy, never move: the source document survives being used.
    expect(fs.existsSync(doc)).toBe(true);
    expect(fs.readFileSync(doc, "utf8")).toBe("pre-incident content");

    expect(result.englishRestore).toBeTruthy();
    expect(result.englishRestore!.method).toBe("upload");
    expect(result.englishRestore!.masterDocumentPath).toBe(doc);
    expect(result.englishRestore!.masterDocumentSha256).toBe(candidate.sha256);
    expect(result.englishRestore!.newLessonVersion).toBe(159);
    expect(result.englishRestore!.dumpPath).toBe("/dumps/pre-restore.dump");
    expect(result.englishRestore!.carriedFromDiagnosisId).toBeNull();
    expect(result.mode).toBe("restore-english");
    expect(result.reportChecksum).not.toBe(report.reportChecksum);
  });

  test("the uploaded file handed to deps.upload copies (not moves) when driven end to end", async () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const report = baseReport(affectedLesson);

    let capturedFile: { mv(dest: string): Promise<void> } | undefined;
    const deps = makeDeps({
      upload: jest.fn(async (file) => {
        capturedFile = file;
        const dest = path.join(dir, "actually-uploaded.odt");
        await file.mv(dest);
        return { lessonId: 42, version: 159 };
      }),
    });

    await restoreEnglish({
      report,
      masterDocumentPath: doc,
      forceRelink: false,
      dumpPath: "/dumps/pre-restore.dump",
      docsRoot: dir,
      deps,
    });

    expect(capturedFile).toBeTruthy();
    expect(fs.existsSync(doc)).toBe(true);
    expect(fs.readFileSync(doc, "utf8")).toBe("pre-incident content");
    expect(fs.readFileSync(path.join(dir, "actually-uploaded.odt"), "utf8")).toBe(
      "pre-incident content"
    );
  });

  test("--force-relink skips the upload path but still calls webify, and uses no document", async () => {
    const dir = tmpDir();
    const affectedLesson = baseAffectedLesson([]); // no candidates needed for relink
    const report = baseReport(affectedLesson);
    const deps = makeDeps();

    const result = await restoreEnglish({
      report,
      masterDocumentPath: null,
      forceRelink: true,
      dumpPath: "/dumps/pre-restore.dump",
      docsRoot: dir,
      deps,
    });

    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.relink).toHaveBeenCalledTimes(1);
    expect(deps.relink).toHaveBeenCalledWith(report);
    expect(deps.webify).toHaveBeenCalledTimes(1);

    expect(result.englishRestore).toBeTruthy();
    expect(result.englishRestore!.method).toBe("relink");
    expect(result.englishRestore!.masterDocumentPath).toBeNull();
    expect(result.englishRestore!.masterDocumentSha256).toBeNull();
    expect(result.englishRestore!.newLessonVersion).toBe(159);
  });

  test("--force-relink does not authorise an unverified/known-bad document: a known-bad --master-document is still hard-denied", async () => {
    const dir = tmpDir();
    const coverFile = writeFile(dir, "Luke-1-01v158.odt", "cover-page content");
    const candidate = candidateFor(coverFile, { version: 158, isKnownBadUpload: true });
    const affectedLesson = baseAffectedLesson([candidate]);
    const report = baseReport(affectedLesson);
    const deps = makeDeps();

    // force-relink ignores masterDocumentPath entirely (uses no document),
    // so passing the cover file alongside it must not matter either way —
    // relink still succeeds without ever inspecting it.
    const result = await restoreEnglish({
      report,
      masterDocumentPath: coverFile,
      forceRelink: true,
      dumpPath: "/dumps/pre-restore.dump",
      docsRoot: dir,
      deps,
    });

    expect(deps.upload).not.toHaveBeenCalled();
    expect(result.englishRestore!.method).toBe("relink");
  });

  test("rejects with no document and no --force-relink", async () => {
    const dir = tmpDir();
    const affectedLesson = baseAffectedLesson([]);
    const report = baseReport(affectedLesson);
    const deps = makeDeps();

    await expect(
      restoreEnglish({
        report,
        masterDocumentPath: null,
        forceRelink: false,
        dumpPath: "/dumps/pre-restore.dump",
        docsRoot: dir,
        deps,
      })
    ).rejects.toBeInstanceOf(RestoreLessonAbortError);
  });

  test("runs the mode/owner repair-then-abort sequence when siblingDocPath is given, and aborts (31) on unrepairable mismatch", async () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const report = baseReport(affectedLesson);

    // The sibling (source doc) is world-unreadable-looking on purpose; the
    // destination path deps.upload "writes" plus its preview are created
    // with a different, unrepairable owner via a doubled FileModeOps.
    const destinationPath = computeDestinationDocPath(dir, affectedLesson, 159);
    fs.writeFileSync(destinationPath, "uploaded content");
    const previewDir = path.join(dir, "web");
    fs.mkdirSync(previewDir);
    const previewPath = computeDestinationPreviewPath(previewDir, 42, 159);
    fs.writeFileSync(previewPath, "<html></html>");

    const store = new Map<string, ModeOwner>([
      [doc, { mode: 0o644, uid: 1000, gid: 2000 }],
      [destinationPath, { mode: 0o600, uid: 1000, gid: 1000 }],
      [previewPath, { mode: 0o600, uid: 1000, gid: 1000 }],
    ]);
    const fileModeOps: FileModeOps = {
      stat: (filepath) => store.get(filepath) ?? { mode: 0o600, uid: 1000, gid: 1000 },
      chmod: (filepath, mode) => store.set(filepath, { ...store.get(filepath)!, mode }),
      chown: () => {
        throw new Error("EPERM");
      },
    };

    const deps = makeDeps();

    try {
      await restoreEnglish({
        report,
        masterDocumentPath: doc,
        forceRelink: false,
        dumpPath: "/dumps/pre-restore.dump",
        docsRoot: dir,
        previewDir,
        siblingDocPath: doc,
        deps,
        fileModeOps,
      });
      fail("expected RestoreLessonAbortError");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      const abortErr = err as RestoreLessonAbortError;
      expect(abortErr.exitCode).toBe(31);
      expect(abortErr.message).toMatch(/Lesson 1 may currently be unreadable/);
      expect(abortErr.message).toContain(destinationPath);
      expect(abortErr.message).toContain(previewPath);
    }
  });

  test("mode/owner check is skipped when no siblingDocPath is given", async () => {
    const dir = tmpDir();
    const doc = writeFile(dir, "Luke-1-01v157.odt", "pre-incident content");
    const candidate = candidateFor(doc, { version: 157 });
    const affectedLesson = baseAffectedLesson([candidate]);
    const report = baseReport(affectedLesson);
    const deps = makeDeps();

    await expect(
      restoreEnglish({
        report,
        masterDocumentPath: doc,
        forceRelink: false,
        dumpPath: "/dumps/pre-restore.dump",
        docsRoot: dir,
        deps,
      })
    ).resolves.toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Path convention helpers
// ─────────────────────────────────────────────────────────────────────────

describe("computeDestinationDocPath / computeDestinationPreviewPath", () => {
  test("matches docStorage's zero-padded naming convention", () => {
    const affectedLesson = baseAffectedLesson([]);
    expect(computeDestinationDocPath("/docs", affectedLesson, 9)).toBe("/docs/Luke-1-01v09.odt");
    expect(computeDestinationDocPath("/docs", affectedLesson, 159)).toBe("/docs/Luke-1-01v159.odt");
  });

  test("preview path is {lessonId}-{version}.htm under the preview dir", () => {
    expect(computeDestinationPreviewPath("/docs/web", 42, 159)).toBe("/docs/web/42-159.htm");
  });
});
