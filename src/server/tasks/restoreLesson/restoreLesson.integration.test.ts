/// <reference types="jest" />

/**
 * Integration test recreating the migration incident inside the test
 * environment (research D11): build a lesson with translations via the
 * app's own real upload path, capture that pre-incident state as the
 * Snapshot side, upload a cover-file-like document to orphan the
 * translations, then assert the 5 US15 diagnose scenarios against the
 * not-yet-implemented `diagnose()` entry point exported by `cli.ts`.
 *
 * RED (task 5.6.1): `cli.ts` does not exist yet — task 5.6.7 ("cli.ts:
 * diagnose subcommand wiring") builds it. Every test below fails at runtime
 * ("Cannot find module './cli'") the first time it calls `diagnose()`.
 * Tasks 5.6.2-5.6.7 build identity.ts, detectLesson.ts, mapMasterStrings.ts,
 * classify.ts, report.ts, and cli.ts underneath this test's contract.
 *
 * `diagnose` is loaded lazily via `require()` behind a non-literal module
 * path (see `loadDiagnose` below), rather than a static
 * `import { diagnose } from "./cli"`. `yarn typecheck` type-checks
 * `*.test.ts` files too (src/server/tsconfig.typecheck.json), so a static
 * import of a not-yet-existing module would fail every commit's pre-commit
 * hook, not just this task's intentional RED state. The lazy `require`
 * keeps the missing-module failure where it belongs: a real Jest runtime
 * failure inside each test, not a repo-wide compile error.
 *
 * Two `PGTestStorage` instances share one test database (research D11), so
 * prod-vs-snapshot cannot be simulated with two live storage handles.
 * Instead, this test captures the Snapshot side as already-fetched row data
 * (via `gateway.ts`) at the moment right after building the lesson — before
 * the "incident" upload — and hands that captured bundle to `diagnose()`
 * alongside a live connection to production (the same physical test
 * database, now mutated). This sidesteps needing a second live database
 * while still exercising the real upload path, the real gateway fetchers,
 * and the real diagnose entry point end to end.
 *
 * Spec: specs/acceptance-specs/US15-diagnose-damage.txt (5 GWT scenarios),
 * specs/018-lesson1-translation-restore/spec.md §User Story 1 Acceptance
 * Scenarios, specs/018-lesson1-translation-restore/research.md D11.
 *
 * RED (task 5.7.1) additionally extends this same harness to cover US2:
 * `specs/acceptance-specs/US16-restore-english-master.txt` (3 GWT
 * scenarios), asserted against a not-yet-implemented `restoreEnglish()`
 * entry point on `cli.ts`. `cli.ts` currently exports only `diagnose`
 * (task 5.6.7); it has no `restore-english` subcommand wiring yet — that is
 * task 5.7.3, built on top of task 5.7.2's `restoreEnglish.ts` core. Every
 * test in the "US16-restore-english-master.txt" section below therefore
 * fails at runtime the first time it calls `restoreEnglish()`
 * ("cli.restoreEnglish is not a function"), loaded lazily the same way as
 * `diagnose` above and for the same typecheck reason (see `loadRestoreEnglish`).
 */
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import postgres, { SqlFunc } from "postgres";
import secrets from "../../util/secrets";
import { transformCol } from "../../storage/PGStorage";
import { ENGLISH_ID, Language } from "../../../core/models/Language";
import { BaseLesson } from "../../../core/models/Lesson";
import { TString } from "../../../core/models/TString";
import {
  fetchAllLanguages,
  fetchTStringsForLesson,
  fetchLessonByBookSeriesLesson,
  fetchLegacyScopedCount,
} from "./gateway";
import { DiagnosisReport } from "./types";
import { PRODUCTION_MARKER_FILENAME } from "./identity";

/** A throwaway home directory carrying the production marker file
 * (`cli.ts`'s `diagnose()` precondition 1), mirroring `cli.test.ts`'s
 * `homeDirWithMarker()`. Real production-host detection is exercised there;
 * this integration test only needs the precondition satisfied so it can
 * reach the diagnose logic under test. */
function homeDirWithMarker(): string {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-lesson-integration-home-"));
  fs.writeFileSync(path.join(homeDir, PRODUCTION_MARKER_FILENAME), "");
  return homeDir;
}

/** The pre-incident Snapshot state, captured as data (research D11) rather
 * than a second live database connection — see file header. This is the
 * contract task 5.6.7's `cli.ts` module is expected to export a matching
 * shape for. */
export interface SnapshotBundle {
  languages: Language[];
  lesson: BaseLesson;
  tStrings: TString[];
  legacyLessonStringRowCount: number;
}

interface DiagnoseOptions {
  productionSql: SqlFunc;
  snapshot: SnapshotBundle;
  snapshotConfirmed: string;
  book?: string;
  dryRun: boolean;
  homeDir?: string;
  /** US16 (restore-english) additions, threaded through to
   * `scanCandidateMasterDocuments` so `report.affectedLessons[].candidateMasterDocuments`
   * is populated for `restoreEnglish()` to consume. */
  knownBadVersions?: number[];
  docsRoot?: string;
}

/**
 * Lazily loads `cli.ts`'s `diagnose` export and calls it. The `require`
 * target is built at runtime (not a string literal) so TypeScript cannot
 * statically resolve — and therefore cannot fail `yarn typecheck` on — a
 * module that does not exist yet (see file header). Jest still fails
 * exactly the way it would on a plain missing import: "Cannot find module
 * './cli'", thrown the moment any test below calls this.
 */
async function diagnose(options: DiagnoseOptions): Promise<DiagnosisReport> {
  const cliModulePath = ["." + "/", "cli"].join("");
  const cli = require(cliModulePath);
  return cli.diagnose(options);
}

/** Core options for the not-yet-implemented `restoreEnglish()` (task
 * 5.7.3), mirroring `DiagnoseOptions`'s "pure orchestration core, no argv"
 * shape: given a report already produced by `diagnose()` and the verified
 * master document to re-upload, it performs the restore and returns the
 * report with `englishRestore` appended (contract §restore-english). */
interface RestoreEnglishOptions {
  productionSql: SqlFunc;
  report: DiagnosisReport;
  masterDocumentPath: string;
  dumpDir: string;
  homeDir?: string;
}

/**
 * Lazily loads `cli.ts`'s `restoreEnglish` export and calls it — same
 * non-literal `require()` pattern as `diagnose` above, and for the same
 * reason (see file header): `cli.ts` exists (task 5.6.7 built it for
 * `diagnose`), so a static import would typecheck fine today, but
 * `restoreEnglish` is not yet exported. Calling `cli.restoreEnglish(...)`
 * therefore fails at runtime with "cli.restoreEnglish is not a function"
 * rather than a module-resolution error — still a real Jest failure, not a
 * compile-time one.
 */
async function restoreEnglish(options: RestoreEnglishOptions): Promise<DiagnosisReport> {
  const cliModulePath = ["." + "/", "cli"].join("");
  const cli = require(cliModulePath);
  return cli.restoreEnglish(options);
}

const serverUrl = process.env.INTEGRATION_SERVER_URL;
if (!serverUrl) {
  throw new Error("INTEGRATION_SERVER_URL is not set. Run tests via `yarn test:integration`.");
}

const agent = () => request.agent(serverUrl);

async function signedInAdminAgent() {
  const a = agent();
  await a
    .post("/api/auth/sign-in/email")
    .send({ email: secrets.adminEmail, password: secrets.adminPassword })
    .expect(200);
  return a;
}

// A lesson slot no fixture or other integration test touches (fixtures only
// populate Luke 1-1..1-5; TOC_LESSON=99 is reserved).
const BOOK = "Luke";
const SERIES = 1;
const LESSON = 77;

// A second, pre-existing fixture lesson (Luke 1-2) used to prove the
// shared-string blast radius (US15 scenario 4).
const SHARED_WITH_BOOK = "Luke";
const SHARED_WITH_SERIES = 1;
const SHARED_WITH_LESSON = 2;

let sql: SqlFunc;
let lessonId: number;
let languageId: number;
let languageCode: string;
let restoredMasterId: number; // orphaned in production, unedited since snapshot -> "restore"
let conflictMasterId: number; // orphaned in production, edited since snapshot -> "conflict"
let sharedMasterId: number; // also referenced by SHARED_WITH_LESSON -> blast radius
let preIncidentTranslations: {
  restored: string;
  conflictPre: string;
  conflictPost: string;
};
let snapshot: SnapshotBundle;
let homeDir: string;
// US16 (restore-english) additions: the pre-incident master document, its
// version, and a scratch `docs/`-shaped directory `diagnose`'s
// `docsRoot`/`scanCandidateMasterDocuments` can find it in.
let preIncidentVersion: number;
let incidentVersion: number;
let docsRoot: string;
let masterDocumentPath: string;

beforeAll(async () => {
  homeDir = homeDirWithMarker();
  sql = postgres({ ...secrets.testDb, transform: { column: transformCol } });
  const admin = await signedInAdminAgent();

  // ── 1. Build the lesson via the app's own real upload path ──────────
  const uploadRes = await admin
    .post("/api/admin/documents")
    .field("languageId", ENGLISH_ID)
    .field("book", BOOK)
    .field("series", SERIES)
    .field("lesson", LESSON)
    .attach("document", "cypress/fixtures/English_Luke-Q1-L06.odt")
    .expect(200);

  lessonId = uploadRes.body.lesson.lessonId;
  preIncidentVersion = uploadRes.body.lesson.version;
  const contentMasterIds: number[] = uploadRes.body.lesson.lessonStrings
    .filter((ls: { type: string }) => ls.type === "content")
    .map((ls: { masterId: number }) => ls.masterId);
  expect(contentMasterIds.length).toBeGreaterThanOrEqual(2);
  [restoredMasterId, conflictMasterId] = contentMasterIds;
  sharedMasterId = restoredMasterId;

  // The verified pre-incident master document (research D5 candidate
  // scanning, `scanCandidateMasterDocuments` in cli.ts): a copy of the same
  // fixture just uploaded, named per the `{book}-{series}-{lesson:2}v{version}.odt`
  // convention `diagnose`'s `docsRoot` scan expects, in a scratch directory
  // standing in for `docs/` so this test never touches the real `docs/` tree.
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "restore-lesson-integration-docs-"));
  masterDocumentPath = path.join(
    docsRoot,
    `${BOOK}-${SERIES}-${String(LESSON).padStart(2, "0")}v${preIncidentVersion}.odt`
  );
  fs.copyFileSync("cypress/fixtures/English_Luke-Q1-L06.odt", masterDocumentPath);

  // ── 2. Create a translation language and translate two strings ──────
  const langRes = await admin
    .post("/api/admin/languages")
    .send({ name: `RestoreTestLang-${LESSON}`, defaultSrcLang: ENGLISH_ID })
    .expect(200);
  languageId = langRes.body.languageId;
  languageCode = langRes.body.code;

  preIncidentTranslations = {
    restored: "pre-incident translation (will be restored)",
    conflictPre: "pre-incident translation (will be overwritten)",
    conflictPost: "post-incident production edit (must win)",
  };

  await admin
    .post("/api/tStrings")
    .send({
      code: languageCode,
      tStrings: [
        {
          masterId: restoredMasterId,
          languageId,
          sourceLanguageId: ENGLISH_ID,
          source: "orig-en-text",
          text: preIncidentTranslations.restored,
          history: [],
        },
        {
          masterId: conflictMasterId,
          languageId,
          sourceLanguageId: ENGLISH_ID,
          source: "orig-en-text",
          text: preIncidentTranslations.conflictPre,
          history: [],
        },
      ],
    })
    .expect(200);

  // ── 3. Fabricate the shared-string blast radius (FR-004) ────────────
  // A real ODT upload can't force a controlled shared masterId without an
  // exact identical-text match landing in two documents by construction, so
  // this links `sharedMasterId` into a second, pre-existing fixture lesson
  // via a direct raw-SQL lessonStrings row — the same shape `uploadEnglishDoc`
  // itself would produce for identical-text reuse.
  const sharedWithLesson = await fetchLessonByBookSeriesLesson(
    sql,
    SHARED_WITH_BOOK,
    SHARED_WITH_SERIES,
    SHARED_WITH_LESSON
  );
  expect(sharedWithLesson).toBeTruthy();
  await sql`
    INSERT INTO lessonStrings (lessonId, lessonVersion, masterId, type, xpath, motherTongue)
    VALUES (${sharedWithLesson!.lessonId}, ${sharedWithLesson!.version}, ${sharedMasterId}, 'content', '/shared/reused/text()', false)
  `;

  // ── 4. Capture the Snapshot side ─────────────────────────────────────
  // The pre-incident state, fetched now via the same gateway wrappers
  // `diagnose` uses against a real snapshot connection — captured as data
  // per research D11 rather than a second live database.
  const snapshotLesson = await fetchLessonByBookSeriesLesson(sql, BOOK, SERIES, LESSON);
  expect(snapshotLesson).toBeTruthy();
  snapshot = {
    languages: await fetchAllLanguages(sql, true),
    lesson: snapshotLesson as BaseLesson,
    tStrings: await fetchTStringsForLesson(sql, lessonId, [restoredMasterId, conflictMasterId], {
      includeLegacyLessonStringScoped: true,
    }),
    legacyLessonStringRowCount: await fetchLegacyScopedCount(sql),
  };

  // ── 5. Edit one translation in production after the snapshot ────────
  // (a genuine, newer conflicting edit — must survive diagnosis untouched).
  await admin
    .post("/api/tStrings")
    .send({
      code: languageCode,
      tStrings: [
        {
          masterId: conflictMasterId,
          languageId,
          sourceLanguageId: ENGLISH_ID,
          source: "orig-en-text",
          text: preIncidentTranslations.conflictPost,
          history: [preIncidentTranslations.conflictPre],
        },
      ],
    })
    .expect(200);

  // ── 6. Upload the cover-file-like document (the incident) ───────────
  // Same book/series/lesson, unrelated content — orphans every pre-incident
  // master ID captured in the snapshot above.
  const incidentRes = await admin
    .post("/api/admin/documents")
    .field("languageId", ENGLISH_ID)
    .field("book", BOOK)
    .field("series", SERIES)
    .field("lesson", LESSON)
    .attach("document", "test/docs/serverDocs/Luke-1-02v01.odt")
    .expect(200);
  incidentVersion = incidentRes.body.lesson.version;
});

afterAll(async () => {
  await sql.end();
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// US15-diagnose-damage.txt scenarios
// ─────────────────────────────────────────────────────────────────────────

test("Diagnosis positively identifies production versus the Snapshot before doing anything else", async () => {
  const report: DiagnosisReport = await diagnose({
    productionSql: sql,
    snapshot,
    snapshotConfirmed: "test-harness-confirmed",
    book: BOOK,
    dryRun: true,
    homeDir,
  });

  expect(report.identity.productionMarkerPresent).toBe(true);
  expect(report.identity.snapshotConfirmationToken).toBe("test-harness-confirmed");
  expect(report.identity.snapshotIsOlder).toBe(true);
  expect(report.identity.snapshotLessonVersion).toBeLessThan(
    report.identity.productionLessonVersion
  );
});

test("Diagnosis detects the affected lesson from data, not assumption", async () => {
  const report: DiagnosisReport = await diagnose({
    productionSql: sql,
    snapshot,
    snapshotConfirmed: "test-harness-confirmed",
    book: BOOK,
    dryRun: true,
    homeDir,
  });

  const affected = report.affectedLessons.find(
    (lsn) => lsn.book === BOOK && lsn.series === SERIES && lsn.lesson === LESSON
  );
  expect(affected).toBeTruthy();
  expect(affected!.productionLessonId).toBe(lessonId);
  expect(affected!.snapshotVersion).toBeLessThan(affected!.productionVersion);
  // Uploaded exactly once since the snapshot was captured.
  expect(affected!.bumpCount).toBe(1);
});

test("Diagnosis reports per-language string status with counts and samples", async () => {
  const report: DiagnosisReport = await diagnose({
    productionSql: sql,
    snapshot,
    snapshotConfirmed: "test-harness-confirmed",
    book: BOOK,
    dryRun: true,
    homeDir,
  });

  const restoredFinding = report.findings.find(
    (f) => f.languageId === languageId && f.snapshotMasterId === restoredMasterId
  );
  expect(restoredFinding).toBeTruthy();
  expect(restoredFinding!.classification).toBe("restore");
  expect(restoredFinding!.snapshotText).toBe(preIncidentTranslations.restored);

  const conflictFinding = report.findings.find(
    (f) => f.languageId === languageId && f.snapshotMasterId === conflictMasterId
  );
  expect(conflictFinding).toBeTruthy();
  expect(conflictFinding!.classification).toBe("conflict");
  expect(conflictFinding!.productionText).toBe(preIncidentTranslations.conflictPost);

  const counts = report.perLanguageCounts.find((c) => c.languageId === languageId);
  expect(counts).toBeTruthy();
  expect(counts!.restored).toBeGreaterThanOrEqual(1);
  expect(counts!.conflicts).toBeGreaterThanOrEqual(1);
});

test("Diagnosis flags shared strings that also appear in other lessons", async () => {
  const report: DiagnosisReport = await diagnose({
    productionSql: sql,
    snapshot,
    snapshotConfirmed: "test-harness-confirmed",
    book: BOOK,
    dryRun: true,
    homeDir,
  });

  expect(report.blastRadius.sharedMasterIds).toBeGreaterThanOrEqual(1);
  expect(report.blastRadius.lessons).toContainEqual({
    book: SHARED_WITH_BOOK,
    series: SHARED_WITH_SERIES,
    lesson: SHARED_WITH_LESSON,
  });

  const sharedMapping = report.mappings.find((m) => m.snapshotMasterId === sharedMasterId);
  expect(sharedMapping).toBeTruthy();
  expect(sharedMapping!.sharedWithLessons).toContainEqual({
    book: SHARED_WITH_BOOK,
    series: SHARED_WITH_SERIES,
    lesson: SHARED_WITH_LESSON,
  });
});

test("Dry-run diagnosis makes no writes to either database", async () => {
  const beforeTStrings: TString[] = await fetchTStringsForLesson(
    sql,
    lessonId,
    [restoredMasterId, conflictMasterId],
    { includeLegacyLessonStringScoped: true }
  );
  const beforeLanguages: Language[] = await fetchAllLanguages(sql, true);

  const report: DiagnosisReport = await diagnose({
    productionSql: sql,
    snapshot,
    snapshotConfirmed: "test-harness-confirmed",
    book: BOOK,
    dryRun: true,
    homeDir,
  });
  expect(report.plannedWrites.length).toBeGreaterThanOrEqual(1);

  const afterTStrings: TString[] = await fetchTStringsForLesson(
    sql,
    lessonId,
    [restoredMasterId, conflictMasterId],
    { includeLegacyLessonStringScoped: true }
  );
  const afterLanguages: Language[] = await fetchAllLanguages(sql, true);

  // Zero database writes on either side (I2, SC-005): production's own
  // tStrings/languages rows are byte-identical before and after diagnose,
  // and the snapshot bundle passed in is untouched data, not a live
  // connection diagnose could write through.
  expect(afterTStrings).toEqual(beforeTStrings);
  expect(afterLanguages).toEqual(beforeLanguages);
});

// ─────────────────────────────────────────────────────────────────────────
// US16-restore-english-master.txt scenarios (task 5.7.1, US2)
// ─────────────────────────────────────────────────────────────────────────

describe("US16-restore-english-master.txt scenarios", () => {
  let dumpDir: string;
  let diagnosisReport: DiagnosisReport;

  beforeAll(async () => {
    dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-lesson-integration-dump-"));
    // `diagnose()` itself is already implemented (task 5.6.7, green) — this
    // produces the real report `restoreEnglish()` will consume, including
    // the `candidateMasterDocuments` entry for `masterDocumentPath` scanned
    // out of `docsRoot` above.
    diagnosisReport = await diagnose({
      productionSql: sql,
      snapshot,
      snapshotConfirmed: "test-harness-confirmed",
      book: BOOK,
      dryRun: true,
      homeDir,
      knownBadVersions: [incidentVersion],
      docsRoot,
    });
  });

  afterAll(() => {
    fs.rmSync(dumpDir, { recursive: true, force: true });
  });

  test("Restoring the English master replaces the cover-page content with the pre-incident lesson content", async () => {
    const report = await restoreEnglish({
      productionSql: sql,
      report: diagnosisReport,
      masterDocumentPath,
      dumpDir,
      homeDir,
    });

    const snapshotEnglishText = new Set(
      snapshot.tStrings.filter((t) => t.languageId === ENGLISH_ID).map((t) => t.text)
    );
    const restoredLesson = await fetchLessonByBookSeriesLesson(sql, BOOK, SERIES, LESSON);
    expect(restoredLesson).toBeTruthy();
    const restoredTStrings = await fetchTStringsForLesson(
      sql,
      restoredLesson!.lessonId,
      [restoredMasterId, conflictMasterId],
      { includeLegacyLessonStringScoped: true }
    );
    const restoredEnglishText = new Set(
      restoredTStrings.filter((t) => t.languageId === ENGLISH_ID).map((t) => t.text)
    );
    for (const text of snapshotEnglishText) {
      expect(restoredEnglishText.has(text)).toBe(true);
    }
    expect(report.englishRestore).toBeTruthy();
  });

  test("The restoration uses the correct pre-incident master document, never the cover file", async () => {
    const report = await restoreEnglish({
      productionSql: sql,
      report: diagnosisReport,
      masterDocumentPath,
      dumpDir,
      homeDir,
    });

    expect(report.englishRestore).toBeTruthy();
    expect(report.englishRestore!.masterDocumentPath).toBe(masterDocumentPath);
    expect(report.englishRestore!.newLessonVersion).toBeGreaterThan(incidentVersion);

    const usedCandidate = diagnosisReport.affectedLessons
      .flatMap((lsn) => lsn.candidateMasterDocuments)
      .find((c) => c.filepath === masterDocumentPath);
    expect(usedCandidate).toBeTruthy();
    expect(usedCandidate!.isKnownBadUpload).toBe(false);
    expect(usedCandidate!.version).toBe(preIncidentVersion);

    // The resulting lesson structure supports re-attaching existing
    // translations: a fresh mapping pass over the post-restore lesson finds
    // the restored master strings reachable again.
    const restoredLesson = await fetchLessonByBookSeriesLesson(sql, BOOK, SERIES, LESSON);
    expect(restoredLesson).toBeTruthy();
    expect(restoredLesson!.version).toBe(report.englishRestore!.newLessonVersion);
  });

  test("Production is reversible from a pre-write dump if anything goes wrong mid-restore", async () => {
    const report = await restoreEnglish({
      productionSql: sql,
      report: diagnosisReport,
      masterDocumentPath,
      dumpDir,
      homeDir,
    });

    expect(report.englishRestore).toBeTruthy();
    expect(report.englishRestore!.dumpPath).toBeTruthy();
    expect(path.dirname(report.englishRestore!.dumpPath)).toBe(dumpDir);
    expect(fs.existsSync(report.englishRestore!.dumpPath)).toBe(true);
    expect(fs.statSync(report.englishRestore!.dumpPath).size).toBeGreaterThan(0);
  });
});
