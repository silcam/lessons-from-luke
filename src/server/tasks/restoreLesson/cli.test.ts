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
import { verifyReportIntegrity } from "./report";
import { fetchAllLanguages, fetchLegacyScopedCount, fetchTStringsForLesson } from "./gateway";
import {
  diagnose,
  parseDiagnoseArgs,
  redactConnectionString,
  redactDeep,
  runDiagnoseCommand,
  scanCandidateMasterDocuments,
  SnapshotBundle,
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
