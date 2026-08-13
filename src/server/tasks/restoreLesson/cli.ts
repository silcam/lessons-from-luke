/**
 * cli.ts — `diagnose` subcommand wiring for the `restoreLesson` task
 * (spec 018-lesson1-translation-restore).
 *
 * This task ("cli.ts: diagnose subcommand wiring") wires identity.ts,
 * detectLesson.ts, mapMasterStrings.ts, classify.ts, report.ts, and
 * gateway.ts together into two layers:
 *
 * - `diagnose()` — the pure-orchestration core. Given production's live
 *   `SqlFunc` and an already-fetched `SnapshotBundle` (research D11's
 *   "capture the Snapshot as data" pattern), it runs the whole diagnosis
 *   pipeline and returns a fully checksummed `DiagnosisReport`. No argv
 *   parsing, no file writes unless `dryRun` is false and `reportPath` is
 *   given. This is the function `restoreLesson.integration.test.ts` (task
 *   5.6.1's RED acceptance test) calls directly.
 * - `runDiagnoseCommand()` / `main()` — the operational CLI: argv parsing,
 *   the `--snapshot-url` connection, report-path preconditions, redaction,
 *   human/JSON output, and exit-code mapping per
 *   specs/018-lesson1-translation-restore/contracts/cli.md.
 *
 * `restore-english`, `apply`, and `verify` are NOT wired here — later tasks
 * add those subcommands to this file's `main()` dispatch.
 *
 * Scope note: the CLI wrapper detects the single affected lesson for
 * `--book` by comparing production against the Snapshot for a version
 * mismatch. The contract's `--book` (default "all books") implies a
 * multi-lesson-capable detector; the incident this feature targets (Lesson
 * 1, `docs/Luke-1-01v*.odt`) only ever has one affected lesson at a time, so
 * this build aborts (13) rather than guessing when zero or more than one
 * mismatch is found for the given `--book`. Multi-lesson enumeration is a
 * follow-on if a future incident needs it.
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md §diagnose,
 * specs/018-lesson1-translation-restore/plan.md §Security & Privacy.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import postgres, { SqlFunc } from "postgres";
import secrets from "../../util/secrets";
import { BaseLesson } from "../../../core/models/Lesson";
import { ENGLISH_ID, Language } from "../../../core/models/Language";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { parseDocStrings } from "../../actions/updateLesson";
import {
  PRODUCTION_MARKER_FILENAME,
  RestoreLessonAbortError,
  checkLanguageIdentity,
  verifyServerIdentity,
} from "./identity";
import { detectAffectedLesson } from "./detectLesson";
import { mapMasterStrings } from "./mapMasterStrings";
import { ProductionTStringRow, assembleBlastRadius, classifyFindings } from "./classify";
import {
  fetchAllLanguages,
  fetchDuplicateRowSweep,
  fetchLegacyScopedCount,
  fetchLessonByBookSeriesLesson,
  fetchLessonsSharingMasterIds,
  fetchTStringsForLesson,
} from "./gateway";
import {
  checkForceReportOverwrite,
  computeDiagnosisChecksum,
  computeReportChecksum,
  deriveCarryForward,
  ensureReportDirectory,
  loadAndVerifyPriorReport,
  writeReportAtomic,
} from "./report";
import {
  DiagnosisReport,
  EnglishRestore,
  LanguageCounts,
  LessonRef,
  MasterDocumentCandidate,
  ProductionFingerprint,
  RestoreWrite,
  TranslationFinding,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Redaction (contract §Output redaction and file modes)
// ─────────────────────────────────────────────────────────────────────────

/** Matches `scheme://user:password@` in a postgres connection string. */
const CONNECTION_STRING_RE = /(postgres(?:ql)?:\/\/)([^:@/\s]+):([^@/\s]*)@/gi;

/** Redacts every connection string's password in `input` to `***`. Never
 * strips the username or host — only the credential that must not leak. */
export function redactConnectionString(input: string): string {
  return input.replace(
    CONNECTION_STRING_RE,
    (_match, scheme: string, user: string) => `${scheme}${user}:***@`
  );
}

/** Recursively applies `redactConnectionString` to every string in `value` —
 * used before JSON output, report writes, and error/log messages. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactConnectionString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactDeep(item);
    }
    return result as T;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────
// Candidate master document scanner (contract §diagnose Output, Acceptance)
// ─────────────────────────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ScanCandidateMasterDocumentsInput {
  docsRoot: string;
  book: string;
  series: number;
  lesson: number;
  knownBadVersions: number[];
  /** English text set the Snapshot expects the historical master document to contain. */
  snapshotEnglishTexts: string[];
}

/**
 * Scans `docsRoot` (non-recursive) for ODTs matching
 * `^{book}-{series}-{lesson:2}v(\d+)\.odt$`, computing `sha256`/`sizeBytes`
 * (I23) and comparing each candidate's extracted English text set against
 * the Snapshot's. Ignores non-files (including `*_odt` extraction
 * directories some earlier bug left behind under `docs/`).
 */
export function scanCandidateMasterDocuments(
  input: ScanCandidateMasterDocumentsInput
): MasterDocumentCandidate[] {
  const { docsRoot, book, series, lesson, knownBadVersions, snapshotEnglishTexts } = input;
  if (!fs.existsSync(docsRoot)) return [];

  const lessonPadded = String(lesson).padStart(2, "0");
  const pattern = new RegExp(`^${escapeRegExp(book)}-${series}-${lessonPadded}v(\\d+)\\.odt$`);
  const snapshotTextSet = new Set(snapshotEnglishTexts);

  const entries = fs.readdirSync(docsRoot, { withFileTypes: true });
  const candidates: MasterDocumentCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = pattern.exec(entry.name);
    if (!match) continue;

    const version = Number(match[1]);
    const filepath = path.join(docsRoot, entry.name);
    const buffer = fs.readFileSync(filepath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const sizeBytes = buffer.length;

    // An unreadable/corrupt candidate still gets recorded (as a non-match); a
    // scan aborting on one bad file would hide every other candidate too.
    const documentTexts: string[] = ((): string[] => {
      try {
        return parseDocStrings(filepath).map((docString) => docString.text);
      } catch {
        return [];
      }
    })();
    const documentTextSet = new Set(documentTexts);
    const missingFromDocument = Array.from(snapshotTextSet).filter((t) => !documentTextSet.has(t));
    const extraInDocument = Array.from(documentTextSet).filter((t) => !snapshotTextSet.has(t));
    const englishTextSetMatchesSnapshot =
      snapshotTextSet.size > 0 && missingFromDocument.length === 0 && extraInDocument.length === 0;

    candidates.push({
      filepath,
      version,
      sha256,
      sizeBytes,
      englishTextSetMatchesSnapshot,
      isKnownBadUpload: knownBadVersions.includes(version),
      missingFromDocument,
      extraInDocument,
    });
  }

  return candidates.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
}

// ─────────────────────────────────────────────────────────────────────────
// Local raw-SQL fetchers not already covered by gateway.ts
// ─────────────────────────────────────────────────────────────────────────

async function fetchLessonStrings(sql: SqlFunc, lessonId: number): Promise<LessonString[]> {
  return sql`
    SELECT lessonstringid, masterid, lessonid, lessonversion, type, xpath, mothertongue
    FROM lessonstrings WHERE lessonid=${lessonId} ORDER BY lessonstringid
  `;
}

async function fetchOldLessonStrings(
  sql: SqlFunc,
  lessonId: number,
  version: number
): Promise<LessonString[]> {
  return sql`
    SELECT lessonstringid, masterid, lessonid, lessonversion, type, xpath, mothertongue
    FROM oldlessonstrings WHERE lessonid=${lessonId} AND lessonversion=${version}
    ORDER BY lessonstringid
  `;
}

/** Extends `gateway.ts`'s `fetchTStringsForLesson` shape with `modified`
 * (classify.ts's `ProductionTStringRow`) — see classify.ts's NOTE. */
async function fetchProductionTStringsWithModified(
  sql: SqlFunc,
  masterIds: number[]
): Promise<ProductionTStringRow[]> {
  if (masterIds.length === 0) return [];
  return sql`
    SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid, modified
    FROM tstrings WHERE masterid IN (${masterIds})
  `;
}

interface CountRow {
  db?: string;
  cnt?: string | number;
  mx?: string | number;
}

async function fetchProductionFingerprint(sql: SqlFunc): Promise<ProductionFingerprint> {
  const [dbRow]: CountRow[] = await sql`SELECT current_database() AS db`;
  const [lessonRow]: CountRow[] = await sql`SELECT count(*) AS cnt FROM lessons`;
  const [masterRow]: CountRow[] = await sql`SELECT COALESCE(max(masterid),0) AS mx FROM tstrings`;
  const [lsRow]: CountRow[] =
    await sql`SELECT COALESCE(max(lessonstringid),0) AS mx FROM lessonstrings`;
  return {
    databaseName: dbRow.db as string,
    lessonCount: Number(lessonRow.cnt),
    maxMasterId: Number(masterRow.mx),
    maxLessonStringId: Number(lsRow.mx),
  };
}

async function fetchLessonsForBook(sql: SqlFunc, book: string): Promise<BaseLesson[]> {
  return sql`
    SELECT lessonid, book, series, lesson, version FROM lessons
    WHERE book=${book} ORDER BY series, lesson
  `;
}

function readToolVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// diagnose() core
// ─────────────────────────────────────────────────────────────────────────

/**
 * The Snapshot side captured as data (research D11) rather than a second
 * live connection — matches `restoreLesson.integration.test.ts`'s local
 * `SnapshotBundle` shape exactly (structurally; that test's copy is
 * unrelated by import, only by duck-typed contract).
 */
export interface SnapshotBundle {
  languages: Language[];
  lesson: BaseLesson;
  tStrings: TString[];
  legacyLessonStringRowCount: number;
  /** Optional: the Snapshot's own pre-incident lessonStrings for the
   * affected lesson. When omitted (as in the `findTSubsBridge` regime,
   * where the Snapshot IS production's own archived generation), falls back
   * to `productionOldLessonStrings`, which is byte-identical to it by
   * construction whenever `bumpCount === 1`. */
  lessonStrings?: LessonString[];
}

export interface DiagnoseCoreOptions {
  productionSql: SqlFunc;
  snapshot: SnapshotBundle;
  snapshotConfirmed: string;
  /** restricts detection; a mismatch against `snapshot.lesson.book` aborts (13) */
  book?: string;
  /** true: compute and return the report only. false: also write it to `reportPath` (I2, I12, I17). */
  dryRun: boolean;
  homeDir?: string;
  knownBadVersions?: number[];
  expectedBumpCount?: number;
  /** directory to scan for `candidateMasterDocuments`; omitted = skip the scan ([]) */
  docsRoot?: string;
  priorDiagnosisId?: string;
  reportPath?: string;
  toolVersion?: string;
}

function buildPerLanguageCounts(
  languages: Language[],
  findings: TranslationFinding[]
): LanguageCounts[] {
  return languages.map((language) => {
    const languageFindings = findings.filter((f) => f.languageId === language.languageId);
    return {
      languageId: language.languageId,
      languageName: language.name,
      archived: language.archived,
      snapshotReachable: languageFindings.filter((f) => f.snapshotText !== null).length,
      productionReachableBefore: languageFindings.filter((f) => f.productionText !== null).length,
      productionReachableAfter: null,
      restored: languageFindings.filter((f) => f.classification === "restore").length,
      conflicts: languageFindings.filter((f) => f.classification === "conflict").length,
      newerWork: languageFindings.filter((f) => f.classification === "newerWork").length,
      lost: languageFindings.filter((f) => f.classification === "lost").length,
      driftSkipped: 0,
    };
  });
}

function buildPlannedWrites(
  findings: TranslationFinding[],
  snapshotTStrings: TString[]
): RestoreWrite[] {
  return findings
    .filter((f) => f.classification === "restore" && f.productionMasterId !== null)
    .map((f) => {
      const snapshotRow = snapshotTStrings.find(
        (t) => t.masterId === f.snapshotMasterId && t.languageId === f.languageId
      );
      return {
        languageId: f.languageId,
        masterId: f.productionMasterId as number,
        lessonStringId: null,
        text: f.snapshotText as string,
        history: [],
        sourceLanguageId: snapshotRow?.sourceLanguageId ?? null,
        source: snapshotRow?.source ?? null,
      };
    });
}

/**
 * The `diagnose` orchestration core (FR-001..FR-005, FR-014): runs every
 * precondition and produces a fully checksummed `DiagnosisReport` for one
 * affected lesson, identified by `options.snapshot.lesson`. Zero database
 * writes on either side (I2) — the only side effect is the optional report
 * file write when `!dryRun && reportPath` is given.
 */
export async function diagnose(options: DiagnoseCoreOptions): Promise<DiagnosisReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new RestoreLessonAbortError(
      10,
      `Production marker file missing: ${markerPath}. This tool must be run on the ` +
        `production host, with ${PRODUCTION_MARKER_FILENAME} present in its home directory.`
    );
  }

  const { book, series, lesson } = options.snapshot.lesson;
  if (options.book && options.book !== book) {
    throw new RestoreLessonAbortError(
      13,
      `No affected lesson detected: --book ${options.book} does not match the Snapshot ` +
        `lesson's book (${book}).`
    );
  }

  const sql = options.productionSql;
  const productionLesson = await fetchLessonByBookSeriesLesson(sql, book, series, lesson);

  const knownBadVersions = options.knownBadVersions ?? [];
  const expectedBumpCount = options.expectedBumpCount ?? 1;

  const snapshotEnglishTStrings = options.snapshot.tStrings.filter(
    (t) => t.languageId === ENGLISH_ID
  );
  const candidateMasterDocuments = options.docsRoot
    ? scanCandidateMasterDocuments({
        docsRoot: options.docsRoot,
        book,
        series,
        lesson,
        knownBadVersions,
        snapshotEnglishTexts: snapshotEnglishTStrings.map((t) => t.text),
      })
    : [];

  const { affectedLesson, bumpCountWarning } = detectAffectedLesson({
    book,
    series,
    lesson,
    productionLesson,
    snapshotLesson: options.snapshot.lesson,
    knownBadVersions,
    expectedBumpCount,
    candidateMasterDocuments,
  });

  const identity = verifyServerIdentity({
    homeDir,
    snapshotConfirmationToken: options.snapshotConfirmed,
    productionLessonVersion: affectedLesson.productionVersion,
    snapshotLessonVersion: affectedLesson.snapshotVersion,
  });

  const productionLanguages = await fetchAllLanguages(sql, true);
  const snapshotLanguages = options.snapshot.languages;

  const snapshotLanguageIdsWithAffectedLessonTranslations = Array.from(
    new Set(options.snapshot.tStrings.map((t) => t.languageId))
  );

  const languageIdentityChecks = checkLanguageIdentity({
    snapshotLanguages,
    productionLanguages,
    snapshotLanguageIdsWithAffectedLessonTranslations,
  });

  const productionLessonStrings = await fetchLessonStrings(sql, affectedLesson.productionLessonId);
  const productionOldLessonStrings = await fetchOldLessonStrings(
    sql,
    affectedLesson.productionLessonId,
    affectedLesson.productionVersion - 1
  );
  const snapshotLessonStrings = options.snapshot.lessonStrings ?? productionOldLessonStrings;

  const candidateMasterIds = Array.from(
    new Set([
      ...productionLessonStrings.map((ls) => ls.masterId),
      ...productionOldLessonStrings.map((ls) => ls.masterId),
    ])
  );
  const productionTStringsAll = await fetchProductionTStringsWithModified(sql, candidateMasterIds);
  const productionEnglishTStrings = productionTStringsAll.filter(
    (t) => t.languageId === ENGLISH_ID
  );

  const mappingsRaw = mapMasterStrings({
    affectedLesson,
    snapshotLessonStrings,
    productionLessonStrings,
    productionOldLessonStrings,
    snapshotEnglishTStrings,
    productionEnglishTStrings,
  });

  const masterIdLessons = await fetchLessonsSharingMasterIds(
    sql,
    mappingsRaw.map((m) => m.snapshotMasterId)
  );
  const sharedByMasterId = new Map(masterIdLessons.map((entry) => [entry.masterId, entry.lessons]));
  const affectedRef: LessonRef = { book, series, lesson };
  const isAffectedRef = (ref: LessonRef): boolean =>
    ref.book === affectedRef.book &&
    ref.series === affectedRef.series &&
    ref.lesson === affectedRef.lesson;
  const mappings = mappingsRaw.map((mapping) => ({
    ...mapping,
    sharedWithLessons: (sharedByMasterId.get(mapping.snapshotMasterId) ?? []).filter(
      (ref) => !isAffectedRef(ref)
    ),
  }));

  const blastRadius = assembleBlastRadius(affectedRef, masterIdLessons);

  const findings: TranslationFinding[] = classifyFindings({
    mappings,
    languages: productionLanguages,
    snapshotTStrings: options.snapshot.tStrings,
    productionTStrings: productionTStringsAll,
  });

  const perLanguageCounts = buildPerLanguageCounts(productionLanguages, findings);

  const legacyLessonStringRowCounts = {
    production: await fetchLegacyScopedCount(sql),
    snapshot: options.snapshot.legacyLessonStringRowCount,
  };

  const duplicateRowsBaseline = await fetchDuplicateRowSweep(sql, candidateMasterIds);

  const plannedWrites = buildPlannedWrites(findings, options.snapshot.tStrings);
  const conflicts = findings.filter(
    (f) => f.classification === "conflict" || f.classification === "newerWork"
  );

  const productionFingerprint = await fetchProductionFingerprint(sql);

  const diagnosisId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const toolVersion = options.toolVersion ?? readToolVersion();

  const partial: Omit<DiagnosisReport, "diagnosisChecksum" | "reportChecksum"> = {
    diagnosisId,
    generatedAt,
    toolVersion,
    mode: "diagnose",
    identity,
    productionFingerprint,
    affectedLessons: [affectedLesson],
    languageIdentityChecks,
    mappings,
    findings,
    perLanguageCounts,
    legacyLessonStringRowCounts,
    blastRadius,
    plannedWrites,
    duplicateRowsBaseline,
    conflicts,
    ...(options.priorDiagnosisId ? { priorDiagnosisId: options.priorDiagnosisId } : {}),
  };

  const diagnosisChecksum = computeDiagnosisChecksum(partial as DiagnosisReport);
  const reportWithDiagnosisChecksum: DiagnosisReport = {
    ...partial,
    diagnosisChecksum,
    reportChecksum: "",
  };
  const report: DiagnosisReport = {
    ...reportWithDiagnosisChecksum,
    reportChecksum: computeReportChecksum(reportWithDiagnosisChecksum),
  };

  if (!options.dryRun && options.reportPath) {
    ensureReportDirectory(path.dirname(options.reportPath));
    writeReportAtomic(options.reportPath, report);
  }

  if (bumpCountWarning) {
    console.warn(bumpCountWarning);
  }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────

export interface DiagnoseCliArgs {
  snapshotUrl: string;
  snapshotUrlFromFlag: boolean;
  report: string;
  snapshotConfirmed: string;
  priorReport: string | null;
  forceReport: boolean;
  book: string | null;
  json: boolean;
  noColor: boolean;
}

const KNOWN_DIAGNOSE_FLAGS = new Set([
  "--snapshot-url",
  "--report",
  "--snapshot-confirmed",
  "--prior-report",
  "--force-report",
  "--book",
  "--json",
  "--no-color",
]);

/** Parses `diagnose` subcommand argv per
 * specs/018-lesson1-translation-restore/contracts/cli.md §diagnose. Argument
 * errors abort with exit 1 (no dedicated exit code is defined for them). */
export function parseDiagnoseArgs(argv: string[]): DiagnoseCliArgs {
  let snapshotUrlFlag: string | null = null;
  let report: string | null = null;
  let snapshotConfirmed: string | null = null;
  let priorReport: string | null = null;
  let forceReport = false;
  let book: string | null = null;
  let json = false;
  let noColor = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_DIAGNOSE_FLAGS.has(arg)) {
      throw new RestoreLessonAbortError(1, `Unrecognized argument: ${arg}`);
    }
    switch (arg) {
      case "--snapshot-url":
        snapshotUrlFlag = requireValue(argv, ++i, arg);
        break;
      case "--report":
        report = requireValue(argv, ++i, arg);
        break;
      case "--snapshot-confirmed":
        snapshotConfirmed = requireValue(argv, ++i, arg);
        break;
      case "--prior-report":
        priorReport = requireValue(argv, ++i, arg);
        break;
      case "--force-report":
        forceReport = true;
        break;
      case "--book":
        book = requireValue(argv, ++i, arg);
        break;
      case "--json":
        json = true;
        break;
      case "--no-color":
        noColor = true;
        break;
    }
  }

  if (!report) {
    throw new RestoreLessonAbortError(1, "--report <path> is required");
  }
  if (!snapshotConfirmed) {
    throw new RestoreLessonAbortError(1, "--snapshot-confirmed <token> is required");
  }

  const snapshotUrlFromEnv = process.env.SNAPSHOT_DATABASE_URL ?? null;
  const snapshotUrl = snapshotUrlFlag ?? snapshotUrlFromEnv;
  if (!snapshotUrl) {
    throw new RestoreLessonAbortError(
      1,
      "No snapshot connection given: pass --snapshot-url or set SNAPSHOT_DATABASE_URL " +
        "(preferred — an argv password is world-readable in ps/proc)."
    );
  }
  if (snapshotUrlFlag) {
    console.warn(
      redactConnectionString(
        "--snapshot-url was passed on the command line, which is world-readable via ps/proc. " +
          "Prefer the SNAPSHOT_DATABASE_URL environment variable."
      )
    );
  }

  return {
    snapshotUrl,
    snapshotUrlFromFlag: snapshotUrlFlag !== null,
    report,
    snapshotConfirmed,
    priorReport,
    forceReport,
    book,
    json,
    noColor,
  };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) {
    throw new RestoreLessonAbortError(1, `${flag} requires a value`);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────
// Human/JSON output
// ─────────────────────────────────────────────────────────────────────────

function colorize(useColor: boolean, word: string, color: "green" | "yellow"): string {
  if (!useColor) return word;
  const codes = { green: "32", yellow: "33" } as const;
  return `[${codes[color]}m${word}[0m`;
}

function formatDiagnoseOutput(
  report: DiagnosisReport,
  args: Pick<DiagnoseCliArgs, "json" | "noColor" | "report">
): string {
  if (args.json) {
    return JSON.stringify(redactDeep(report), null, 2);
  }

  const useColor = !args.noColor && !!process.stdout.isTTY;
  const affected = report.affectedLessons[0];
  const lines: string[] = [];

  lines.push(
    `${colorize(useColor, "OK", "green")} Diagnosis complete (diagnosisId=${report.diagnosisId})`
  );
  lines.push(`Production database: ${report.productionFingerprint.databaseName}`);
  lines.push(
    `Language identity: ${report.languageIdentityChecks.length} language(s) checked` +
      (report.languageIdentityChecks[0]
        ? `, matched by "${report.languageIdentityChecks[0].matchedBy}"`
        : "")
  );

  if (affected) {
    lines.push(
      `Affected lesson: ${affected.book} ${affected.series}-${affected.lesson} ` +
        `(production v${affected.productionVersion}, Snapshot v${affected.snapshotVersion}, ` +
        `bumpCount=${affected.bumpCount}, strategy=${affected.mappingStrategy})`
    );
    if (affected.bumpCount !== affected.expectedBumpCount) {
      lines.push(
        `${colorize(useColor, "DRIFT", "yellow")} bumpCount ${affected.bumpCount} does not match ` +
          `expected ${affected.expectedBumpCount} — stop and re-review before proceeding.`
      );
    }
    for (const candidate of affected.candidateMasterDocuments) {
      lines.push(
        `  candidate: ${candidate.filepath} v${candidate.version} ` +
          `${candidate.englishTextSetMatchesSnapshot ? "matches" : "does not match"} the Snapshot` +
          `${candidate.isKnownBadUpload ? " (KNOWN BAD)" : ""}`
      );
    }
  }

  for (const counts of report.perLanguageCounts) {
    lines.push(
      `  ${counts.languageName}: restore=${counts.restored} conflict=${counts.conflicts} ` +
        `newerWork=${counts.newerWork} lost=${counts.lost}`
    );
    const samples = report.findings.filter((f) => f.languageId === counts.languageId).slice(0, 3);
    for (const sample of samples) {
      lines.push(`    [${sample.classification}] ${sample.sampleEnglishText}`);
    }
  }

  lines.push(
    `Blast radius: ${report.blastRadius.sharedMasterIds} shared master string(s) across ` +
      `${report.blastRadius.lessons.length} other lesson(s)`
  );
  lines.push(
    `Legacy lessonStringId rows: production=${report.legacyLessonStringRowCounts.production} ` +
      `Snapshot=${report.legacyLessonStringRowCounts.snapshot}`
  );
  if (report.duplicateRowsBaseline.length > 0) {
    lines.push(
      `${colorize(useColor, "DRIFT", "yellow")} Pre-existing duplicate rows found: ` +
        `${report.duplicateRowsBaseline.length}`
    );
  }
  if (affected) {
    lines.push(
      `Next: node dist/server/tasks/restoreLesson/cli.js restore-english --report ${args.report} ` +
        `--diagnosis-id ${report.diagnosisId} --master-document <path>`
    );
  }

  return redactConnectionString(lines.join("\n"));
}

// ─────────────────────────────────────────────────────────────────────────
// Docs root resolution (mirrors docStorage.ts's env-scoped `docs/` root)
// ─────────────────────────────────────────────────────────────────────────

function resolveDocsRoot(): string {
  const env = process.env.NODE_ENV;
  const subpath =
    env === "test" ? "/test/docs/serverDocs" : env === "development" ? "/docs/dev" : "/docs";
  return path.join(process.cwd(), subpath);
}

// ─────────────────────────────────────────────────────────────────────────
// runDiagnoseCommand() — operational CLI wrapper
// ─────────────────────────────────────────────────────────────────────────

export interface RunDiagnoseCommandOptions {
  argv: string[];
  homeDir?: string;
  docsRoot?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** injectable for tests ("with both storages doubled") */
  connectProduction?: () => Promise<SqlFunc> | SqlFunc;
  connectSnapshot?: (url: string) => Promise<SqlFunc> | SqlFunc;
  closeSql?: (sql: SqlFunc) => Promise<void>;
}

async function defaultConnectProduction(): Promise<SqlFunc> {
  return postgres({ ...secrets.db }) as unknown as SqlFunc;
}

async function defaultConnectSnapshot(url: string): Promise<SqlFunc> {
  return postgres(url) as unknown as SqlFunc;
}

async function defaultCloseSql(sql: SqlFunc): Promise<void> {
  const closable = sql as unknown as { end?: () => Promise<void> };
  if (typeof closable.end === "function") await closable.end();
}

/** Runs the `diagnose` subcommand end to end: argv parsing, preconditions,
 * the Snapshot/production connections, report write, and output. Returns
 * the process exit code per contracts/cli.md's exit code table (never
 * throws — every `RestoreLessonAbortError` and unexpected error is caught
 * and mapped here). */
export async function runDiagnoseCommand(options: RunDiagnoseCommandOptions): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const connectProduction = options.connectProduction ?? defaultConnectProduction;
  const connectSnapshot = options.connectSnapshot ?? defaultConnectSnapshot;
  const closeSql = options.closeSql ?? defaultCloseSql;
  const homeDir = options.homeDir ?? os.homedir();
  const docsRoot = options.docsRoot ?? resolveDocsRoot();

  let productionSql: SqlFunc | null = null;
  let snapshotSql: SqlFunc | null = null;

  try {
    const args = parseDiagnoseArgs(options.argv);

    // Host-local preconditions 1, 4, 5, 6 — cheap, checked before opening
    // any database connection.
    const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
    if (!fs.existsSync(markerPath)) {
      throw new RestoreLessonAbortError(10, `Production marker file missing: ${markerPath}.`);
    }

    const reportDir = path.dirname(args.report);
    ensureReportDirectory(reportDir);

    const reportExists = fs.existsSync(args.report);
    if (reportExists && !args.forceReport) {
      throw new RestoreLessonAbortError(
        14,
        `Report already exists at ${args.report}; pass --force-report to overwrite.`
      );
    }
    if (reportExists && args.forceReport) {
      checkForceReportOverwrite(args.report);
    }
    if (!reportExists && !args.priorReport && fs.existsSync(reportDir)) {
      const siblingReports = fs
        .readdirSync(reportDir)
        .filter((name) => name.endsWith(".json") && path.join(reportDir, name) !== args.report);
      if (siblingReports.length > 0) {
        throw new RestoreLessonAbortError(
          14,
          `A report already exists in ${reportDir} (${siblingReports.join(", ")}) and ` +
            `--prior-report was not supplied; proceeding blind would lose knownBadVersions.`
        );
      }
    }

    productionSql = await connectProduction();

    try {
      snapshotSql = await connectSnapshot(args.snapshotUrl);
      await snapshotSql`SELECT 1`;
    } catch (err) {
      if (err instanceof RestoreLessonAbortError) throw err;
      throw new RestoreLessonAbortError(
        12,
        `Snapshot connection failed: ${redactConnectionString(String(err))}`
      );
    }

    if (!args.book) {
      throw new RestoreLessonAbortError(
        13,
        "No affected lesson detected: --book is required to scope detection."
      );
    }

    const productionLessons = await fetchLessonsForBook(productionSql, args.book);
    const snapshotLessons = await fetchLessonsForBook(snapshotSql, args.book);
    const mismatched = productionLessons.filter((productionLesson) => {
      const snapshotLesson = snapshotLessons.find(
        (candidate) =>
          candidate.series === productionLesson.series &&
          candidate.lesson === productionLesson.lesson
      );
      return snapshotLesson && snapshotLesson.version < productionLesson.version;
    });
    if (mismatched.length !== 1) {
      throw new RestoreLessonAbortError(
        13,
        mismatched.length === 0
          ? `No affected lesson detected for book ${args.book} (no version mismatch found).`
          : `${mismatched.length} candidate affected lessons found for book ${args.book}; this ` +
              `build diagnoses one lesson at a time.`
      );
    }
    const target = mismatched[0];
    const snapshotLesson = snapshotLessons.find(
      (candidate) => candidate.series === target.series && candidate.lesson === target.lesson
    ) as BaseLesson;

    const snapshotLanguages = await fetchAllLanguages(snapshotSql, true);
    const snapshotLessonStrings = await fetchLessonStrings(snapshotSql, snapshotLesson.lessonId);
    const snapshotMasterIds = snapshotLessonStrings.map((ls) => ls.masterId);
    const snapshotTStrings = await fetchTStringsForLesson(
      snapshotSql,
      snapshotLesson.lessonId,
      snapshotMasterIds,
      { includeLegacyLessonStringScoped: true }
    );
    const snapshotLegacyCount = await fetchLegacyScopedCount(snapshotSql);

    let knownBadVersions: number[] = [];
    let expectedBumpCount = 1;
    let priorDiagnosisId: string | undefined;
    let carriedEnglishRestore: EnglishRestore | undefined;
    if (args.priorReport) {
      const fingerprint = await fetchProductionFingerprint(productionSql);
      const priorReportData = loadAndVerifyPriorReport(args.priorReport, fingerprint.databaseName);
      const carry = deriveCarryForward(priorReportData, {
        book: target.book,
        series: target.series,
        lesson: target.lesson,
      });
      knownBadVersions = carry.knownBadVersions;
      expectedBumpCount = carry.expectedBumpCount;
      priorDiagnosisId = carry.priorDiagnosisId;
      carriedEnglishRestore = carry.englishRestore;
    }

    let report = await diagnose({
      productionSql,
      snapshot: {
        languages: snapshotLanguages,
        lesson: snapshotLesson,
        tStrings: snapshotTStrings,
        legacyLessonStringRowCount: snapshotLegacyCount,
        lessonStrings: snapshotLessonStrings,
      },
      snapshotConfirmed: args.snapshotConfirmed,
      book: args.book,
      dryRun: true,
      homeDir,
      knownBadVersions,
      expectedBumpCount,
      docsRoot,
      priorDiagnosisId,
    });

    if (carriedEnglishRestore) {
      report = { ...report, englishRestore: carriedEnglishRestore };
      report = { ...report, reportChecksum: computeReportChecksum(report) };
    }

    ensureReportDirectory(path.dirname(args.report));
    writeReportAtomic(args.report, report);

    stdout(formatDiagnoseOutput(report, args));
    return 0;
  } catch (err) {
    if (err instanceof RestoreLessonAbortError) {
      stderr(redactConnectionString(err.message));
      return err.exitCode;
    }
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    stderr(redactConnectionString(message));
    return 1;
  } finally {
    if (snapshotSql) await closeSql(snapshotSql);
    if (productionSql) await closeSql(productionSql);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// main() — CLI entry point
// ─────────────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "diagnose") {
    console.error(
      `Unknown or unimplemented subcommand: ${subcommand ?? "(none)"}. Only "diagnose" is wired ` +
        `so far — restore-english/apply/verify are wired by later tasks.`
    );
    return 1;
  }
  return runDiagnoseCommand({ argv: rest });
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
