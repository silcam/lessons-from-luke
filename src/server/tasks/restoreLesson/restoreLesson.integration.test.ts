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
 */
import request from "supertest";
import postgres, { SqlFunc } from "postgres";
import secrets from "../../util/secrets";
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

beforeAll(async () => {
  sql = postgres({ ...secrets.testDb });
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
  const contentMasterIds: number[] = uploadRes.body.lesson.lessonStrings
    .filter((ls: { type: string }) => ls.type === "content")
    .map((ls: { masterId: number }) => ls.masterId);
  expect(contentMasterIds.length).toBeGreaterThanOrEqual(2);
  [restoredMasterId, conflictMasterId] = contentMasterIds;
  sharedMasterId = restoredMasterId;

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
  await admin
    .post("/api/admin/documents")
    .field("languageId", ENGLISH_ID)
    .field("book", BOOK)
    .field("series", SERIES)
    .field("lesson", LESSON)
    .attach("document", "test/docs/serverDocs/Luke-1-02v01.odt")
    .expect(200);
});

afterAll(async () => {
  await sql.end();
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
