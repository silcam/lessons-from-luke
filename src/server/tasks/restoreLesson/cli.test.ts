/// <reference types="jest" />

/**
 * Unit tests for cli.ts's `diagnose` subcommand wiring (task 5.6.7):
 * `diagnose()`'s orchestration core, argument parsing, redaction, the
 * candidate master document scanner, and `runDiagnoseCommand()`'s
 * precondition/exit-code handling with the Snapshot connection doubled
 * (per the contract's "Contract tests ... with the two storages doubled").
 *
 * `productionSql` throughout is the real `TransactionalTestStorage`
 * connection (`(global as any).testStorage.sql`) — this codebase's
 * established "double" for a live database (see gateway.test.ts,
 * identity.test.ts). The Snapshot side is either captured as plain data
 * (matching `diagnose()`'s `SnapshotBundle` contract, per research D11) or,
 * for `runDiagnoseCommand()`, a hand-rolled fake `SqlFunc` double that
 * answers the exact queries `cli.ts` issues against it.
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md §diagnose,
 * §Output redaction and file modes, §Contract tests.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { SqlFunc } from "postgres";
import { RestoreLessonAbortError, PRODUCTION_MARKER_FILENAME } from "./identity";
import { computeDiagnosisChecksum, computeReportChecksum, verifyReportIntegrity } from "./report";
import { Persistence } from "../../../core/interfaces/Persistence";
import { RestoreEnglishDeps, RestoredLessonResult, FileModeOps, ModeOwner } from "./restoreEnglish";
import { fetchAllLanguages, fetchLegacyScopedCount, fetchTStringsForLesson } from "./gateway";
import { journalPathForReport, readJournalLines } from "./report";
import {
  AffectedLesson,
  DiagnosisReport,
  EnglishRestore,
  LanguageCounts,
  MasterDocumentCandidate,
  MasterStringMapping,
  TranslationFinding,
} from "./types";
import {
  AdvisoryLockOps,
  advisoryLockKey,
  apply,
  computeMaxWritesDefault,
  diagnose,
  DiskHeadroomOps,
  parseApplyArgs,
  parseDiagnoseArgs,
  parseRestoreEnglishArgs,
  redactConnectionString,
  redactDeep,
  restoreEnglish,
  runApplyCommand,
  runDiagnoseCommand,
  RunPgDump,
  scanCandidateMasterDocuments,
  SnapshotBundle,
  WithReservedConnection,
} from "./cli";

function sql() {
  return (global as any).testStorage.sql;
}

function tmpHomeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-home-"));
}

function tmpReportDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-report-"));
}

function homeDirWithMarker(): string {
  const homeDir = tmpHomeDir();
  fs.writeFileSync(path.join(homeDir, PRODUCTION_MARKER_FILENAME), "");
  return homeDir;
}

/** Captures a `SnapshotBundle` for lesson 11 (Luke 1-1, fixture masterId 1)
 * from the live test database, before any "incident" mutation — mirrors
 * restoreLesson.integration.test.ts's own capture-as-data technique. */
async function captureSnapshotBundle(): Promise<SnapshotBundle> {
  const languages = await fetchAllLanguages(sql(), true);
  const [lesson] = await sql()`
    SELECT lessonid, book, series, lesson, version FROM lessons WHERE lessonid=11
  `;
  const tStrings = await fetchTStringsForLesson(sql(), 11, [1], {
    includeLegacyLessonStringScoped: true,
  });
  const legacyLessonStringRowCount = await fetchLegacyScopedCount(sql());
  return { languages, lesson, tStrings, legacyLessonStringRowCount };
}

async function bumpLesson11Version(): Promise<void> {
  await sql()`UPDATE lessons SET version=version+1 WHERE lessonid=11`;
}

// ─────────────────────────────────────────────────────────────────────────
// redaction
// ─────────────────────────────────────────────────────────────────────────

describe("redactConnectionString", () => {
  test("masks the password but keeps scheme, user, host, port, and db", () => {
    const redacted = redactConnectionString(
      "connecting to postgres://opsuser:hunter2@127.0.0.1:5433/lessons-snapshot now"
    );
    expect(redacted).toBe(
      "connecting to postgres://opsuser:***@127.0.0.1:5433/lessons-snapshot now"
    );
    expect(redacted).not.toContain("hunter2");
  });

  test("leaves text with no connection string untouched", () => {
    expect(redactConnectionString("no secrets here")).toBe("no secrets here");
  });
});

describe("redactDeep", () => {
  test("redacts connection strings nested in objects and arrays", () => {
    const input = {
      message: "postgres://u:secret@h:5432/d",
      nested: { list: ["postgres://u2:secret2@h2:5432/d2", "plain"] },
      count: 3,
    };
    const redacted = redactDeep(input);
    expect(redacted.message).toBe("postgres://u:***@h:5432/d");
    expect(redacted.nested.list[0]).toBe("postgres://u2:***@h2:5432/d2");
    expect(redacted.nested.list[1]).toBe("plain");
    expect(redacted.count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseDiagnoseArgs
// ─────────────────────────────────────────────────────────────────────────

describe("parseDiagnoseArgs", () => {
  const OLD_ENV = process.env.SNAPSHOT_DATABASE_URL;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.SNAPSHOT_DATABASE_URL;
    else process.env.SNAPSHOT_DATABASE_URL = OLD_ENV;
  });

  test("parses required and optional flags", () => {
    const args = parseDiagnoseArgs([
      "--snapshot-url",
      "postgres://u:p@h:5432/snap",
      "--report",
      "/tmp/report.json",
      "--snapshot-confirmed",
      "seen-it",
      "--book",
      "Luke",
      "--json",
      "--no-color",
    ]);
    expect(args.snapshotUrl).toBe("postgres://u:p@h:5432/snap");
    expect(args.snapshotUrlFromFlag).toBe(true);
    expect(args.report).toBe("/tmp/report.json");
    expect(args.snapshotConfirmed).toBe("seen-it");
    expect(args.book).toBe("Luke");
    expect(args.json).toBe(true);
    expect(args.noColor).toBe(true);
    expect(args.forceReport).toBe(false);
    expect(args.priorReport).toBeNull();
  });

  test("falls back to SNAPSHOT_DATABASE_URL when --snapshot-url is omitted", () => {
    process.env.SNAPSHOT_DATABASE_URL = "postgres://u:p@h:5432/snap-env";
    const args = parseDiagnoseArgs([
      "--report",
      "/tmp/report.json",
      "--snapshot-confirmed",
      "seen-it",
    ]);
    expect(args.snapshotUrl).toBe("postgres://u:p@h:5432/snap-env");
    expect(args.snapshotUrlFromFlag).toBe(false);
  });

  test("aborts (1) when neither --snapshot-url nor SNAPSHOT_DATABASE_URL is given", () => {
    delete process.env.SNAPSHOT_DATABASE_URL;
    try {
      parseDiagnoseArgs(["--report", "/tmp/report.json", "--snapshot-confirmed", "seen-it"]);
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(1);
    }
  });

  test("aborts (1) when --report is missing", () => {
    process.env.SNAPSHOT_DATABASE_URL = "postgres://u:p@h:5432/snap-env";
    expect(() => parseDiagnoseArgs(["--snapshot-confirmed", "seen-it"])).toThrow(
      RestoreLessonAbortError
    );
  });

  test("aborts (1) when --snapshot-confirmed is missing", () => {
    process.env.SNAPSHOT_DATABASE_URL = "postgres://u:p@h:5432/snap-env";
    expect(() => parseDiagnoseArgs(["--report", "/tmp/report.json"])).toThrow(
      RestoreLessonAbortError
    );
  });

  test("aborts (1) on an unrecognized flag", () => {
    process.env.SNAPSHOT_DATABASE_URL = "postgres://u:p@h:5432/snap-env";
    expect(() =>
      parseDiagnoseArgs(["--report", "/tmp/report.json", "--snapshot-confirmed", "x", "--bogus"])
    ).toThrow(RestoreLessonAbortError);
  });

  test("warns when --snapshot-url is passed on argv (world-readable in ps/proc)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseDiagnoseArgs([
      "--snapshot-url",
      "postgres://u:p@h:5432/snap",
      "--report",
      "/tmp/report.json",
      "--snapshot-confirmed",
      "seen-it",
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// scanCandidateMasterDocuments
// ─────────────────────────────────────────────────────────────────────────

describe("scanCandidateMasterDocuments", () => {
  function tmpDocsRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-docs-"));
  }

  test("[] when docsRoot does not exist", () => {
    const candidates = scanCandidateMasterDocuments({
      docsRoot: "/definitely/does/not/exist/anywhere",
      book: "Luke",
      series: 1,
      lesson: 1,
      knownBadVersions: [],
      snapshotEnglishTexts: [],
    });
    expect(candidates).toEqual([]);
  });

  test("matches ^{book}-{series}-{lesson:2}v(\\d+)\\.odt$, ignores non-matching files and directories", () => {
    const docsRoot = tmpDocsRoot();
    fs.writeFileSync(path.join(docsRoot, "Luke-1-01v157.odt"), "not a real odt but a file");
    fs.writeFileSync(path.join(docsRoot, "Luke-1-01v158.odt"), "also not a real odt");
    fs.writeFileSync(path.join(docsRoot, "Luke-1-02v01.odt"), "different lesson, must be ignored");
    fs.writeFileSync(path.join(docsRoot, "notes.txt"), "irrelevant file, must be ignored");
    fs.mkdirSync(path.join(docsRoot, "Luke-1-01v157_odt")); // extraction dir, must be ignored

    const candidates = scanCandidateMasterDocuments({
      docsRoot,
      book: "Luke",
      series: 1,
      lesson: 1,
      knownBadVersions: [158],
      snapshotEnglishTexts: [],
    });

    const versions = candidates.map((c) => c.version).sort();
    expect(versions).toEqual([157, 158]);
    expect(candidates.every((c) => c.filepath.endsWith(".odt"))).toBe(true);
  });

  test("computes sha256/sizeBytes (I23) and marks the pinned knownBadVersions entry", () => {
    const docsRoot = tmpDocsRoot();
    const content = "deterministic-fixture-bytes";
    fs.writeFileSync(path.join(docsRoot, "Luke-1-01v157.odt"), content);

    const [candidate] = scanCandidateMasterDocuments({
      docsRoot,
      book: "Luke",
      series: 1,
      lesson: 1,
      knownBadVersions: [157],
      snapshotEnglishTexts: [],
    });

    expect(candidate.sizeBytes).toBe(Buffer.byteLength(content));
    expect(candidate.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(candidate.isKnownBadUpload).toBe(true);
  });

  test("a candidate that fails to parse (not a real ODT) is recorded, not thrown", () => {
    const docsRoot = tmpDocsRoot();
    fs.writeFileSync(path.join(docsRoot, "Luke-1-01v157.odt"), "not a zip file at all");

    const [candidate] = scanCandidateMasterDocuments({
      docsRoot,
      book: "Luke",
      series: 1,
      lesson: 1,
      knownBadVersions: [],
      snapshotEnglishTexts: ["some snapshot text"],
    });

    expect(candidate.englishTextSetMatchesSnapshot).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// diagnose() core
// ─────────────────────────────────────────────────────────────────────────

describe("diagnose()", () => {
  test("aborts (10) when the production marker file is missing", async () => {
    const snapshot = await captureSnapshotBundle();
    await expect(
      diagnose({
        productionSql: sql(),
        snapshot,
        snapshotConfirmed: "seen-it",
        dryRun: true,
        homeDir: tmpHomeDir(),
      })
    ).rejects.toMatchObject({ exitCode: 10 });
  });

  test("aborts (11) when the Snapshot is not older than production", async () => {
    const snapshot = await captureSnapshotBundle(); // captured but production not yet mutated
    await expect(
      diagnose({
        productionSql: sql(),
        snapshot,
        snapshotConfirmed: "seen-it",
        dryRun: true,
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 11 });
  });

  test("aborts (13) when --book does not match the Snapshot lesson's book", async () => {
    const snapshot = await captureSnapshotBundle();
    await bumpLesson11Version();
    await expect(
      diagnose({
        productionSql: sql(),
        snapshot,
        snapshotConfirmed: "seen-it",
        book: "Acts",
        dryRun: true,
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 13 });
  });

  test("aborts (13) when no production lesson matches the Snapshot's (book, series, lesson)", async () => {
    const snapshot = await captureSnapshotBundle();
    const noMatch: SnapshotBundle = {
      ...snapshot,
      lesson: { ...snapshot.lesson, series: 999, lesson: 999 },
    };
    await expect(
      diagnose({
        productionSql: sql(),
        snapshot: noMatch,
        snapshotConfirmed: "seen-it",
        dryRun: true,
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 13 });
  });

  test("aborts (15) when cross-database language identity diverges (I22)", async () => {
    const snapshot = await captureSnapshotBundle();
    await bumpLesson11Version();
    const divergent: SnapshotBundle = {
      ...snapshot,
      languages: snapshot.languages.map((l) =>
        l.code === "DEF" ? { ...l, languageId: l.languageId + 1000 } : l
      ),
    };
    await expect(
      diagnose({
        productionSql: sql(),
        snapshot: divergent,
        snapshotConfirmed: "seen-it",
        dryRun: true,
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 15 });
  });

  test("returns a fully checksummed report on the happy path (0), with zero database writes", async () => {
    const snapshot = await captureSnapshotBundle();
    await bumpLesson11Version();

    const beforeTStrings = await fetchTStringsForLesson(sql(), 11, [1], {
      includeLegacyLessonStringScoped: true,
    });

    const report = await diagnose({
      productionSql: sql(),
      snapshot,
      snapshotConfirmed: "seen-it",
      book: "Luke",
      dryRun: true,
      homeDir: homeDirWithMarker(),
    });

    expect(report.mode).toBe("diagnose");
    expect(report.identity.snapshotIsOlder).toBe(true);
    expect(report.identity.snapshotConfirmationToken).toBe("seen-it");
    expect(report.affectedLessons).toHaveLength(1);
    expect(report.affectedLessons[0].book).toBe("Luke");
    expect(report.affectedLessons[0].series).toBe(1);
    expect(report.affectedLessons[0].lesson).toBe(1);
    expect(() => verifyReportIntegrity(report)).not.toThrow();

    const afterTStrings = await fetchTStringsForLesson(sql(), 11, [1], {
      includeLegacyLessonStringScoped: true,
    });
    expect(afterTStrings).toEqual(beforeTStrings);
  });

  test("writes exactly one report file when dryRun is false and reportPath is given", async () => {
    const snapshot = await captureSnapshotBundle();
    await bumpLesson11Version();
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");

    const report = await diagnose({
      productionSql: sql(),
      snapshot,
      snapshotConfirmed: "seen-it",
      book: "Luke",
      dryRun: false,
      reportPath,
      homeDir: homeDirWithMarker(),
    });

    expect(fs.existsSync(reportPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(written.diagnosisId).toBe(report.diagnosisId);
    expect((fs.statSync(reportPath).mode & 0o777).toString(8)).toBe("600");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// runDiagnoseCommand() — with the Snapshot connection doubled
// ─────────────────────────────────────────────────────────────────────────

/** A minimal fake `SqlFunc`: a tagged-template function that answers the
 * exact queries `cli.ts` issues against the Snapshot connection, built from
 * plain data captured off the real test database before mutation. */
function makeSnapshotDouble(data: {
  lessons: unknown[];
  languages: unknown[];
  lessonStrings: unknown[];
  tStrings: unknown[];
  legacyCount: number;
}): SqlFunc {
  const tag = ((strings: TemplateStringsArray) => {
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    if (text.includes("SELECT 1")) return Promise.resolve([{ "?column?": 1 }]);
    if (text.includes("SELECT lessonstringid FROM lessonstrings")) {
      return Promise.resolve([]); // no legacy-scoped rows in this fixture
    }
    if (text.includes("FROM lessons") && text.includes("WHERE book=")) {
      return Promise.resolve(data.lessons);
    }
    if (text.includes("FROM languages")) {
      return Promise.resolve(data.languages);
    }
    if (text.includes("FROM lessonstrings WHERE lessonid=")) {
      return Promise.resolve(data.lessonStrings);
    }
    if (text.includes("FROM tstrings") && text.includes("masterid IN")) {
      return Promise.resolve(data.tStrings);
    }
    if (text.includes("lessonstringid IS NOT NULL")) {
      return Promise.resolve([{ cnt: data.legacyCount }]);
    }
    return Promise.reject(new Error(`Unhandled fake snapshot query: ${text}`));
  }) as unknown as SqlFunc;
  return tag;
}

describe("runDiagnoseCommand()", () => {
  function baseArgv(extra: string[] = []): string[] {
    return [
      "--snapshot-url",
      "postgres://snapshot-user:secret@127.0.0.1:5433/snapshot-db",
      "--report",
      path.join(tmpReportDir(), "report.json"),
      "--snapshot-confirmed",
      "seen-it",
      ...extra,
    ];
  }

  test("aborts (1) when a required flag is missing", async () => {
    const code = await runDiagnoseCommand({
      argv: ["--report", path.join(tmpReportDir(), "report.json")],
      homeDir: homeDirWithMarker(),
      stdout: () => {},
      stderr: () => {},
    });
    expect(code).toBe(1);
  });

  test("aborts (10) when the production marker file is missing", async () => {
    const code = await runDiagnoseCommand({
      argv: baseArgv(["--book", "Luke"]),
      homeDir: tmpHomeDir(),
      stdout: () => {},
      stderr: () => {},
    });
    expect(code).toBe(10);
  });

  test("aborts (14) when the report already exists and --force-report is not given", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify({ diagnosisId: "existing" }));

    const code = await runDiagnoseCommand({
      argv: [
        "--snapshot-url",
        "postgres://u:p@h:5432/snap",
        "--report",
        reportPath,
        "--snapshot-confirmed",
        "seen-it",
        "--book",
        "Luke",
      ],
      homeDir: homeDirWithMarker(),
      stdout: () => {},
      stderr: () => {},
    });
    expect(code).toBe(14);
  });

  test("aborts (12) when the Snapshot connection fails", async () => {
    const code = await runDiagnoseCommand({
      argv: baseArgv(["--book", "Luke"]),
      homeDir: homeDirWithMarker(),
      stdout: () => {},
      stderr: () => {},
      connectProduction: () => sql(),
      connectSnapshot: () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(code).toBe(12);
  });

  test("aborts (13) when --book is not given", async () => {
    const code = await runDiagnoseCommand({
      argv: baseArgv(),
      homeDir: homeDirWithMarker(),
      stdout: () => {},
      stderr: () => {},
      connectProduction: () => sql(),
      connectSnapshot: () =>
        makeSnapshotDouble({
          lessons: [],
          languages: [],
          lessonStrings: [],
          tStrings: [],
          legacyCount: 0,
        }),
    });
    expect(code).toBe(13);
  });

  test("aborts (13) when no lesson under --book shows a version mismatch", async () => {
    const lessons = await sql()`
      SELECT lessonid, book, series, lesson, version FROM lessons WHERE book='Luke' ORDER BY series, lesson
    `;
    const code = await runDiagnoseCommand({
      argv: baseArgv(["--book", "Luke"]),
      homeDir: homeDirWithMarker(),
      stdout: () => {},
      stderr: () => {},
      connectProduction: () => sql(),
      connectSnapshot: () =>
        makeSnapshotDouble({
          lessons, // identical versions to production: no mismatch
          languages: [],
          lessonStrings: [],
          tStrings: [],
          legacyCount: 0,
        }),
    });
    expect(code).toBe(13);
  });

  test("succeeds (0), writes the report, and redacts the snapshot URL from stdout", async () => {
    const languages = await fetchAllLanguages(sql(), true);
    const preLessons = await sql()`
      SELECT lessonid, book, series, lesson, version FROM lessons WHERE book='Luke' ORDER BY series, lesson
    `;
    const lessonStrings = await sql()`
      SELECT lessonstringid, masterid, lessonid, lessonversion, type, xpath, mothertongue
      FROM lessonstrings WHERE lessonid=11 ORDER BY lessonstringid
    `;
    const tStrings = await fetchTStringsForLesson(sql(), 11, [1], {
      includeLegacyLessonStringScoped: true,
    });
    const legacyCount = await fetchLegacyScopedCount(sql());

    await bumpLesson11Version(); // production now ahead of the (pre-captured) Snapshot double

    const reportPath = path.join(tmpReportDir(), "report.json");
    const stdoutLines: string[] = [];
    const code = await runDiagnoseCommand({
      argv: [
        "--snapshot-url",
        "postgres://snapshot-user:s3cr3t@127.0.0.1:5433/snapshot-db",
        "--report",
        reportPath,
        "--snapshot-confirmed",
        "seen-it",
        "--book",
        "Luke",
      ],
      homeDir: homeDirWithMarker(),
      stdout: (line) => stdoutLines.push(line),
      stderr: () => {},
      connectProduction: () => sql(),
      connectSnapshot: () =>
        makeSnapshotDouble({
          lessons: preLessons,
          languages,
          lessonStrings,
          tStrings,
          legacyCount,
        }),
    });

    expect(code).toBe(0);
    expect(fs.existsSync(reportPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(written.mode).toBe("diagnose");
    expect(written.affectedLessons[0].lesson).toBe(1);
    expect(() => verifyReportIntegrity(written)).not.toThrow();
    expect(stdoutLines.join("\n")).not.toContain("s3cr3t");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseRestoreEnglishArgs
// ─────────────────────────────────────────────────────────────────────────

describe("parseRestoreEnglishArgs", () => {
  test("parses required and optional flags", () => {
    const args = parseRestoreEnglishArgs([
      "--report",
      "/tmp/rec/report.json",
      "--diagnosis-id",
      "abc-123",
      "--master-document",
      "/tmp/docs/Luke-1-01v157.odt",
      "--dump",
      "/tmp/dump",
      "--force-relink",
    ]);
    expect(args).toEqual({
      report: "/tmp/rec/report.json",
      diagnosisId: "abc-123",
      masterDocumentPath: "/tmp/docs/Luke-1-01v157.odt",
      dump: "/tmp/dump",
      forceRelink: true,
    });
  });

  test("--force-relink makes --master-document optional", () => {
    const args = parseRestoreEnglishArgs([
      "--report",
      "/tmp/rec/report.json",
      "--diagnosis-id",
      "abc-123",
      "--force-relink",
    ]);
    expect(args.masterDocumentPath).toBeNull();
    expect(args.forceRelink).toBe(true);
  });

  test("aborts (1) when --report is missing", () => {
    expect(() =>
      parseRestoreEnglishArgs(["--diagnosis-id", "abc-123", "--master-document", "/tmp/x.odt"])
    ).toThrow(RestoreLessonAbortError);
  });

  test("aborts (1) when --diagnosis-id is missing", () => {
    expect(() =>
      parseRestoreEnglishArgs(["--report", "/tmp/r.json", "--master-document", "/tmp/x.odt"])
    ).toThrow(expect.objectContaining({ exitCode: 1 }));
  });

  test("aborts (1) when neither --master-document nor --force-relink is given", () => {
    expect(() =>
      parseRestoreEnglishArgs(["--report", "/tmp/r.json", "--diagnosis-id", "abc-123"])
    ).toThrow(expect.objectContaining({ exitCode: 1 }));
  });

  test("aborts (1) on an unrecognized flag", () => {
    expect(() => parseRestoreEnglishArgs(["--nope", "x"])).toThrow(
      expect.objectContaining({ exitCode: 1 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// restoreEnglish() core — fixtures
// ─────────────────────────────────────────────────────────────────────────

async function currentDatabaseName(): Promise<string> {
  const [row] = await sql()`SELECT current_database() AS db`;
  return row.db as string;
}

async function currentLessonVersion(): Promise<number> {
  const [row] = await sql()`SELECT version FROM lessons WHERE lessonid=11`;
  return row.version as number;
}

function writeFile(dir: string, name: string, content: string): string {
  const filepath = path.join(dir, name);
  fs.writeFileSync(filepath, content);
  return filepath;
}

function candidateFor(
  filepath: string,
  overrides: Partial<MasterDocumentCandidate> = {}
): MasterDocumentCandidate {
  const buffer = fs.readFileSync(filepath);
  const crypto = require("crypto") as typeof import("crypto");
  return {
    filepath,
    version: 157,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    sizeBytes: buffer.length,
    englishTextSetMatchesSnapshot: true,
    isKnownBadUpload: false,
    missingFromDocument: [],
    extraInDocument: [],
    ...overrides,
  };
}

function baseAffectedLesson(
  productionVersion: number,
  candidateMasterDocuments: MasterDocumentCandidate[] = []
): AffectedLesson {
  return {
    book: "Luke",
    series: 1,
    lesson: 1,
    productionLessonId: 11,
    snapshotLessonId: 11,
    productionVersion,
    snapshotVersion: productionVersion - 1,
    bumpCount: 1,
    mappingStrategy: "snapshotAnchored",
    knownBadVersions: [],
    expectedBumpCount: 1,
    candidateMasterDocuments,
  };
}

function finalizeReport(partial: Omit<DiagnosisReport, "diagnosisChecksum" | "reportChecksum">) {
  const diagnosisChecksum = computeDiagnosisChecksum(partial as DiagnosisReport);
  const withDiagnosisChecksum = { ...partial, diagnosisChecksum, reportChecksum: "" };
  const reportChecksum = computeReportChecksum(withDiagnosisChecksum as DiagnosisReport);
  return { ...withDiagnosisChecksum, reportChecksum } as DiagnosisReport;
}

async function baseValidReport(
  affectedLesson: AffectedLesson,
  overrides: Partial<DiagnosisReport> = {}
): Promise<DiagnosisReport> {
  const partial: Omit<DiagnosisReport, "diagnosisChecksum" | "reportChecksum"> = {
    diagnosisId: "22222222-2222-2222-2222-222222222222",
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
      databaseName: await currentDatabaseName(),
      lessonCount: 1,
      maxMasterId: 1,
      maxLessonStringId: 1,
    },
    affectedLessons: [affectedLesson],
    languageIdentityChecks: [
      {
        matchedBy: "code",
        key: "ENG",
        snapshotLanguageId: 1,
        productionLanguageId: 1,
        snapshotCode: "ENG",
        productionCode: "ENG",
        snapshotName: "English",
        productionName: "English",
        agrees: true,
      },
    ],
    mappings: [],
    findings: [],
    perLanguageCounts: [],
    legacyLessonStringRowCounts: { production: 0, snapshot: 0 },
    blastRadius: { sharedMasterIds: 0, lessons: [] },
    plannedWrites: [],
    duplicateRowsBaseline: [],
    conflicts: [],
    ...overrides,
  };
  return finalizeReport(partial);
}

function makeDeps(overrides: Partial<RestoreEnglishDeps> = {}): RestoreEnglishDeps {
  return {
    upload: jest.fn(async () => ({ lessonId: 11, version: 159 }) as RestoredLessonResult),
    relink: jest.fn(async () => ({ lessonId: 11, version: 159 }) as RestoredLessonResult),
    webify: jest.fn(async () => undefined),
    ...overrides,
  };
}

/** `deps.upload` is faked (no real ODT is written to the computed
 * destination path), so `realFileModeOps`'s I18 mode/owner comparison would
 * `stat()` a file that was never created. This double reports every path as
 * already matching, standing in for "the upload path's own file-mode repair
 * behavior is restoreEnglish.ts's concern (already unit-tested there);
 * these cli.ts tests are about the lock/dump/precondition wiring around it". */
const passthroughFileModeOps: FileModeOps = {
  stat: jest.fn(() => ({ mode: 0o644, uid: 501, gid: 20 })),
  chmod: jest.fn(),
  chown: jest.fn(),
};

/** Bypasses the real `sql.begin()` wrapping (the test double `sql()` is
 * already scoped inside the outer per-test transaction and has no `.begin`
 * of its own — see `WithReservedConnection`'s doc comment in cli.ts) — runs
 * `fn` directly against the same connection. Every test below fakes
 * `AdvisoryLockOps` regardless, so real connection-pinning isn't in scope. */
const bypassReservedConnection: WithReservedConnection = (sqlFunc, fn) => fn(sqlFunc);

function makeAdvisoryLockOps(overrides: Partial<AdvisoryLockOps> = {}): AdvisoryLockOps {
  return {
    tryLock: jest.fn(async () => true),
    backendPid: jest.fn(async () => 4242),
    unlock: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeDiskHeadroomOps(overrides: Partial<DiskHeadroomOps> = {}): DiskHeadroomOps {
  return {
    getDatabaseSizeBytes: jest.fn(async () => 1_000),
    getFreeDiskBytes: jest.fn(() => 1_000_000),
    ...overrides,
  };
}

function makeRunPgDump(): { runPgDump: RunPgDump } {
  const runPgDump: RunPgDump = jest.fn(async ({ dumpPath }) => {
    fs.writeFileSync(dumpPath, "fake dump contents");
  });
  return { runPgDump };
}

// ─────────────────────────────────────────────────────────────────────────
// restoreEnglish() core — host-local / report-integrity preconditions
// ─────────────────────────────────────────────────────────────────────────

describe("restoreEnglish() core", () => {
  test("aborts (10) when the production marker file is missing", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion));
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: tmpHomeDir(),
      })
    ).rejects.toMatchObject({ exitCode: 10 });
  });

  test("aborts (20) when the report's checksums do not verify (hand-edited report)", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion));
    const tampered: DiagnosisReport = { ...report, diagnosisId: "tampered-id" }; // checksum now stale
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report: tampered,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 20 });
  });

  test("aborts (20) when productionFingerprint.databaseName does not match the live database", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion), {
      productionFingerprint: {
        databaseName: "some-other-database",
        lessonCount: 1,
        maxMasterId: 1,
        maxLessonStringId: 1,
      },
    });
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 20 });
  });

  test("aborts (11) when identity.snapshotIsOlder is false", async () => {
    const productionVersion = await currentLessonVersion();
    const affectedLesson = baseAffectedLesson(productionVersion);
    const report = await baseValidReport(affectedLesson, {
      identity: {
        productionMarkerPresent: true,
        snapshotConfirmationToken: "confirmed-by-operator",
        productionLessonVersion: affectedLesson.productionVersion,
        snapshotLessonVersion: affectedLesson.snapshotVersion,
        snapshotIsOlder: false,
      },
    });
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 11 });
  });

  test("aborts (15) when languageIdentityChecks is empty", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion), {
      languageIdentityChecks: [],
    });
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 15 });
  });

  test("aborts (15) when a languageIdentityChecks entry disagrees", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion), {
      languageIdentityChecks: [
        {
          matchedBy: "code",
          key: "ENG",
          snapshotLanguageId: 1,
          productionLanguageId: 2,
          snapshotCode: "ENG",
          productionCode: "ENG",
          snapshotName: "English",
          productionName: "English",
          agrees: false,
        },
      ],
    });
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 15 });
  });

  test("aborts (21) when the live production lesson version no longer matches the report", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion + 5)); // drifted
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 21 });
  });

  test("(21) compares against englishRestore.newLessonVersion when present, not productionVersion", async () => {
    const productionVersion = await currentLessonVersion();
    const affectedLesson = baseAffectedLesson(productionVersion - 1); // stale productionVersion
    const report = await baseValidReport(affectedLesson, {
      englishRestore: {
        method: "upload",
        masterDocumentPath: "/tmp/prior.odt",
        masterDocumentSha256: "deadbeef",
        newLessonVersion: productionVersion, // matches live — should be checked against THIS
        dumpPath: "/tmp/prior-dump.dump",
        restoredAt: "2026-08-13T00:00:00.000Z",
        carriedFromDiagnosisId: null,
      },
    });
    // Reaches past precondition 21 into the lock/dump path (which then fails
    // for an unrelated reason — no real advisory lock/pg_dump doubled here —
    // proving 21 did NOT fire is what this test asserts).
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps({ tryLock: jest.fn(async () => false) }),
      })
    ).rejects.toMatchObject({ exitCode: 28 });
  });

  // ── lock / dump / upload path (everything doubled) ──────────────────

  test("aborts (28) when the advisory lock is already held", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion));
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps({ tryLock: jest.fn(async () => false) }),
      })
    ).rejects.toMatchObject({ exitCode: 28 });
  });

  test("takes the advisory lock BEFORE the dump (call-order asserted)", async () => {
    const productionVersion = await currentLessonVersion();
    const dumpDir = tmpReportDir();
    const docsRoot = tmpReportDir();
    const masterDocumentPath = writeFile(docsRoot, "Luke-1-01v157.odt", "the pre-incident master");
    const candidate = candidateFor(masterDocumentPath);
    const affectedLesson = baseAffectedLesson(productionVersion, [candidate]);
    const report = await baseValidReport(affectedLesson);

    const calls: string[] = [];
    const advisoryLockOps = makeAdvisoryLockOps({
      tryLock: jest.fn(async () => {
        calls.push("lock");
        return true;
      }),
    });
    const runPgDump: RunPgDump = jest.fn(async ({ dumpPath }) => {
      calls.push("dump");
      fs.writeFileSync(dumpPath, "fake dump contents");
    });

    const updated = await restoreEnglish({
      productionSql: sql(),
      report,
      masterDocumentPath,
      docsRoot,
      dumpDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps,
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump,
      deps: makeDeps(),
      fileModeOps: passthroughFileModeOps,
    });

    expect(calls).toEqual(["lock", "dump"]);
    expect(updated.englishRestore).toBeTruthy();
    expect(updated.englishRestore!.dumpPath).toContain(dumpDir);
  });

  test("aborts (28) when the lock is found lost before use (never silently re-acquires)", async () => {
    const productionVersion = await currentLessonVersion();
    const docsRoot = tmpReportDir();
    const masterDocumentPath = writeFile(docsRoot, "Luke-1-01v157.odt", "the pre-incident master");
    const candidate = candidateFor(masterDocumentPath);
    const report = await baseValidReport(baseAffectedLesson(productionVersion, [candidate]));

    let pidCall = 0;
    const advisoryLockOps = makeAdvisoryLockOps({
      backendPid: jest.fn(async () => {
        pidCall += 1;
        return pidCall === 1 ? 4242 : 9999; // the reserved connection was silently replaced
      }),
    });

    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath,
        docsRoot,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps,
        diskHeadroomOps: makeDiskHeadroomOps(),
        runPgDump: makeRunPgDump().runPgDump,
        deps: makeDeps(),
      })
    ).rejects.toMatchObject({ exitCode: 28 });
  });

  test("aborts (23) when free disk space is below 3x the database size", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion));
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps({
          getDatabaseSizeBytes: jest.fn(async () => 1_000_000),
          getFreeDiskBytes: jest.fn(() => 100),
        }),
      })
    ).rejects.toMatchObject({ exitCode: 23 });
  });

  test("(23) cumulative headroom: a pre-existing dump file already in --dump is accounted for", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion));
    const dumpDir = tmpReportDir();

    // Simulates a small disk: capacity minus whatever is ALREADY on disk in
    // dumpDir (real fs.readdirSync/statSync — not a static double), so a
    // dump already sitting there from an earlier step of this recovery
    // shows up as reduced free space on the very next headroom check.
    const totalCapacityBytes = 3_500; // just over 3x a 1_000-byte "database"
    const getFreeDiskBytes = jest.fn((dir: string) => {
      const used = fs
        .readdirSync(dir)
        .reduce((total, name) => total + fs.statSync(path.join(dir, name)).size, 0);
      return totalCapacityBytes - used;
    });

    // Without a pre-existing dump, there's enough headroom.
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir,
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps({ tryLock: jest.fn(async () => false) }), // stop before dep-double gaps
        diskHeadroomOps: makeDiskHeadroomOps({
          getDatabaseSizeBytes: jest.fn(async () => 1_000),
          getFreeDiskBytes,
        }),
      })
      // The lock check runs before the dump/headroom check, so this first
      // call proves nothing about headroom yet — the real assertion is the
      // second call below, once a dump file already exists in dumpDir.
    ).rejects.toMatchObject({ exitCode: 28 });

    fs.writeFileSync(path.join(dumpDir, "earlier-step.dump"), "x".repeat(1_000)); // consumes 1000 bytes

    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/does-not-matter.odt",
        dumpDir,
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps({
          getDatabaseSizeBytes: jest.fn(async () => 1_000),
          getFreeDiskBytes,
        }),
      })
      // 3500 - 1000 (pre-existing dump) = 2500 free, short of the 3x1000=3000 required.
    ).rejects.toMatchObject({ exitCode: 23 });
  });

  test("aborts (22) when --master-document is not a verified candidateMasterDocuments entry", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseValidReport(baseAffectedLesson(productionVersion)); // no candidates
    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath: "/tmp/not-a-verified-candidate.odt",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps(),
        runPgDump: makeRunPgDump().runPgDump,
        deps: makeDeps(),
      })
    ).rejects.toMatchObject({ exitCode: 22 });
  });

  test("aborts (31) when the restored file's mode/owner cannot be repaired to match its sibling", async () => {
    const productionVersion = await currentLessonVersion();
    const docsRoot = tmpReportDir();
    const masterDocumentPath = writeFile(docsRoot, "Luke-1-01v157.odt", "the pre-incident master");
    const candidate = candidateFor(masterDocumentPath);
    const report = await baseValidReport(baseAffectedLesson(productionVersion, [candidate]));

    const mismatchedModeOwner: ModeOwner = { mode: 0o644, uid: 501, gid: 20 };
    const expectedModeOwner: ModeOwner = { mode: 0o664, uid: 502, gid: 20 };
    const fileModeOps: FileModeOps = {
      stat: jest.fn((filepath: string) =>
        filepath === masterDocumentPath ? expectedModeOwner : mismatchedModeOwner
      ),
      chmod: jest.fn(), // no-op: repair never actually takes effect
      chown: jest.fn(() => {
        throw new Error("chown requires root");
      }),
    };

    await expect(
      restoreEnglish({
        productionSql: sql(),
        report,
        masterDocumentPath,
        docsRoot,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps(),
        runPgDump: makeRunPgDump().runPgDump,
        deps: makeDeps(),
        fileModeOps,
      })
    ).rejects.toMatchObject({ exitCode: 31 });
  });

  test("succeeds (0): appends englishRestore, recomputes reportChecksum, releases the lock", async () => {
    const productionVersion = await currentLessonVersion();
    const docsRoot = tmpReportDir();
    const masterDocumentPath = writeFile(docsRoot, "Luke-1-01v157.odt", "the pre-incident master");
    const candidate = candidateFor(masterDocumentPath);
    const report = await baseValidReport(baseAffectedLesson(productionVersion, [candidate]));
    const dumpDir = tmpReportDir();

    const advisoryLockOps = makeAdvisoryLockOps();
    const deps = makeDeps();

    const updated = await restoreEnglish({
      productionSql: sql(),
      report,
      masterDocumentPath,
      docsRoot,
      dumpDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps,
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      deps,
      fileModeOps: passthroughFileModeOps,
    });

    expect(updated.mode).toBe("restore-english");
    expect(updated.englishRestore).toBeTruthy();
    expect(updated.englishRestore!.method).toBe("upload");
    expect(updated.englishRestore!.masterDocumentPath).toBe(masterDocumentPath);
    expect(updated.englishRestore!.newLessonVersion).toBe(159);
    expect(() =>
      verifyReportIntegrity(updated, report.productionFingerprint.databaseName)
    ).not.toThrow();
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.webify).toHaveBeenCalledTimes(1);
    expect(advisoryLockOps.unlock).toHaveBeenCalledTimes(1); // released even on the happy path
    // The source document survives being used (I15, the copy shim) — still
    // readable at its original path afterward.
    expect(fs.readFileSync(masterDocumentPath, "utf8")).toBe("the pre-incident master");
  });

  test("advisoryLockKey() is a stable, deterministic bigint", () => {
    expect(advisoryLockKey()).toBe(advisoryLockKey());
    expect(typeof advisoryLockKey()).toBe("bigint");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// apply() — task 5.8.4
// ─────────────────────────────────────────────────────────────────────────
//
// Fixture: lessonId 11 (Luke 1-1), masterId 1, languageId 2 (Français) —
// fixtures-0.json seeds tstrings(masterid=1, languageid=2) with real text;
// each test below DELETEs that row first so its own scenario controls
// whether production holds a value for the pair under test (I11's whole
// point is comparing live production against the plan).

/** The transactional test double IS a real `Persistence` (it extends
 * `PGStorage`, `TransactionalTestStorage` just swaps in the per-test
 * transactional `sql`) — passing it as `apply()`'s `persistence` makes
 * `saveTStrings` run on the SAME connection/transaction as `sql()` above.
 * `apply()`'s own default (`new PGStorage()`) opens a SEPARATE pooled
 * connection outside this test's transaction, which deadlocks against any
 * row this test's transaction has already touched (e.g. `clearFrenchMaster1`'s
 * DELETE) — every apply() test that expects a REAL write to land must pass
 * this. */
function testPersistence(): Pick<Persistence, "saveTStrings"> & {
  updateProgress?: () => Promise<void>;
} {
  return (global as any).testStorage;
}

const FRENCH_ID = 2;
const RESTORE_MASTER_ID = 1;

async function clearFrenchMaster1(): Promise<void> {
  await sql()`DELETE FROM tstrings WHERE masterid=${RESTORE_MASTER_ID} AND languageid=${FRENCH_ID}`;
}

async function frenchMaster1Text(): Promise<string | null> {
  const rows = await sql()`
    SELECT text FROM tstrings WHERE masterid=${RESTORE_MASTER_ID} AND languageid=${FRENCH_ID} AND lessonstringid IS NULL
  `;
  return rows[0]?.text ?? null;
}

function applyMappings(overrides: Partial<MasterStringMapping> = {}): MasterStringMapping[] {
  return [
    {
      snapshotMasterId: RESTORE_MASTER_ID,
      productionMasterId: RESTORE_MASTER_ID,
      englishText: "The Book of Luke and the Birth of John the Baptizer",
      type: "content",
      xpath: "/x",
      position: 0,
      matchMethod: "identicalText",
      reachableInProduction: true,
      sharedWithLessons: [],
      ...overrides,
    },
  ];
}

function applyFindings(overrides: Partial<TranslationFinding> = {}): TranslationFinding[] {
  return [
    {
      languageId: FRENCH_ID,
      languageName: "Français",
      languageArchived: false,
      snapshotMasterId: RESTORE_MASTER_ID,
      productionMasterId: RESTORE_MASTER_ID,
      classification: "restore",
      snapshotText: "Le livre de Luc restauré",
      productionText: null,
      productionModified: null,
      legacyLessonStringId: null,
      sampleEnglishText: "The Book of Luke and the Birth of John the Baptizer",
      ...overrides,
    },
  ];
}

function applyPerLanguageCounts(overrides: Partial<LanguageCounts> = {}): LanguageCounts[] {
  return [
    {
      languageId: FRENCH_ID,
      languageName: "Français",
      archived: false,
      snapshotReachable: 1,
      productionReachableBefore: 0,
      productionReachableAfter: null,
      restored: 1,
      conflicts: 0,
      newerWork: 0,
      lost: 0,
      driftSkipped: 0,
      ...overrides,
    },
  ];
}

function applyEnglishRestore(
  newLessonVersion: number,
  overrides: Partial<EnglishRestore> = {}
): EnglishRestore {
  return {
    method: "upload",
    masterDocumentPath: null,
    masterDocumentSha256: null,
    newLessonVersion,
    dumpPath: "/tmp/does-not-matter-english-restore.dump",
    restoredAt: new Date().toISOString(),
    carriedFromDiagnosisId: null,
    ...overrides,
  };
}

async function baseApplyReport(overrides: Partial<DiagnosisReport> = {}): Promise<DiagnosisReport> {
  const productionVersion = await currentLessonVersion();
  const affectedLesson = baseAffectedLesson(productionVersion);
  return baseValidReport(affectedLesson, {
    mappings: applyMappings(),
    findings: applyFindings(),
    perLanguageCounts: applyPerLanguageCounts(),
    englishRestore: applyEnglishRestore(productionVersion),
    ...overrides,
  });
}

describe("apply() core", () => {
  beforeEach(async () => {
    await clearFrenchMaster1();
  });

  test("aborts (10) when the production marker file is missing", async () => {
    const report = await baseApplyReport();
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: tmpHomeDir(),
      })
    ).rejects.toMatchObject({ exitCode: 10 });
  });

  test("aborts (20) when the report's checksums do not verify (hand-edited report)", async () => {
    const report = await baseApplyReport();
    const tampered: DiagnosisReport = { ...report, diagnosisId: "tampered-id" };
    await expect(
      apply({
        productionSql: sql(),
        report: tampered,
        diagnosisId: tampered.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 20 });
  });

  test("aborts (20) when --diagnosis-id does not match the report's diagnosisId", async () => {
    const report = await baseApplyReport();
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: "some-other-diagnosis-id",
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 20 });
  });

  test("aborts (11) when identity.snapshotIsOlder is false", async () => {
    const productionVersion = await currentLessonVersion();
    const affectedLesson = baseAffectedLesson(productionVersion);
    const report = await baseApplyReport({
      identity: {
        productionMarkerPresent: true,
        snapshotConfirmationToken: "confirmed-by-operator",
        productionLessonVersion: affectedLesson.productionVersion,
        snapshotLessonVersion: affectedLesson.snapshotVersion,
        snapshotIsOlder: false,
      },
    });
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 11 });
  });

  test("aborts (15) when languageIdentityChecks is empty", async () => {
    const report = await baseApplyReport({ languageIdentityChecks: [] });
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 15 });
  });

  test("aborts (29) when affectedLessons does not contain exactly one entry", async () => {
    const productionVersion = await currentLessonVersion();
    const affectedLesson = baseAffectedLesson(productionVersion);
    const report = await baseApplyReport({ affectedLessons: [affectedLesson, affectedLesson] });
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 29 });
  });

  test("aborts (24) when the report has no englishRestore entry (own or carried)", async () => {
    const productionVersion = await currentLessonVersion();
    const affectedLesson = baseAffectedLesson(productionVersion);
    const withoutEnglishRestore = await baseValidReport(affectedLesson, {
      mappings: applyMappings(),
      findings: applyFindings(),
      perLanguageCounts: applyPerLanguageCounts(),
    });
    await expect(
      apply({
        productionSql: sql(),
        report: withoutEnglishRestore,
        diagnosisId: withoutEnglishRestore.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 24 });
  });

  test("aborts (21) when live production's lesson version no longer matches englishRestore.newLessonVersion", async () => {
    const productionVersion = await currentLessonVersion();
    const report = await baseApplyReport({
      englishRestore: applyEnglishRestore(productionVersion + 5), // drifted
    });
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 21 });
  });

  test("aborts (25) when the plan exceeds the computed --max-writes default, BEFORE any write", async () => {
    // snapshotReachable=0 -> computed cap floor(0*1.2)=0, but the plan has 1 write.
    const report = await baseApplyReport({
      perLanguageCounts: applyPerLanguageCounts({ snapshotReachable: 0 }),
    });
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
      })
    ).rejects.toMatchObject({ exitCode: 25 });
    // No write happened.
    expect(await frenchMaster1Text()).toBeNull();
  });

  test("aborts (25) when the plan exceeds an explicit --max-writes", async () => {
    const report = await baseApplyReport();
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        maxWrites: 0,
      })
    ).rejects.toMatchObject({ exitCode: 25 });
  });

  test("computeMaxWritesDefault: sums snapshotReachable over scoped languages only, x1.2, floored", () => {
    const productionVersion = 159;
    const affectedLesson = baseAffectedLesson(productionVersion);
    const report = { affectedLessons: [affectedLesson] } as unknown as DiagnosisReport;
    const withCounts: DiagnosisReport = {
      ...report,
      perLanguageCounts: [
        { ...applyPerLanguageCounts()[0], languageId: 2, snapshotReachable: 5 },
        { ...applyPerLanguageCounts()[0], languageId: 3, snapshotReachable: 5 },
      ],
    };
    expect(computeMaxWritesDefault(withCounts, null)).toBe(12); // floor(10*1.2)
    expect(computeMaxWritesDefault(withCounts, [2])).toBe(6); // floor(5*1.2)
  });

  test("aborts (28) when the advisory lock is already held", async () => {
    const report = await baseApplyReport();
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps({ tryLock: jest.fn(async () => false) }),
      })
    ).rejects.toMatchObject({ exitCode: 28 });
  });

  test("aborts (28) when the lock is found lost before a batch (never silently re-acquires)", async () => {
    const report = await baseApplyReport();
    const backendPid = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(4242) // captured right after tryLock
      .mockResolvedValueOnce(9999); // different pid before the one batch -> lock lost
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps({ backendPid }),
        diskHeadroomOps: makeDiskHeadroomOps(),
        runPgDump: makeRunPgDump().runPgDump,
      })
    ).rejects.toMatchObject({ exitCode: 28 });
    // No write happened — the batch never ran.
    expect(await frenchMaster1Text()).toBeNull();
  });

  test("aborts (23) when free disk space is below 3x the database size", async () => {
    const report = await baseApplyReport();
    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: tmpReportDir(),
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps({ getFreeDiskBytes: jest.fn(() => 1) }),
      })
    ).rejects.toMatchObject({ exitCode: 23 });
  });

  test("succeeds (0): applies the plan, records appliedWrites, releases the lock", async () => {
    const report = await baseApplyReport();
    const advisoryLockOps = makeAdvisoryLockOps();
    const dumpDir = tmpReportDir();

    const updated = await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps,
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
    });

    expect(updated.mode).toBe("apply");
    expect(await frenchMaster1Text()).toBe("Le livre de Luc restauré");
    expect(
      updated.appliedWrites?.some(
        (w) =>
          w.languageId === FRENCH_ID && w.masterId === RESTORE_MASTER_ID && w.overwrote === null
      )
    ).toBe(true);
    expect(updated.applyState?.scopedLanguageIds).toBeNull();
    expect(updated.applyState?.completedAt).toBeTruthy();
    expect(updated.applyState?.languageBatches).toEqual([
      expect.objectContaining({ languageId: FRENCH_ID, status: "completed", writesApplied: 1 }),
    ]);
    expect(updated.preApplyDumpPath).toBeTruthy();
    expect(fs.existsSync(updated.preApplyDumpPath!)).toBe(true);
    expect(advisoryLockOps.unlock).toHaveBeenCalledTimes(1);
    expect(() =>
      verifyReportIntegrity(updated, report.productionFingerprint.databaseName)
    ).not.toThrow();
  });

  test("records applyState.scopedLanguageIds as the --languages array when scoped", async () => {
    const report = await baseApplyReport();
    const updated = await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir: tmpReportDir(),
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
      languages: [FRENCH_ID],
    });
    expect(updated.applyState?.scopedLanguageIds).toEqual([FRENCH_ID]);
  });

  test("I11 drift re-check: a row that changed to a benign identical value is skipped and marked benign", async () => {
    // Live production already holds the exact snapshot text (as if a
    // concurrent process wrote it) — still classifies 'restore' at diagnose
    // time in this report (stale), but the re-check must see it's now intact.
    await sql()`
      INSERT INTO tstrings (masterid, languageid, text, history, created, modified)
      VALUES (${RESTORE_MASTER_ID}, ${FRENCH_ID}, 'Le livre de Luc restauré', '[]', 0, 0)
    `;
    const report = await baseApplyReport();

    const updated = await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir: tmpReportDir(),
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
    });

    expect(updated.appliedWrites?.length ?? 0).toBe(0);
    expect(updated.driftSkips).toEqual([
      expect.objectContaining({
        languageId: FRENCH_ID,
        masterId: RESTORE_MASTER_ID,
        reclassifiedAs: "intact",
        benign: true,
      }),
    ]);
    const nonBenignDrift = (updated.driftSkips ?? []).some((d) => !d.benign);
    expect(nonBenignDrift).toBe(false);
  });

  test("I11 drift re-check: a row changed to a DIFFERENT value is withheld, non-benign, and reported as a conflict", async () => {
    await sql()`
      INSERT INTO tstrings (masterid, languageid, text, history, created, modified)
      VALUES (${RESTORE_MASTER_ID}, ${FRENCH_ID}, 'Un texte totalement différent', '[]', 0, 0)
    `;
    const report = await baseApplyReport();

    const updated = await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir: tmpReportDir(),
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
    });

    expect(updated.appliedWrites?.length ?? 0).toBe(0);
    expect(updated.driftSkips).toEqual([
      expect.objectContaining({
        languageId: FRENCH_ID,
        masterId: RESTORE_MASTER_ID,
        reclassifiedAs: "conflict",
        benign: false,
      }),
    ]);
    expect(
      updated.conflicts.some(
        (c) => c.languageId === FRENCH_ID && c.snapshotMasterId === RESTORE_MASTER_ID
      )
    ).toBe(true);
    // Untouched — apply never overwrites a value it didn't itself write the
    // pre-incident text for.
    expect(await frenchMaster1Text()).toBe("Un texte totalement différent");
  });

  test("I24: a saveTStrings throw stops the run, marks the batch failed, and flushes applyState+journal", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const failingPersistence = {
      saveTStrings: jest.fn(async () => {
        throw new Error("simulated disk full");
      }),
    };

    await expect(
      apply({
        productionSql: sql(),
        report,
        diagnosisId: report.diagnosisId,
        dumpDir: reportDir,
        homeDir: homeDirWithMarker(),
        withReservedConnection: bypassReservedConnection,
        advisoryLockOps: makeAdvisoryLockOps(),
        diskHeadroomOps: makeDiskHeadroomOps(),
        runPgDump: makeRunPgDump().runPgDump,
        persistence: failingPersistence,
        reportPath,
      })
    ).rejects.toMatchObject({ exitCode: 32 });

    // The report was flushed with a failed batch record (I12).
    const flushed: DiagnosisReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(flushed.applyState?.languageBatches).toEqual([
      expect.objectContaining({ languageId: FRENCH_ID, status: "failed" }),
    ]);
    expect(flushed.appliedWrites?.length ?? 0).toBe(0);

    // The journal exists, derived from the report's own basename.
    const journalPath = journalPathForReport(reportPath);
    expect(fs.existsSync(journalPath)).toBe(false); // nothing to journal — no write succeeded
    expect(await frenchMaster1Text()).toBeNull();
  });

  test("I12: applyState/appliedWrites/driftSkips are flushed after every batch, atomically, with a journal derived from the report path", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "my-report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir: reportDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
      reportPath,
    });

    const journalPath = journalPathForReport(reportPath);
    expect(journalPath).toBe(path.join(reportDir, "my-report.journal.jsonl"));
    expect(fs.existsSync(journalPath)).toBe(true);
    const lines = readJournalLines(journalPath);
    expect(
      lines.some((l) => l.type === "appliedWrite" && l.diagnosisId === report.diagnosisId)
    ).toBe(true);

    const flushed: DiagnosisReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(flushed.appliedWrites?.length ?? 0).toBe(1);
    expect(() =>
      verifyReportIntegrity(flushed, report.productionFingerprint.databaseName)
    ).not.toThrow();
  });

  test("I5: re-running apply against an already-fully-applied report writes nothing", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const firstRun = await apply({
      productionSql: sql(),
      report,
      diagnosisId: report.diagnosisId,
      dumpDir: reportDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
      reportPath,
    });
    expect(firstRun.appliedWrites?.length ?? 0).toBe(1);

    const secondRun = await apply({
      productionSql: sql(),
      report: firstRun,
      diagnosisId: firstRun.diagnosisId,
      dumpDir: reportDir,
      homeDir: homeDirWithMarker(),
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
      reportPath,
    });

    // The re-check reclassifies the pair as 'intact' (benign) — nothing new
    // is applied, and the journal-reconciled appliedWrites still shows just
    // the original write (accumulated across runs against the same report).
    const newlyApplied = secondRun.applyState?.languageBatches.find(
      (b) => b.completedAt !== firstRun.applyState?.languageBatches[0]?.completedAt
    );
    expect(newlyApplied?.writesApplied).toBe(0);
    expect(await frenchMaster1Text()).toBe("Le livre de Luc restauré");
  });
});

describe("parseApplyArgs", () => {
  test("parses required and optional flags", () => {
    const args = parseApplyArgs([
      "--report",
      "/rec/report.json",
      "--diagnosis-id",
      "abc-123",
      "--dump",
      "/rec/dumps",
      "--languages",
      "2,3",
      "--max-writes",
      "50",
    ]);
    expect(args).toEqual({
      report: "/rec/report.json",
      diagnosisId: "abc-123",
      dump: "/rec/dumps",
      languages: [2, 3],
      maxWrites: 50,
    });
  });

  test("defaults dump/languages/maxWrites to null when omitted", () => {
    const args = parseApplyArgs(["--report", "/rec/report.json", "--diagnosis-id", "abc-123"]);
    expect(args.dump).toBeNull();
    expect(args.languages).toBeNull();
    expect(args.maxWrites).toBeNull();
  });

  test("aborts (1) when --report is missing", () => {
    expect(() => parseApplyArgs(["--diagnosis-id", "abc-123"])).toThrow(
      expect.objectContaining({ exitCode: 1 })
    );
  });

  test("aborts (1) when --diagnosis-id is missing", () => {
    expect(() => parseApplyArgs(["--report", "/rec/report.json"])).toThrow(
      expect.objectContaining({ exitCode: 1 })
    );
  });

  test("aborts (1) on an unrecognized flag", () => {
    expect(() => parseApplyArgs(["--bogus", "x"])).toThrow(
      expect.objectContaining({ exitCode: 1 })
    );
  });

  test("aborts (1) when --languages contains a non-integer value", () => {
    expect(() =>
      parseApplyArgs(["--report", "r", "--diagnosis-id", "d", "--languages", "2,abc"])
    ).toThrow(expect.objectContaining({ exitCode: 1 }));
  });

  test("aborts (1) when --max-writes is not a non-negative integer", () => {
    expect(() =>
      parseApplyArgs(["--report", "r", "--diagnosis-id", "d", "--max-writes", "-1"])
    ).toThrow(expect.objectContaining({ exitCode: 1 }));
  });
});

describe("runApplyCommand()", () => {
  beforeEach(async () => {
    await clearFrenchMaster1();
  });

  test("aborts (1) when a required flag is missing", async () => {
    const code = await runApplyCommand({ argv: ["--report", "/rec/report.json"] });
    expect(code).toBe(1);
  });

  test("aborts (10) when the production marker file is missing", async () => {
    const code = await runApplyCommand({
      argv: ["--report", "/rec/report.json", "--diagnosis-id", "abc"],
      homeDir: tmpHomeDir(),
    });
    expect(code).toBe(10);
  });

  test("aborts (20) when the report file does not exist", async () => {
    const code = await runApplyCommand({
      argv: ["--report", path.join(tmpReportDir(), "missing.json"), "--diagnosis-id", "abc"],
      homeDir: homeDirWithMarker(),
    });
    expect(code).toBe(20);
  });

  test("aborts (20) when --diagnosis-id does not match the report's diagnosisId", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const code = await runApplyCommand({
      argv: ["--report", reportPath, "--diagnosis-id", "not-the-right-id"],
      homeDir: homeDirWithMarker(),
    });
    expect(code).toBe(20);
  });

  test("succeeds (0), applies the plan, and prints an OK summary", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const stdoutLines: string[] = [];
    const code = await runApplyCommand({
      argv: ["--report", reportPath, "--diagnosis-id", report.diagnosisId],
      homeDir: homeDirWithMarker(),
      stdout: (line) => stdoutLines.push(line),
      connectProduction: () => sql(),
      closeSql: async () => undefined,
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: testPersistence(),
    });

    expect(code).toBe(0);
    expect(stdoutLines.join("\n")).toMatch(/^OK apply complete/);
    expect(await frenchMaster1Text()).toBe("Le livre de Luc restauré");
  });

  test("returns 27 when apply completes with non-benign drift", async () => {
    await sql()`
      INSERT INTO tstrings (masterid, languageid, text, history, created, modified)
      VALUES (${RESTORE_MASTER_ID}, ${FRENCH_ID}, 'Something else entirely', '[]', 0, 0)
    `;
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const stdoutLines: string[] = [];
    const code = await runApplyCommand({
      argv: ["--report", reportPath, "--diagnosis-id", report.diagnosisId],
      homeDir: homeDirWithMarker(),
      stdout: (line) => stdoutLines.push(line),
      connectProduction: () => sql(),
      closeSql: async () => undefined,
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
    });

    expect(code).toBe(27);
    expect(stdoutLines.join("\n")).toMatch(/^DRIFT/);
  });

  test("returns 32 when a language batch fails", async () => {
    const reportDir = tmpReportDir();
    const reportPath = path.join(reportDir, "report.json");
    const report = await baseApplyReport();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const stderrLines: string[] = [];
    const code = await runApplyCommand({
      argv: ["--report", reportPath, "--diagnosis-id", report.diagnosisId],
      homeDir: homeDirWithMarker(),
      stderr: (line) => stderrLines.push(line),
      connectProduction: () => sql(),
      closeSql: async () => undefined,
      withReservedConnection: bypassReservedConnection,
      advisoryLockOps: makeAdvisoryLockOps(),
      diskHeadroomOps: makeDiskHeadroomOps(),
      runPgDump: makeRunPgDump().runPgDump,
      persistence: {
        saveTStrings: jest.fn(async () => {
          throw new Error("simulated saveTStrings failure");
        }),
      },
    });

    expect(code).toBe(32);
    expect(stderrLines.join("\n")).toMatch(/journal/i);
  });
});
