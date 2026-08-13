/// <reference types="jest" />

/**
 * Unit tests for report.ts (report read/write, checksums (I13), atomic
 * flush (I12), journal (I27), duplicate baseline carry (I19)).
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Report integrity and
 * identity (I13), §Crash mid-apply must not lose the audit trail (I12),
 * §The residual write race section (I19), §Two dumps one recorded path,
 * specs/018-lesson1-translation-restore/data-model.md DiagnosisReport /
 * ProductionFingerprint.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { RestoreLessonAbortError } from "./identity";
import {
  DIAGNOSIS_CHECKSUM_FIELDS,
  appendJournalLine,
  canonicalStringify,
  checkForceReportOverwrite,
  computeDiagnosisChecksum,
  computeReportChecksum,
  deriveCarryForward,
  ensureReportDirectory,
  journalIsNonEmpty,
  journalPathForReport,
  loadAndVerifyPriorReport,
  loadReport,
  readJournalLines,
  REPORT_DIR_MODE,
  REPORT_FILE_MODE,
  saveReport,
  verifyReportIntegrity,
  writeReportAtomic,
} from "./report";
import { DiagnosisReport } from "./types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "report-test-"));
}

function baseReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  const partial: Omit<DiagnosisReport, "diagnosisChecksum" | "reportChecksum"> = {
    diagnosisId: "11111111-1111-1111-1111-111111111111",
    generatedAt: "2026-08-13T00:00:00.000Z",
    toolVersion: "1.0.0",
    mode: "diagnose",
    identity: {
      productionMarkerPresent: true,
      snapshotConfirmationToken: "confirmed-by-operator",
      productionLessonVersion: 159,
      snapshotLessonVersion: 157,
      snapshotIsOlder: true,
    },
    productionFingerprint: {
      databaseName: "lessons-from-luke",
      lessonCount: 42,
      maxMasterId: 5000,
      maxLessonStringId: 9000,
    },
    affectedLessons: [
      {
        book: "Luke",
        series: 1,
        lesson: 1,
        productionLessonId: 1,
        snapshotLessonId: 1,
        productionVersion: 159,
        snapshotVersion: 157,
        bumpCount: 2,
        mappingStrategy: "snapshotAnchored",
        knownBadVersions: [158],
        expectedBumpCount: 2,
        candidateMasterDocuments: [],
      },
    ],
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
  const withoutChecksums = { ...partial, ...overrides } as DiagnosisReport;
  const diagnosisChecksum = computeDiagnosisChecksum(withoutChecksums);
  const withDiagnosisChecksum = { ...withoutChecksums, diagnosisChecksum } as DiagnosisReport;
  const reportChecksum = computeReportChecksum(withDiagnosisChecksum);
  return { ...withDiagnosisChecksum, reportChecksum };
}

describe("canonicalStringify", () => {
  test("is independent of key insertion order", () => {
    const a = canonicalStringify({ b: 1, a: 2 });
    const b = canonicalStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  test("preserves array order (meaningful data, not sorted)", () => {
    expect(canonicalStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  test("sorts keys recursively inside nested objects and arrays", () => {
    const value = { z: [{ y: 1, x: 2 }], a: 1 };
    expect(canonicalStringify(value)).toBe('{"a":1,"z":[{"x":2,"y":1}]}');
  });
});

describe("checksum computation and verification", () => {
  test("computeDiagnosisChecksum only covers the frozen fields, is order-independent", () => {
    const report = baseReport();
    const reordered: DiagnosisReport = {
      ...report,
      // Same content, different key insertion order on a nested object.
      productionFingerprint: {
        maxLessonStringId: report.productionFingerprint.maxLessonStringId,
        maxMasterId: report.productionFingerprint.maxMasterId,
        lessonCount: report.productionFingerprint.lessonCount,
        databaseName: report.productionFingerprint.databaseName,
      },
    };
    // productionFingerprint is NOT one of the frozen fields, so changing its
    // key order (or its content) must not move the diagnosisChecksum.
    expect(computeDiagnosisChecksum(reordered)).toBe(computeDiagnosisChecksum(report));
  });

  test("computeDiagnosisChecksum changes when a frozen field's content changes", () => {
    const report = baseReport();
    const mutated: DiagnosisReport = {
      ...report,
      affectedLessons: [{ ...report.affectedLessons[0], bumpCount: 3 }],
    };
    expect(computeDiagnosisChecksum(mutated)).not.toBe(computeDiagnosisChecksum(report));
  });

  test("DIAGNOSIS_CHECKSUM_FIELDS matches the data-model's frozen field list", () => {
    expect([...DIAGNOSIS_CHECKSUM_FIELDS].sort()).toEqual(
      [
        "identity",
        "affectedLessons",
        "languageIdentityChecks",
        "mappings",
        "findings",
        "perLanguageCounts",
        "blastRadius",
        "plannedWrites",
        "conflicts",
      ].sort()
    );
  });

  test("computeReportChecksum ignores whatever reportChecksum is already on the object", () => {
    const report = baseReport();
    const withBogusChecksum: DiagnosisReport = { ...report, reportChecksum: "bogus" };
    expect(computeReportChecksum(withBogusChecksum)).toBe(computeReportChecksum(report));
  });

  test("computeReportChecksum changes when any field (not just frozen ones) changes", () => {
    const report = baseReport();
    const mutated: DiagnosisReport = {
      ...report,
      productionFingerprint: { ...report.productionFingerprint, lessonCount: 43 },
    };
    expect(computeReportChecksum(mutated)).not.toBe(computeReportChecksum(report));
  });

  test("verifyReportIntegrity passes for a freshly-built report", () => {
    const report = baseReport();
    expect(() => verifyReportIntegrity(report)).not.toThrow();
    expect(() => verifyReportIntegrity(report, "lessons-from-luke")).not.toThrow();
  });

  test("verifyReportIntegrity throws exit 20 on a tampered diagnosisChecksum", () => {
    const report = baseReport();
    const tampered: DiagnosisReport = {
      ...report,
      affectedLessons: [{ ...report.affectedLessons[0], bumpCount: 99 }],
    };
    try {
      verifyReportIntegrity(tampered);
      fail("expected verifyReportIntegrity to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(20);
    }
  });

  test("verifyReportIntegrity throws exit 20 on a tampered reportChecksum", () => {
    const report = baseReport();
    const tampered: DiagnosisReport = { ...report, reportChecksum: "0".repeat(64) };
    expect(() => verifyReportIntegrity(tampered)).toThrow(RestoreLessonAbortError);
    try {
      verifyReportIntegrity(tampered);
    } catch (err) {
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(20);
    }
  });

  test("verifyReportIntegrity throws exit 20 when the live database name diverges", () => {
    const report = baseReport();
    expect(() => verifyReportIntegrity(report, "some-other-database")).toThrow(
      RestoreLessonAbortError
    );
    try {
      verifyReportIntegrity(report, "some-other-database");
    } catch (err) {
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(20);
    }
  });
});

describe("journalPathForReport", () => {
  test("derives the journal path from the report basename, not a fixed name", () => {
    expect(journalPathForReport("/rec/report.json")).toBe("/rec/report.journal.jsonl");
    expect(journalPathForReport("/rec/report-2.json")).toBe("/rec/report-2.journal.jsonl");
  });
});

describe("atomic flush and directory/file modes", () => {
  test("writeReportAtomic creates the report directory at 0700 when absent", () => {
    const dir = tmpDir();
    const reportDir = path.join(dir, "rec");
    const reportPath = path.join(reportDir, "report.json");
    const report = baseReport();

    writeReportAtomic(reportPath, report);

    const dirStat = fs.statSync(reportDir);
    expect(dirStat.mode & 0o777).toBe(REPORT_DIR_MODE);
    const fileStat = fs.statSync(reportPath);
    expect(fileStat.mode & 0o777).toBe(REPORT_FILE_MODE);
  });

  test("writeReportAtomic writes content readable back via loadReport", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    const report = baseReport();

    writeReportAtomic(reportPath, report);

    expect(loadReport(reportPath)).toEqual(report);
  });

  test("writeReportAtomic leaves no temp file behind in the report directory", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(reportPath, baseReport());

    const entries = fs.readdirSync(dir);
    expect(entries).toEqual(["report.json"]);
  });

  test("ensureReportDirectory aborts (14) on an existing group/world-readable directory", () => {
    const dir = tmpDir();
    const readableDir = path.join(dir, "world-readable");
    fs.mkdirSync(readableDir, { mode: 0o755 });
    fs.chmodSync(readableDir, 0o755);

    try {
      ensureReportDirectory(readableDir);
      fail("expected ensureReportDirectory to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreLessonAbortError);
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(14);
    }
  });

  test("ensureReportDirectory accepts an existing 0700 directory", () => {
    const dir = tmpDir();
    const strictDir = path.join(dir, "strict");
    fs.mkdirSync(strictDir, { mode: 0o700 });
    fs.chmodSync(strictDir, 0o700);

    expect(() => ensureReportDirectory(strictDir)).not.toThrow();
  });

  test("saveReport recomputes reportChecksum but never diagnosisChecksum, and flushes atomically", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    const original = baseReport();

    const mutated: DiagnosisReport = {
      ...original,
      appliedWrites: [
        {
          languageId: 3,
          masterId: 501,
          text: "restored text",
          overwrote: null,
          appliedAt: "2026-08-13T01:00:00.000Z",
        },
      ],
    };

    const saved = saveReport(reportPath, mutated);

    expect(saved.diagnosisChecksum).toBe(original.diagnosisChecksum);
    expect(saved.reportChecksum).toBe(computeReportChecksum(mutated));
    expect(saved.reportChecksum).not.toBe(original.reportChecksum);
    expect(loadReport(reportPath)).toEqual(saved);
  });
});

describe("journal", () => {
  test("appendJournalLine writes 0600, and readJournalLines round-trips entries in order", () => {
    const dir = tmpDir();
    const journalPath = path.join(dir, "report.journal.jsonl");

    appendJournalLine(journalPath, {
      diagnosisId: "d1",
      languageId: 3,
      masterId: 501,
      appliedAt: "t1",
    });
    appendJournalLine(journalPath, {
      diagnosisId: "d1",
      languageId: 3,
      masterId: 502,
      appliedAt: "t2",
    });

    const lines = readJournalLines(journalPath);
    expect(lines).toEqual([
      { diagnosisId: "d1", languageId: 3, masterId: 501, appliedAt: "t1" },
      { diagnosisId: "d1", languageId: 3, masterId: 502, appliedAt: "t2" },
    ]);
    expect(fs.statSync(journalPath).mode & 0o777).toBe(REPORT_FILE_MODE);
  });

  test("readJournalLines returns [] when the journal does not exist", () => {
    const dir = tmpDir();
    expect(readJournalLines(path.join(dir, "absent.journal.jsonl"))).toEqual([]);
  });

  test("journalIsNonEmpty distinguishes absent, empty, and populated journals", () => {
    const dir = tmpDir();
    const absent = path.join(dir, "absent.journal.jsonl");
    const empty = path.join(dir, "empty.journal.jsonl");
    const populated = path.join(dir, "populated.journal.jsonl");
    fs.writeFileSync(empty, "");
    appendJournalLine(populated, { diagnosisId: "d1" });

    expect(journalIsNonEmpty(absent)).toBe(false);
    expect(journalIsNonEmpty(empty)).toBe(false);
    expect(journalIsNonEmpty(populated)).toBe(true);
  });
});

describe("--force-report refusal", () => {
  test("does not throw when the report has no self-produced englishRestore, no appliedWrites, and no journal", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(reportPath, baseReport());

    expect(() => checkForceReportOverwrite(reportPath)).not.toThrow();
  });

  test("refuses (14) on a self-produced englishRestore", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(
      reportPath,
      baseReport({
        englishRestore: {
          method: "upload",
          masterDocumentPath: "docs/Luke-1-01v157.odt",
          masterDocumentSha256: "abc",
          newLessonVersion: 159,
          dumpPath: "/rec/pre-english-restore.dump",
          restoredAt: "2026-08-13T00:30:00.000Z",
          carriedFromDiagnosisId: null,
        },
      })
    );

    expect(() => checkForceReportOverwrite(reportPath)).toThrow(RestoreLessonAbortError);
    try {
      checkForceReportOverwrite(reportPath);
    } catch (err) {
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(14);
    }
  });

  test("does NOT refuse on a carried englishRestore (carriedFromDiagnosisId set)", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(
      reportPath,
      baseReport({
        englishRestore: {
          method: "upload",
          masterDocumentPath: "docs/Luke-1-01v157.odt",
          masterDocumentSha256: "abc",
          newLessonVersion: 159,
          dumpPath: "/rec/pre-english-restore.dump",
          restoredAt: "2026-08-13T00:30:00.000Z",
          carriedFromDiagnosisId: "22222222-2222-2222-2222-222222222222",
        },
      })
    );

    expect(() => checkForceReportOverwrite(reportPath)).not.toThrow();
  });

  test("refuses (14) on non-empty appliedWrites", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(
      reportPath,
      baseReport({
        appliedWrites: [
          {
            languageId: 3,
            masterId: 501,
            text: "x",
            overwrote: null,
            appliedAt: "2026-08-13T01:00:00.000Z",
          },
        ],
      })
    );

    expect(() => checkForceReportOverwrite(reportPath)).toThrow(RestoreLessonAbortError);
  });

  test("refuses (14) when the report's own journal is non-empty", () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, "report.json");
    writeReportAtomic(reportPath, baseReport());
    appendJournalLine(journalPathForReport(reportPath), { diagnosisId: baseReport().diagnosisId });

    expect(() => checkForceReportOverwrite(reportPath)).toThrow(RestoreLessonAbortError);
  });

  test("a second report's refusal check is unaffected by a sibling report's journal", () => {
    const dir = tmpDir();
    const firstReportPath = path.join(dir, "report.json");
    const secondReportPath = path.join(dir, "report-2.json");
    writeReportAtomic(firstReportPath, baseReport());
    writeReportAtomic(
      secondReportPath,
      baseReport({ diagnosisId: "33333333-3333-3333-3333-333333333333" })
    );
    appendJournalLine(journalPathForReport(firstReportPath), {
      diagnosisId: baseReport().diagnosisId,
    });

    // report-2's own journal (report-2.journal.jsonl) does not exist, so it is not refused
    // even though report.journal.jsonl (its sibling's) is non-empty.
    expect(() => checkForceReportOverwrite(secondReportPath)).not.toThrow();
  });
});

describe("--prior-report checksum verification and carry-forward", () => {
  test("loadAndVerifyPriorReport succeeds when checksums and database name match", () => {
    const dir = tmpDir();
    const priorPath = path.join(dir, "report.json");
    const prior = baseReport();
    writeReportAtomic(priorPath, prior);

    const loaded = loadAndVerifyPriorReport(priorPath, "lessons-from-luke");
    expect(loaded).toEqual(prior);
  });

  test("loadAndVerifyPriorReport aborts (20) on a database name mismatch", () => {
    const dir = tmpDir();
    const priorPath = path.join(dir, "report.json");
    writeReportAtomic(priorPath, baseReport());

    expect(() => loadAndVerifyPriorReport(priorPath, "wrong-database")).toThrow(
      RestoreLessonAbortError
    );
    try {
      loadAndVerifyPriorReport(priorPath, "wrong-database");
    } catch (err) {
      expect((err as InstanceType<typeof RestoreLessonAbortError>).exitCode).toBe(20);
    }
  });

  test("loadAndVerifyPriorReport aborts (20) on a tampered checksum", () => {
    const dir = tmpDir();
    const priorPath = path.join(dir, "report.json");
    const prior = baseReport();
    writeReportAtomic(priorPath, {
      ...prior,
      affectedLessons: [{ ...prior.affectedLessons[0], bumpCount: 99 }],
    });

    expect(() => loadAndVerifyPriorReport(priorPath, "lessons-from-luke")).toThrow(
      RestoreLessonAbortError
    );
  });

  test("deriveCarryForward carries knownBadVersions, bumps expectedBumpCount, and marks englishRestore carried", () => {
    const prior = baseReport({
      englishRestore: {
        method: "upload",
        masterDocumentPath: "docs/Luke-1-01v157.odt",
        masterDocumentSha256: "abc",
        newLessonVersion: 159,
        dumpPath: "/rec/pre-english-restore.dump",
        restoredAt: "2026-08-13T00:30:00.000Z",
        carriedFromDiagnosisId: null,
      },
    });

    const carryForward = deriveCarryForward(prior, { book: "Luke", series: 1, lesson: 1 });

    expect(carryForward.priorDiagnosisId).toBe(prior.diagnosisId);
    expect(carryForward.knownBadVersions).toEqual([158]);
    expect(carryForward.expectedBumpCount).toBe(prior.affectedLessons[0].expectedBumpCount + 1);
    expect(carryForward.englishRestore).toEqual({
      ...prior.englishRestore,
      carriedFromDiagnosisId: prior.diagnosisId,
    });
  });

  test("deriveCarryForward preserves an already-carried englishRestore's carriedFromDiagnosisId across a second hop", () => {
    const originalDiagnosisId = "44444444-4444-4444-4444-444444444444";
    const prior = baseReport({
      diagnosisId: "55555555-5555-5555-5555-555555555555",
      englishRestore: {
        method: "upload",
        masterDocumentPath: "docs/Luke-1-01v157.odt",
        masterDocumentSha256: "abc",
        newLessonVersion: 159,
        dumpPath: "/rec/pre-english-restore.dump",
        restoredAt: "2026-08-13T00:30:00.000Z",
        carriedFromDiagnosisId: originalDiagnosisId,
      },
    });

    const carryForward = deriveCarryForward(prior, { book: "Luke", series: 1, lesson: 1 });

    // Must keep pointing at the report that actually performed the restore,
    // not the report it was most recently copied from.
    expect(carryForward.englishRestore?.carriedFromDiagnosisId).toBe(originalDiagnosisId);
  });

  test("deriveCarryForward throws when the prior report has no matching affected lesson", () => {
    const prior = baseReport();

    expect(() => deriveCarryForward(prior, { book: "Acts", series: 2, lesson: 3 })).toThrow(
      RestoreLessonAbortError
    );
  });
});
