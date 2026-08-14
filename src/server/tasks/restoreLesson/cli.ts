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
import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { UploadedFile } from "express-fileupload";
import prexit from "prexit";
import { SqlFunc } from "postgres";
import secrets from "../../util/secrets";
import { Book, BaseLesson } from "../../../core/models/Lesson";
import { ENGLISH_ID, Language } from "../../../core/models/Language";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { parseDocStrings } from "../../actions/updateLesson";
import { uploadEnglishDoc } from "../../actions/uploadDocument";
import webifyLesson from "../../actions/webifyLesson";
import PGStorage, { dbConnect } from "../../storage/PGStorage";
import PGSnapshotStorage, {
  snapshotDbConnect,
  snapshotUrlSecurityWarning,
} from "../../storage/PGSnapshotStorage";
import PGRestoreLessonGatewayStorage from "../../storage/PGRestoreLessonGatewayStorage";
import {
  PRODUCTION_MARKER_FILENAME,
  RestoreLessonAbortError,
  checkLanguageIdentity,
  verifyServerIdentity,
} from "./identity";
import { Persistence } from "../../../core/interfaces/Persistence";
import { detectAffectedLesson } from "./detectLesson";
import { mapMasterStrings } from "./mapMasterStrings";
import { ProductionTStringRow, assembleBlastRadius, classifyFindings } from "./classify";
import { planWrites } from "./planWrites";
import { restoreWrite } from "./restoreWrite";
import {
  appendJournalLine,
  checkForceReportOverwrite,
  computeDiagnosisChecksum,
  computeReportChecksum,
  deriveCarryForward,
  ensureReportDirectory,
  journalPathForReport,
  loadAndVerifyPriorReport,
  loadReport,
  readJournalLines,
  verifyReportIntegrity,
  writeReportAtomic,
} from "./report";
import {
  FileModeOps,
  RestoreEnglishDeps,
  RestoredLessonResult,
  realFileModeOps,
  restoreEnglish as restoreEnglishCore,
} from "./restoreEnglish";
import {
  AppliedWrite,
  ApplyState,
  DiagnosisReport,
  DriftSkip,
  DuplicateRow,
  EnglishRestore,
  LanguageBatch,
  LanguageCounts,
  LessonRef,
  MasterDocumentCandidate,
  ProductionFingerprint,
  RestoreWrite,
  TranslationClassification,
  TranslationFinding,
  Verification,
} from "./types";

/**
 * `PGStorage`'s own zero-arg constructor always connects via
 * `secrets.json`'s `db` block (`dbConnect()`), independent of the
 * `productionSql` connection this subcommand was actually given — the
 * production DB an operator's `--snapshot-url`/CLI wiring targets need not
 * be (and in every test harness, is not) the same database `secrets.json`
 * points at. Writing through a fresh `new PGStorage()` here would silently
 * write to the wrong database instead of the one every other read in this
 * subcommand (via `productionSql`/`reserved`) targets.
 *
 * Follows the `PGDevStorage`/`PGTestStorage`/`PGSnapshotStorage` pattern
 * (`PGStorage.ts`, `PGSnapshotStorage.ts`): subclass `PGStorage`, then swap
 * `this.sql` for the caller-supplied connection.
 *
 * Used for every connection EXCEPT the Snapshot (production, reserved
 * advisory-lock). The Snapshot connection must instead be wrapped in
 * `PGSnapshotStorage` (below), whose mutating methods throw
 * `SnapshotIsReadOnlyError` before any query executes (amkj.15) — this
 * plain gateway subclass has no such guard and would silently permit
 * writes against the Snapshot if used there.
 */
class PGConnectedStorage extends PGRestoreLessonGatewayStorage {}

// ─────────────────────────────────────────────────────────────────────────
// Redaction (contract §Output redaction and file modes)
// ─────────────────────────────────────────────────────────────────────────

/** Matches the `postgres://` / `postgresql://` scheme prefix. The authority
 * that follows (`<user-info>@<host>`) is located and redacted by
 * `redactConnectionUriOccurrences` below rather than by this regex alone —
 * a raw, non-percent-encoded password can itself contain `/` or whitespace,
 * which makes "the authority is everything up to the next `/` or
 * whitespace" an unsafe assumption (amkj.12). */
const CONNECTION_SCHEME_RE = /postgres(?:ql)?:\/\//gi;

/** Matches libpq keyword/value DSN credentials (`password=...`,
 * `sslpassword=...`) and the `PGPASSWORD=` environment-style credential.
 * libpq tolerates whitespace around the `=`; the value itself runs to the
 * next whitespace, or is a quoted string. */
const KEYWORD_VALUE_PASSWORD_RE =
  /\b(PGPASSWORD|sslpassword|password)\s*=\s*(?:'[^']*'|"[^"]*"|\S+)/gi;

/** Cap on how many additional whitespace-delimited tokens
 * `findConnectionUriAuthorityEnd` will fold into the authority while
 * hunting for the `@` that a raw (non-percent-encoded) password with
 * embedded whitespace pushed past the first token. Bounded so a long run of
 * unrelated whitespace-separated text after `postgres://` in an arbitrary
 * log line can't be walked indefinitely. */
const MAX_AUTHORITY_TOKEN_EXTENSIONS = 10;

/** Finds the end index of the "authority" text following a `postgres://`
 * scheme at `start` in `input`. The authority normally runs to the next
 * whitespace, but a raw unencoded space inside the password pushes the
 * `@` that marks the real user-info/host boundary into a later
 * whitespace-delimited token — so this keeps folding in one more token at a
 * time, up to `MAX_AUTHORITY_TOKEN_EXTENSIONS`, until it finds a token
 * containing `@` (or gives up and returns the first token's end). */
function findConnectionUriAuthorityEnd(input: string, start: number): number {
  const isWhitespace = (index: number): boolean => index >= input.length || /\s/.test(input[index]);

  let tokenEnd = start;
  while (!isWhitespace(tokenEnd)) tokenEnd++;
  const firstTokenEnd = tokenEnd;

  if (input.slice(start, tokenEnd).includes("@")) {
    return tokenEnd;
  }

  let end = tokenEnd;
  for (let extension = 0; extension < MAX_AUTHORITY_TOKEN_EXTENSIONS; extension += 1) {
    if (end >= input.length || !/\s/.test(input[end])) break;
    let next = end + 1;
    while (!isWhitespace(next)) next++;
    if (input.slice(end + 1, next).includes("@")) {
      return next;
    }
    end = next;
  }

  return firstTokenEnd;
}

/** Redacts the password out of a URI-form connection string's user-info
 * (`user:password@host`), tolerating a raw unencoded `@` inside the
 * password by splitting on the *last* `@` in the authority to find the
 * host boundary. Returns the original text unchanged if there is no `@`
 * (no credentials present) or no `:` before it (no password to redact). */
function redactUriAuthority(scheme: string, authority: string): string {
  const atIndex = authority.lastIndexOf("@");
  if (atIndex === -1) {
    return `${scheme}${authority}`;
  }
  const userInfo = authority.slice(0, atIndex);
  const hostPart = authority.slice(atIndex + 1);
  const colonIndex = userInfo.indexOf(":");
  if (colonIndex === -1) {
    // No `:` before the last `@` means no password-shaped credential was
    // found — but a *further* `@` inside `userInfo` (e.g. `postgres://@@@`)
    // is malformed enough that a real credential could still be hiding in
    // there unrecognized; fall back to a fixed placeholder rather than
    // risk leaking it verbatim.
    if (userInfo.includes("@")) {
      return `${scheme}***redacted***`;
    }
    return `${scheme}${authority}`;
  }
  const user = userInfo.slice(0, colonIndex);
  return `${scheme}${user}:***@${hostPart}`;
}

/** Redacts every `postgres://`/`postgresql://` connection URI's authority
 * in `input`, scanning forward from each scheme occurrence to find the
 * authority's real end (see `findConnectionUriAuthorityEnd`) rather than
 * assuming it stops at the next `/` or whitespace, since a raw
 * non-percent-encoded password can contain either. */
function redactConnectionUriOccurrences(input: string): string {
  let result = "";
  let cursor = 0;
  CONNECTION_SCHEME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONNECTION_SCHEME_RE.exec(input))) {
    const authorityStart = match.index + match[0].length;
    result += input.slice(cursor, authorityStart);
    const authorityEnd = findConnectionUriAuthorityEnd(input, authorityStart);
    const authority = input.slice(authorityStart, authorityEnd);
    if (authority.includes("@")) {
      result += redactUriAuthority("", authority);
    } else {
      // No `@` found within the bounded scan: either there is no
      // credential here at all (nothing follows the scheme) or the
      // authority is ambiguous enough that it can't be confidently parsed.
      // Fail closed rather than risk echoing an unredacted fragment.
      result += authority.length === 0 ? "" : "***redacted***";
    }
    cursor = authorityEnd;
    CONNECTION_SCHEME_RE.lastIndex = authorityEnd;
  }
  result += input.slice(cursor);
  return result;
}

/** Redacts every connection string's password in `input` to `***`. Never
 * strips the username or host — only the credential that must not leak.
 * Covers both URI-form (`postgres://user:pass@host`, tolerating a raw `/`,
 * whitespace, or `@` in the password) and libpq keyword/value DSNs
 * (`password=...`, `sslpassword=...`, `PGPASSWORD=...`, with or without
 * whitespace around `=`). */
export function redactConnectionString(input: string): string {
  const uriRedacted = redactConnectionUriOccurrences(input);
  return uriRedacted.replace(KEYWORD_VALUE_PASSWORD_RE, (match, key: string) => `${key}=***`);
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
  const storage = new PGConnectedStorage(sql);
  const productionLesson = await storage.fetchLessonByBookSeriesLesson(book, series, lesson);

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

  const productionLanguages = await storage.fetchAllLanguages(true);
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

  const masterIdLessons = await storage.fetchLessonsSharingMasterIds(
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
    production: await storage.fetchLegacyScopedCount(),
    snapshot: options.snapshot.legacyLessonStringRowCount,
  };

  const duplicateRowsBaseline = await storage.fetchDuplicateRowSweep(candidateMasterIds);

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
  return dbConnect();
}

async function defaultConnectSnapshot(url: string): Promise<SqlFunc> {
  return snapshotDbConnect(url);
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

    const snapshotUrlWarning = snapshotUrlSecurityWarning(args.snapshotUrl);
    if (snapshotUrlWarning) {
      stderr(redactConnectionString(snapshotUrlWarning));
    }

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

    const snapshotStorage = new PGSnapshotStorage(snapshotSql);
    const snapshotLanguages = await snapshotStorage.fetchAllLanguages(true);
    const snapshotLessonStrings = await fetchLessonStrings(snapshotSql, snapshotLesson.lessonId);
    const snapshotMasterIds = snapshotLessonStrings.map((ls) => ls.masterId);
    const snapshotTStrings = await snapshotStorage.fetchTStringsForLesson(
      snapshotLesson.lessonId,
      snapshotMasterIds,
      { includeLegacyLessonStringScoped: true }
    );
    const snapshotLegacyCount = await snapshotStorage.fetchLegacyScopedCount();

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
// restore-english — advisory lock (I14)
// ─────────────────────────────────────────────────────────────────────────

/** A constant derived from the tool name (plan.md §Concurrent invocations,
 * I14): every write subcommand (`restore-english`, `apply`, `verify`) locks
 * on this same key, so any one of them running blocks the others. Hashed
 * rather than a small literal so it doesn't collide with an application
 * advisory lock some other part of this codebase might one day take. */
const ADVISORY_LOCK_NAME = "lessons-from-luke:restoreLesson:write-lock";

/** `pg_try_advisory_lock`/`pg_advisory_unlock` take a signed 64-bit `bigint`
 * key — masked to the positive range so it round-trips through every
 * Postgres client library the same way. */
export function advisoryLockKey(): bigint {
  const hash = crypto.createHash("sha256").update(ADVISORY_LOCK_NAME).digest();
  return hash.readBigInt64BE(0) & 0x7fffffffffffffffn;
}

/** Injectable so contract tests can fake lock contention/loss without a
 * second real Postgres session. Defaults to real `pg_try_advisory_lock` /
 * `pg_backend_pid` / `pg_advisory_unlock` calls. */
export interface AdvisoryLockOps {
  tryLock: (reserved: SqlFunc, key: bigint) => Promise<boolean>;
  backendPid: (reserved: SqlFunc) => Promise<number>;
  unlock: (reserved: SqlFunc, key: bigint) => Promise<void>;
}

/**
 * Runs `fn` against a single dedicated database connection (I14's "reserved,
 * non-pooled connection held for the whole run"). The installed
 * `postgres@1.0.2` has no `sql.reserve()` (the spec's plan.md was written
 * against a newer release that adds one) — `sql.begin()` is this version's
 * only mechanism for pinning one physical connection across several
 * queries, so real callers wrap it in an (otherwise unused) transaction to
 * get that pinning. Injectable so contract tests running against this
 * codebase's transactional test-storage double (itself already inside a
 * `begin()`, which this driver does not let a caller nest a second `begin()`
 * inside — only `.savepoint()`) can instead just call `fn(sql)` directly on
 * the same connection; those tests fake `AdvisoryLockOps` regardless, so the
 * physical-connection pinning itself is not what they are exercising.
 */
export type WithReservedConnection = <T>(
  sql: SqlFunc,
  fn: (reserved: SqlFunc) => Promise<T>
) => Promise<T>;

export const beginReservedConnection: WithReservedConnection = (sql, fn) => sql.begin(fn);

export const realAdvisoryLockOps: AdvisoryLockOps = {
  tryLock: async (reserved, key) => {
    const [row] = await reserved`SELECT pg_try_advisory_lock(${key}) AS locked`;
    return Boolean((row as { locked: boolean }).locked);
  },
  backendPid: async (reserved) => {
    const [row] = await reserved`SELECT pg_backend_pid() AS pid`;
    return Number((row as { pid: number }).pid);
  },
  unlock: async (reserved, key) => {
    await reserved`SELECT pg_advisory_unlock(${key})`;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// restore-english — pre-write dump and cumulative disk headroom (I23, I14)
// ─────────────────────────────────────────────────────────────────────────

/** Injectable so contract tests can fake `pg_dump` and disk-space figures
 * without a real production-sized database or filesystem. */
export interface DiskHeadroomOps {
  getDatabaseSizeBytes: (sql: SqlFunc) => Promise<number>;
  /** Called FRESH at every dump (never cached) — this is what makes the
   * headroom check cumulative across a whole recovery run rather than
   * per-command (plan.md §Performance & Resource Considerations): the real
   * current free-space figure already reflects whatever earlier dumps this
   * recovery already wrote into `dumpDir`. */
  getFreeDiskBytes: (dirPath: string) => number;
}

export const realDiskHeadroomOps: DiskHeadroomOps = {
  getDatabaseSizeBytes: async (sql) => {
    const [row] = await sql`SELECT pg_database_size(current_database()) AS size`;
    return Number((row as { size: string | number }).size);
  },
  getFreeDiskBytes: (dirPath) => {
    const stat = fs.statfsSync(dirPath);
    return stat.bavail * stat.bsize;
  },
};

/** Aborts (23) unless `dumpDir` currently has at least 3x `dbSizeBytes` bytes
 * free. See `DiskHeadroomOps.getFreeDiskBytes` for why this is cumulative. */
export function checkDumpHeadroomOrAbort(
  dumpDir: string,
  dbSizeBytes: number,
  getFreeDiskBytes: DiskHeadroomOps["getFreeDiskBytes"]
): void {
  const freeBytes = getFreeDiskBytes(dumpDir);
  const requiredBytes = dbSizeBytes * 3;
  if (freeBytes < requiredBytes) {
    throw new RestoreLessonAbortError(
      23,
      `Insufficient disk space in ${dumpDir}: ${freeBytes} bytes free, need at least ` +
        `${requiredBytes} (3x the ${dbSizeBytes}-byte database), accounting for any dumps already ` +
        `present there from earlier steps of this recovery.`
    );
  }
}

/** Asserts `dumpDir` is a safe place for a `0600` dump file: `0700` if newly
 * created, and refused (23) if an existing directory is group/world-readable
 * — the dump contains the WHOLE database, including better-auth password
 * hashes and sessions. */
export function ensureDumpDirectory(dumpDir: string): void {
  if (fs.existsSync(dumpDir)) {
    const stat = fs.statSync(dumpDir);
    if (!stat.isDirectory()) {
      throw new RestoreLessonAbortError(23, `Dump path ${dumpDir} exists and is not a directory.`);
    }
    if ((stat.mode & 0o077) !== 0) {
      throw new RestoreLessonAbortError(
        23,
        `Dump directory ${dumpDir} is group/world-readable (mode ${(stat.mode & 0o777).toString(
          8
        )}). Refusing to write a whole-database dump into it. Run "chmod 700 ${dumpDir}" and re-run.`
      );
    }
    return;
  }
  fs.mkdirSync(dumpDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dumpDir, 0o700);
}

export interface RunPgDumpOptions {
  dumpPath: string;
}
export type RunPgDump = (options: RunPgDumpOptions) => Promise<void>;

const execFileAsync = promisify(execFile);

/** Real `pg_dump -Fc`, using the same credentials `PGStorage` connects with.
 * Injectable (`RunPgDump`) so contract tests never shell out. */
export const realRunPgDump: RunPgDump = async ({ dumpPath }) => {
  const db = secrets.db;
  const args = ["-Fc", "-f", dumpPath, "-U", db.username, db.database];
  await execFileAsync("pg_dump", args, {
    env: { ...process.env, PGPASSWORD: db.password },
  });
};

/**
 * Produces the pre-write production dump (contract §restore-english
 * precondition 6, side effects): ensures `dumpDir` is safe (23), checks
 * cumulative headroom (23) against a FRESH free-space read, runs `pg_dump`
 * scoped under a narrow umask (process-wide would also affect the
 * subsequently-written app-readable ODT/preview — plan.md §Security &
 * Privacy), then asserts the file landed and re-asserts its mode `0600`.
 */
async function produceDump(
  sql: SqlFunc,
  dumpDir: string,
  runPgDump: RunPgDump,
  diskHeadroomOps: DiskHeadroomOps
): Promise<string> {
  ensureDumpDirectory(dumpDir);
  const dbSizeBytes = await diskHeadroomOps.getDatabaseSizeBytes(sql);
  checkDumpHeadroomOrAbort(dumpDir, dbSizeBytes, diskHeadroomOps.getFreeDiskBytes);

  const dumpPath = path.join(dumpDir, `restore-english-${Date.now()}-${process.pid}.dump`);
  const previousUmask = process.umask(0o077);
  try {
    await runPgDump({ dumpPath });
  } catch (err) {
    throw new RestoreLessonAbortError(
      23,
      `pg_dump into ${dumpPath} failed: ${redactConnectionString(String(err))}`
    );
  } finally {
    process.umask(previousUmask);
  }

  if (!fs.existsSync(dumpPath)) {
    throw new RestoreLessonAbortError(
      23,
      `pg_dump reported success but ${dumpPath} does not exist.`
    );
  }
  fs.chmodSync(dumpPath, 0o600);
  return dumpPath;
}

// ─────────────────────────────────────────────────────────────────────────
// restore-english — real upload/relink/webify deps
// ─────────────────────────────────────────────────────────────────────────

/**
 * The real `RestoreEnglishDeps`, backing `uploadEnglishDoc`/`webifyLesson`
 * through a dedicated `PGStorage` (separate from the advisory-lock/dump
 * connection — `uploadEnglishDoc` needs `Persistence`, not raw `SqlFunc`).
 * `relink` (the `--force-relink` fallback) is deliberately unimplemented in
 * this build: research D5 resolved the spec/brainstorm tension by ordering —
 * the verified upload pathway serves this incident, and a `DiagnosisReport`
 * alone carries no full `lessonstrings` generation to reconstruct a direct
 * re-link from. `--force-relink` still parses and dispatches (so a future
 * build can wire a real implementation without a CLI-surface change), it
 * just aborts with a clear message rather than writing something unverified.
 */
function makeRealRestoreEnglishDeps(storage: PGStorage): RestoreEnglishDeps {
  return {
    upload: async (file, meta) => {
      const lesson = await uploadEnglishDoc(
        file as unknown as UploadedFile,
        {
          languageId: meta.languageId,
          book: meta.book as Book,
          series: meta.series,
          lesson: meta.lesson,
        },
        storage
      );
      return { lessonId: lesson.lessonId, version: lesson.version };
    },
    relink: async (): Promise<RestoredLessonResult> => {
      throw new RestoreLessonAbortError(
        1,
        "--force-relink has no implementation in this build: the direct re-link fallback has no " +
          "source data to reconstruct lessonstrings from (research D5). Use --master-document " +
          "instead."
      );
    },
    webify: async (restored) => {
      const lesson = await storage.lesson(restored.lessonId);
      // `force: true` bypasses `webifyLesson`'s `NODE_ENV=test` no-op guard
      // (`src/server/actions/webifyLesson.ts`). Outside test this is a no-op
      // change (the guard never triggers there). Forcing it here — rather
      // than leaving the real preview conversion silently skipped — is what
      // makes `restoreEnglish.ts`'s own I18 mode/owner repair-then-abort
      // check (`repairAndVerifyFileModes`, which stats the real preview path
      // this same call produces) verifiable end to end under
      // `restoreLesson.integration.test.ts`'s real-upload-path harness,
      // instead of unconditionally ENOENT-ing on a preview file that was
      // never written.
      if (lesson) await webifyLesson(lesson, { force: true });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// restoreEnglish() core
// ─────────────────────────────────────────────────────────────────────────

export interface RestoreEnglishCliOptions {
  productionSql: SqlFunc;
  report: DiagnosisReport;
  /** Required unless `forceRelink` is true. */
  masterDocumentPath?: string | null;
  forceRelink?: boolean;
  dumpDir: string;
  homeDir?: string;
  docsRoot?: string;
  previewDir?: string;
  /** I18's mode/owner comparison sibling; defaults to `masterDocumentPath`
   * itself (still present post-upload thanks to the copy shim, I15). */
  siblingDocPath?: string;
  /** When given, the updated report is also flushed here (I12) — the CLI
   * wrapper always supplies this; the integration/contract-test core calls
   * may omit it to inspect the in-memory result only. */
  reportPath?: string;
  runPgDump?: RunPgDump;
  advisoryLockOps?: AdvisoryLockOps;
  diskHeadroomOps?: DiskHeadroomOps;
  /** See `WithReservedConnection`'s doc comment for why this is injectable. */
  withReservedConnection?: WithReservedConnection;
  /** Injectable for contract tests; defaults to the real upload/webify path
   * (`makeRealRestoreEnglishDeps`) with `relink` unimplemented. */
  deps?: RestoreEnglishDeps;
  fileModeOps?: FileModeOps;
  now?: () => Date;
}

/**
 * The `restore-english` orchestration core (FR-006): re-verifies every
 * precondition this subcommand owns from a checksum-gated report (identity,
 * language-identity, live production version), takes the advisory lock
 * FIRST on a dedicated connection (I14 — `sql.begin()` is this installed
 * postgres@1.0.2's only mechanism for a connection held across several
 * queries; there is no `sql.reserve()` in this version, unlike newer
 * releases the spec was written against), produces the pre-write dump under
 * cumulative headroom (I23), re-asserts the lock is still this same session
 * before using it, then delegates to `restoreEnglish.ts`'s pure core for the
 * upload/relink + I18/I21 repair-then-abort sequence.
 */
export async function restoreEnglish(options: RestoreEnglishCliOptions): Promise<DiagnosisReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new RestoreLessonAbortError(
      10,
      `Production marker file missing: ${markerPath}. This tool must be run on the production host.`
    );
  }

  const sql = options.productionSql;
  const { report } = options;
  const storage = new PGConnectedStorage(sql);

  const liveFingerprint = await fetchProductionFingerprint(sql);
  verifyReportIntegrity(report, liveFingerprint.databaseName);

  if (!report.identity.snapshotIsOlder) {
    throw new RestoreLessonAbortError(
      11,
      `Report ${report.diagnosisId}'s identity.snapshotIsOlder is false; refusing to restore-english ` +
        `from a report whose Snapshot was not verified older than production at diagnose time.`
    );
  }

  if (
    report.languageIdentityChecks.length === 0 ||
    report.languageIdentityChecks.some((check) => !check.agrees)
  ) {
    throw new RestoreLessonAbortError(
      15,
      `Report ${report.diagnosisId}'s languageIdentityChecks is missing, empty, or contains a ` +
        `disagreement (I22). Either this report was hand-edited past its checksums, or diagnose ` +
        `wrote a report it should have refused to — both mean the language-identity evidence this ` +
        `subcommand needs was never established.`
    );
  }

  const affectedLesson = report.affectedLessons[0];
  if (!affectedLesson) {
    throw new RestoreLessonAbortError(1, "Report has no affectedLessons entry to restore.");
  }

  const liveLesson = await storage.fetchLessonByBookSeriesLesson(
    affectedLesson.book as Book,
    affectedLesson.series,
    affectedLesson.lesson
  );
  const expectedLiveVersion =
    report.englishRestore?.newLessonVersion ?? affectedLesson.productionVersion;
  if (!liveLesson || liveLesson.version !== expectedLiveVersion) {
    throw new RestoreLessonAbortError(
      21,
      `Production has changed since diagnosis: expected lesson version ${expectedLiveVersion}, found ` +
        `${liveLesson ? liveLesson.version : "no matching lesson"}. Re-diagnose ` +
        `(--prior-report against diagnosisId ${report.diagnosisId}) before retrying.`
    );
  }

  const runPgDump = options.runPgDump ?? realRunPgDump;
  const diskHeadroomOps = options.diskHeadroomOps ?? realDiskHeadroomOps;
  const advisoryLockOps = options.advisoryLockOps ?? realAdvisoryLockOps;
  const withReservedConnection = options.withReservedConnection ?? beginReservedConnection;
  const docsRoot = options.docsRoot ?? resolveDocsRoot();

  return withReservedConnection(sql, async (reserved: SqlFunc) => {
    const key = advisoryLockKey();
    const locked = await advisoryLockOps.tryLock(reserved, key);
    if (!locked) {
      throw new RestoreLessonAbortError(
        28,
        "Another write subcommand (restore-english/apply/verify) already holds the restoreLesson " +
          "advisory lock. Wait for it to finish, or investigate a stuck process before retrying."
      );
    }
    const backendPid = await advisoryLockOps.backendPid(reserved);

    try {
      const dumpPath = await produceDump(reserved, options.dumpDir, runPgDump, diskHeadroomOps);

      let stillHeldPid: number;
      try {
        stillHeldPid = await advisoryLockOps.backendPid(reserved);
      } catch (err) {
        throw new RestoreLessonAbortError(
          28,
          `The restoreLesson advisory lock's connection was lost during the dump: ${String(err)}. ` +
            `Refusing to proceed — another process may have acquired the lock in the interval.`
        );
      }
      if (stillHeldPid !== backendPid) {
        throw new RestoreLessonAbortError(
          28,
          `The restoreLesson advisory lock's connection changed mid-run (backend pid ${backendPid} ` +
            `-> ${stillHeldPid}), meaning the session — and its lock — was silently lost. Refusing to ` +
            `re-acquire; another process may have held it in the interval.`
        );
      }

      // `new PGStorage()` opens its OWN connection via `dbConnect()`
      // (`secrets.db`, unconditionally), ignoring `options.productionSql`
      // entirely — on a real production host that happens to coincide with
      // the same database (the whole point of the tool), but under this
      // module's own test harness `options.productionSql` is the TEST
      // database while `secrets.db` points at a different one. That mismatch
      // silently wrote every restored English document into the WRONG
      // database, so the version this function computed
      // (`affectedLesson.productionVersion + 1`, derived from
      // `options.productionSql`) diverged from the version
      // `uploadEnglishDoc` actually assigned there (derived from whatever
      // unrelated lesson row already existed in `secrets.db`) — the root
      // cause of `restoreLesson.integration.test.ts`'s ENOENT on the
      // post-upload file (5.9.3.1). `PGConnectedStorage` wraps the SAME
      // connection this function already verified identity against, so
      // every write goes through the one database this call's own
      // precondition checks (and the caller's report) actually describe.
      // That connection is owned by the caller (`options.productionSql`),
      // not by this function, so it must never be `.close()`d here.
      let deps: RestoreEnglishDeps;
      if (options.deps) {
        deps = options.deps;
      } else {
        deps = makeRealRestoreEnglishDeps(storage);
      }
      const updated = await restoreEnglishCore({
        report,
        masterDocumentPath: options.masterDocumentPath ?? null,
        forceRelink: options.forceRelink ?? false,
        dumpPath,
        docsRoot,
        previewDir: options.previewDir,
        siblingDocPath: options.siblingDocPath ?? options.masterDocumentPath ?? undefined,
        deps,
        fileModeOps: options.fileModeOps ?? realFileModeOps,
        now: options.now,
      });

      if (options.reportPath) {
        writeReportAtomic(options.reportPath, updated);
      }
      return updated;
    } finally {
      try {
        await advisoryLockOps.unlock(reserved, key);
      } catch {
        // Best-effort: the connection may already be gone, which is exactly
        // the "lock lost" case already surfaced above.
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// restore-english — argument parsing and runRestoreEnglishCommand()
// ─────────────────────────────────────────────────────────────────────────

export interface RestoreEnglishCliArgs {
  report: string;
  diagnosisId: string;
  masterDocumentPath: string | null;
  dump: string | null;
  forceRelink: boolean;
}

const KNOWN_RESTORE_ENGLISH_FLAGS = new Set([
  "--report",
  "--diagnosis-id",
  "--master-document",
  "--dump",
  "--force-relink",
]);

/** Parses `restore-english` subcommand argv per
 * specs/018-lesson1-translation-restore/contracts/cli.md §restore-english.
 * Argument errors abort with exit 1. */
export function parseRestoreEnglishArgs(argv: string[]): RestoreEnglishCliArgs {
  let report: string | null = null;
  let diagnosisId: string | null = null;
  let masterDocumentPath: string | null = null;
  let dump: string | null = null;
  let forceRelink = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_RESTORE_ENGLISH_FLAGS.has(arg)) {
      throw new RestoreLessonAbortError(1, `Unrecognized argument: ${arg}`);
    }
    switch (arg) {
      case "--report":
        report = requireValue(argv, ++i, arg);
        break;
      case "--diagnosis-id":
        diagnosisId = requireValue(argv, ++i, arg);
        break;
      case "--master-document":
        masterDocumentPath = requireValue(argv, ++i, arg);
        break;
      case "--dump":
        dump = requireValue(argv, ++i, arg);
        break;
      case "--force-relink":
        forceRelink = true;
        break;
    }
  }

  if (!report) {
    throw new RestoreLessonAbortError(1, "--report <path> is required");
  }
  if (!diagnosisId) {
    throw new RestoreLessonAbortError(1, "--diagnosis-id <id> is required");
  }
  if (!forceRelink && !masterDocumentPath) {
    throw new RestoreLessonAbortError(
      1,
      "--master-document <path> is required unless --force-relink is given"
    );
  }

  return { report, diagnosisId, masterDocumentPath, dump, forceRelink };
}

export interface RunRestoreEnglishCommandOptions {
  argv: string[];
  homeDir?: string;
  docsRoot?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  connectProduction?: () => Promise<SqlFunc> | SqlFunc;
  closeSql?: (sql: SqlFunc) => Promise<void>;
  runPgDump?: RunPgDump;
  advisoryLockOps?: AdvisoryLockOps;
  diskHeadroomOps?: DiskHeadroomOps;
  withReservedConnection?: WithReservedConnection;
  deps?: RestoreEnglishDeps;
  fileModeOps?: FileModeOps;
}

/** Runs the `restore-english` subcommand end to end: argv parsing, the
 * host-local/report-load preconditions, the production connection, and exit
 * code mapping per contracts/cli.md's exit code table (0,11,15,20,21,22,23,
 * 28,31,1). Never throws. */
export async function runRestoreEnglishCommand(
  options: RunRestoreEnglishCommandOptions
): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const connectProduction = options.connectProduction ?? defaultConnectProduction;
  const closeSql = options.closeSql ?? defaultCloseSql;
  const homeDir = options.homeDir ?? os.homedir();
  const docsRoot = options.docsRoot ?? resolveDocsRoot();

  let productionSql: SqlFunc | null = null;

  try {
    const args = parseRestoreEnglishArgs(options.argv);

    const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
    if (!fs.existsSync(markerPath)) {
      throw new RestoreLessonAbortError(10, `Production marker file missing: ${markerPath}.`);
    }

    if (!fs.existsSync(args.report)) {
      throw new RestoreLessonAbortError(20, `Report not found at ${args.report}.`);
    }
    const report = loadReport(args.report);
    if (report.diagnosisId !== args.diagnosisId) {
      throw new RestoreLessonAbortError(
        20,
        `--diagnosis-id ${args.diagnosisId} does not match the report's diagnosisId ` +
          `(${report.diagnosisId}) at ${args.report}.`
      );
    }

    productionSql = await connectProduction();

    const updated = await restoreEnglish({
      productionSql,
      report,
      masterDocumentPath: args.masterDocumentPath,
      forceRelink: args.forceRelink,
      dumpDir: args.dump ?? path.dirname(args.report),
      homeDir,
      docsRoot,
      reportPath: args.report,
      runPgDump: options.runPgDump,
      advisoryLockOps: options.advisoryLockOps,
      diskHeadroomOps: options.diskHeadroomOps,
      withReservedConnection: options.withReservedConnection,
      deps: options.deps,
      fileModeOps: options.fileModeOps,
    });

    stdout(
      `OK English master restored (diagnosisId=${updated.diagnosisId}, method=` +
        `${updated.englishRestore?.method}, newLessonVersion=${updated.englishRestore?.newLessonVersion}). ` +
        `Dump: ${updated.englishRestore?.dumpPath}`
    );
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
    if (productionSql) await closeSql(productionSql);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// apply() core — I11 drift re-check, I24 batch failure, I12 flush, max-writes
// ─────────────────────────────────────────────────────────────────────────

/** `--max-writes`'s computed default (precondition 10): the affected
 * lesson's snapshot-reachable translation count × 1.2, summed over the
 * scoped languages only when `languageIds` restricts the run — a
 * whole-corpus cap is no cap at all for a one-language run. */
export function computeMaxWritesDefault(
  report: DiagnosisReport,
  languageIds: number[] | null
): number {
  const scoped =
    languageIds === null
      ? report.perLanguageCounts
      : report.perLanguageCounts.filter((counts) => languageIds.includes(counts.languageId));
  const totalReachable = scoped.reduce((sum, counts) => sum + counts.snapshotReachable, 0);
  return Math.floor(totalReachable * 1.2);
}

/** Merges I11 drift-recheck findings that reclassified as `conflict` or
 * `newerWork` into `existing` (diagnose-time conflicts), deduped by
 * `(languageId, snapshotMasterId)` — a re-check hitting a pair diagnose
 * already reported as a conflict must not duplicate it. */
function mergeConflicts(
  existing: TranslationFinding[],
  recheckConflicts: TranslationFinding[]
): TranslationFinding[] {
  const merged = [...existing];
  for (const finding of recheckConflicts) {
    const already = merged.some(
      (c) => c.languageId === finding.languageId && c.snapshotMasterId === finding.snapshotMasterId
    );
    if (!already) merged.push(finding);
  }
  return merged;
}

export interface ApplyCoreOptions {
  productionSql: SqlFunc;
  report: DiagnosisReport;
  /** Precondition 9: apply never runs off a report the operator did not name. */
  diagnosisId: string;
  dumpDir: string;
  homeDir?: string;
  /** `--languages`; null/omitted = whole corpus. */
  languages?: number[] | null;
  /** `--max-writes`; null/omitted = the computed default (precondition 10). */
  maxWrites?: number | null;
  /** When given, `applyState`/`appliedWrites`/`driftSkips` are flushed here
   * after EVERY per-language batch (I12), and each write/skip is also
   * appended to this report's derived journal. The CLI wrapper always
   * supplies this; the integration/contract-test core calls may omit it. */
  reportPath?: string;
  runPgDump?: RunPgDump;
  advisoryLockOps?: AdvisoryLockOps;
  diskHeadroomOps?: DiskHeadroomOps;
  /** See `WithReservedConnection`'s doc comment for why this is injectable. */
  withReservedConnection?: WithReservedConnection;
  /** Injectable for contract tests; defaults to a real `PGStorage`. Only
   * `saveTStrings` is required by `restoreWrite.ts` (I4); `updateProgress`
   * is called explicitly afterward (I10) when the double provides it. */
  persistence?: Pick<Persistence, "saveTStrings"> & { updateProgress?: () => Promise<void> };
  now?: () => Date;
}

/**
 * The `apply` orchestration core (FR-007..FR-011, FR-014): re-verifies every
 * precondition this subcommand owns from a checksum-gated report, derives
 * the write plan from `report.mappings`/`report.findings` (I8, `planWrites.ts`),
 * enforces the `--max-writes` sanity cap BEFORE any write (precondition 10),
 * then takes the advisory lock, produces the pre-apply dump, and writes one
 * language at a time — immediately before each batch, re-fetching live
 * production rows and re-running `classify.ts`'s classification against them
 * (I11), reusing `report.mappings` verbatim and never recomputing them.
 * Flushes `applyState`/`appliedWrites`/`driftSkips` to `reportPath` (and its
 * journal) after every batch (I12). A `saveTStrings` throw stops the run
 * immediately and aborts (32); the run otherwise returns normally whether or
 * not non-benign drift occurred — `runApplyCommand` decides exit 0 vs 27.
 */
export async function apply(options: ApplyCoreOptions): Promise<DiagnosisReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new RestoreLessonAbortError(
      10,
      `Production marker file missing: ${markerPath}. This tool must be run on the production host.`
    );
  }

  const sql = options.productionSql;
  const { report } = options;
  const storage = new PGConnectedStorage(sql);

  const liveFingerprint = await fetchProductionFingerprint(sql);
  verifyReportIntegrity(report, liveFingerprint.databaseName);

  if (report.diagnosisId !== options.diagnosisId) {
    throw new RestoreLessonAbortError(
      20,
      `--diagnosis-id ${options.diagnosisId} does not match the report's diagnosisId ` +
        `(${report.diagnosisId}).`
    );
  }

  if (!report.identity.snapshotIsOlder) {
    throw new RestoreLessonAbortError(
      11,
      `Report ${report.diagnosisId}'s identity.snapshotIsOlder is false; refusing to apply from a ` +
        `report whose Snapshot was not verified older than production at diagnose time.`
    );
  }

  if (
    report.languageIdentityChecks.length === 0 ||
    report.languageIdentityChecks.some((check) => !check.agrees)
  ) {
    throw new RestoreLessonAbortError(
      15,
      `Report ${report.diagnosisId}'s languageIdentityChecks is missing, empty, or contains a ` +
        `disagreement (I22).`
    );
  }

  if (report.affectedLessons.length !== 1) {
    throw new RestoreLessonAbortError(
      29,
      `Report's affectedLessons contains ${report.affectedLessons.length} entries; apply expects ` +
        `exactly the one named lesson — a detection surprise cannot quietly widen the blast radius.`
    );
  }
  const affectedLesson = report.affectedLessons[0];

  const englishRestore = report.englishRestore;
  if (!englishRestore) {
    throw new RestoreLessonAbortError(
      24,
      `Report ${report.diagnosisId} has no englishRestore entry (own or carried via ` +
        `--prior-report). English master not yet restored — there is no spine to attach ` +
        `translations to.`
    );
  }

  const liveLesson = await storage.fetchLessonByBookSeriesLesson(
    affectedLesson.book as Book,
    affectedLesson.series,
    affectedLesson.lesson
  );
  const expectedLiveVersion = englishRestore.newLessonVersion;
  if (!liveLesson || liveLesson.version !== expectedLiveVersion) {
    throw new RestoreLessonAbortError(
      21,
      `Production has changed since diagnosis: expected lesson version ${expectedLiveVersion}, found ` +
        `${liveLesson ? liveLesson.version : "no matching lesson"}. Re-diagnose ` +
        `(--prior-report against diagnosisId ${report.diagnosisId}) before retrying.`
    );
  }

  const languageScope = options.languages ?? null;
  const plannedWrites = planWrites({
    mappings: report.mappings,
    findings: report.findings,
    languageIds: languageScope,
  });

  const maxWrites = options.maxWrites ?? computeMaxWritesDefault(report, languageScope);
  if (plannedWrites.length > maxWrites) {
    throw new RestoreLessonAbortError(
      25,
      `Write plan (${plannedWrites.length} writes) exceeds --max-writes (${maxWrites}` +
        `${options.maxWrites == null ? ", the computed default" : ""}). This suggests a mapping ` +
        `failure, not a big recovery. Aborting before any write.`
    );
  }

  const runPgDump = options.runPgDump ?? realRunPgDump;
  const diskHeadroomOps = options.diskHeadroomOps ?? realDiskHeadroomOps;
  const advisoryLockOps = options.advisoryLockOps ?? realAdvisoryLockOps;
  const withReservedConnection = options.withReservedConnection ?? beginReservedConnection;
  const now = options.now ?? (() => new Date());

  return withReservedConnection(sql, async (reserved: SqlFunc) => {
    const key = advisoryLockKey();
    const locked = await advisoryLockOps.tryLock(reserved, key);
    if (!locked) {
      throw new RestoreLessonAbortError(
        28,
        "Another write subcommand (restore-english/apply/verify) already holds the restoreLesson " +
          "advisory lock. Wait for it to finish, or investigate a stuck process before retrying."
      );
    }
    const backendPid = await advisoryLockOps.backendPid(reserved);

    try {
      const preApplyDumpPath = await produceDump(
        reserved,
        options.dumpDir,
        runPgDump,
        diskHeadroomOps
      );

      // `PGConnectedStorage` below wraps `sql` (`options.productionSql`) rather
      // than opening its own connection — that connection is owned and closed
      // by this subcommand's caller (e.g. `runApplyCli`'s `closeSql`), never
      // here, so there is no local `storage.close()` to run in this `finally`.
      const persistence: Pick<Persistence, "saveTStrings"> & {
        updateProgress?: () => Promise<void>;
      } = options.persistence ?? storage;

      try {
        const journalPath = options.reportPath ? journalPathForReport(options.reportPath) : null;

        const writesByLanguage = new Map<number, RestoreWrite[]>();
        for (const write of plannedWrites) {
          const batch = writesByLanguage.get(write.languageId);
          if (batch) batch.push(write);
          else writesByLanguage.set(write.languageId, [write]);
        }
        const languageIds = Array.from(writesByLanguage.keys()).sort((a, b) => a - b);

        const initialApplyState: ApplyState = {
          startedAt: now().toISOString(),
          scopedLanguageIds: languageScope,
          languageBatches: [],
          completedAt: null,
        };
        let workingReport: DiagnosisReport = {
          ...report,
          mode: "apply",
          preApplyDumpPath,
          applyState: initialApplyState,
          appliedWrites: report.appliedWrites ? [...report.appliedWrites] : [],
          driftSkips: report.driftSkips ? [...report.driftSkips] : [],
        };

        // Recomputes reportChecksum on every call, whether or not
        // `reportPath` is given (I13) — a core call with no `reportPath`
        // (contract tests, the integration harness) must still return a
        // report whose checksum verifies against its own content.
        const flush = (): void => {
          workingReport = {
            ...workingReport,
            reportChecksum: computeReportChecksum(workingReport),
          };
          if (options.reportPath) {
            writeReportAtomic(options.reportPath, workingReport);
          }
        };

        const newConflicts: TranslationFinding[] = [];

        for (const languageId of languageIds) {
          // Re-assert the lock is still held before EACH batch (28) — never
          // silently re-acquire.
          let stillHeldPid: number;
          try {
            stillHeldPid = await advisoryLockOps.backendPid(reserved);
          } catch (err) {
            throw new RestoreLessonAbortError(
              28,
              `The restoreLesson advisory lock's connection was lost before the languageId=${languageId} ` +
                `batch: ${String(err)}. Refusing to proceed — another process may have acquired the ` +
                `lock in the interval.`
            );
          }
          if (stillHeldPid !== backendPid) {
            throw new RestoreLessonAbortError(
              28,
              `The restoreLesson advisory lock's connection changed mid-run (backend pid ${backendPid} ` +
                `-> ${stillHeldPid}) before the languageId=${languageId} batch, meaning the session — ` +
                `and its lock — was silently lost. Refusing to re-acquire.`
            );
          }

          const languageWrites = writesByLanguage.get(languageId) ?? [];

          // I11 drift re-check: immediately before this batch, re-fetch live
          // production rows for its (languageId, masterId) pairs via the
          // same unfiltered raw SQL as diagnosis, and re-run classify.ts's
          // classification — REUSING report.mappings verbatim, never
          // recomputing them.
          const batchFindings = report.findings.filter(
            (finding) =>
              finding.classification === "restore" &&
              finding.languageId === languageId &&
              languageWrites.some((write) => write.masterId === finding.productionMasterId)
          );
          const relevantMasterIds = Array.from(
            new Set(batchFindings.map((finding) => finding.productionMasterId as number))
          );
          const liveProductionRows = await fetchProductionTStringsWithModified(
            reserved,
            relevantMasterIds
          );
          const relevantMappings = report.mappings.filter((mapping) =>
            batchFindings.some((finding) => finding.snapshotMasterId === mapping.snapshotMasterId)
          );
          const firstFinding = batchFindings[0];
          const languageForRecheck = {
            languageId,
            name: firstFinding?.languageName ?? String(languageId),
            code: "",
            motherTongue: false,
            progress: [],
            defaultSrcLang: 0,
            archived: firstFinding?.languageArchived ?? false,
          };
          const snapshotTStringsForRecheck: TString[] = batchFindings.map((finding) => ({
            masterId: finding.snapshotMasterId,
            languageId,
            text: finding.snapshotText as string,
            history: [],
            sourceLanguageId: null,
            source: null,
            lessonStringId: null,
          }));
          const recheckFindings = classifyFindings({
            mappings: relevantMappings,
            languages: [languageForRecheck],
            snapshotTStrings: snapshotTStringsForRecheck,
            productionTStrings: liveProductionRows,
          });

          const driftSkipsThisBatch: DriftSkip[] = [];
          const writesToApply: RestoreWrite[] = [];
          for (const write of languageWrites) {
            const recheck = recheckFindings.find(
              (finding) => finding.productionMasterId === write.masterId
            );
            if (recheck && recheck.classification === "restore") {
              writesToApply.push(write);
            } else {
              const reclassifiedAs = (recheck?.classification ?? "lost") as Exclude<
                TranslationClassification,
                "restore"
              >;
              driftSkipsThisBatch.push({
                languageId,
                masterId: write.masterId,
                plannedText: write.text,
                liveProductionText: recheck?.productionText ?? null,
                reclassifiedAs,
                benign: reclassifiedAs === "intact",
                detectedAt: now().toISOString(),
              });
              if (
                recheck &&
                (recheck.classification === "conflict" || recheck.classification === "newerWork")
              ) {
                newConflicts.push(recheck);
              }
            }
          }

          try {
            const savedTStrings =
              writesToApply.length > 0 ? await restoreWrite(persistence, writesToApply) : [];
            if (persistence.updateProgress) await persistence.updateProgress();

            const appliedWritesThisBatch: AppliedWrite[] = savedTStrings.map((saved) => ({
              languageId: saved.languageId,
              masterId: saved.masterId,
              text: saved.text,
              overwrote: saved.history.length > 0 ? saved.history[saved.history.length - 1] : null,
              appliedAt: now().toISOString(),
            }));

            if (journalPath) {
              for (const appliedWrite of appliedWritesThisBatch) {
                appendJournalLine(journalPath, {
                  diagnosisId: report.diagnosisId,
                  type: "appliedWrite",
                  ...appliedWrite,
                });
              }
              for (const driftSkip of driftSkipsThisBatch) {
                appendJournalLine(journalPath, {
                  diagnosisId: report.diagnosisId,
                  type: "driftSkip",
                  ...driftSkip,
                });
              }
            }

            const completedBatch: LanguageBatch = {
              languageId,
              status: "completed",
              writesAttempted: languageWrites.length,
              writesApplied: appliedWritesThisBatch.length,
              driftSkipped: driftSkipsThisBatch.length,
              failureMessage: null,
              completedAt: now().toISOString(),
            };
            workingReport = {
              ...workingReport,
              appliedWrites: [...(workingReport.appliedWrites ?? []), ...appliedWritesThisBatch],
              driftSkips: [...(workingReport.driftSkips ?? []), ...driftSkipsThisBatch],
              applyState: {
                ...(workingReport.applyState as ApplyState),
                languageBatches: [
                  ...(workingReport.applyState as ApplyState).languageBatches,
                  completedBatch,
                ],
              },
            };
            flush();
          } catch (err) {
            const failedBatch: LanguageBatch = {
              languageId,
              status: "failed",
              writesAttempted: languageWrites.length,
              writesApplied: 0,
              driftSkipped: driftSkipsThisBatch.length,
              failureMessage: err instanceof Error ? err.message : String(err),
              completedAt: now().toISOString(),
            };
            workingReport = {
              ...workingReport,
              driftSkips: [...(workingReport.driftSkips ?? []), ...driftSkipsThisBatch],
              applyState: {
                ...(workingReport.applyState as ApplyState),
                languageBatches: [
                  ...(workingReport.applyState as ApplyState).languageBatches,
                  failedBatch,
                ],
              },
            };
            flush();
            throw new RestoreLessonAbortError(
              32,
              `A language batch (languageId=${languageId}) failed and the run stopped — no further ` +
                `languages were attempted: ${err instanceof Error ? err.message : String(err)}. ` +
                `Journal: ${journalPath ?? "(no --report given, no journal written)"}. Pre-apply dump: ` +
                `${preApplyDumpPath}. Re-diagnose with --prior-report before retrying.`
            );
          }
        }

        // Reconcile appliedWrites/driftSkips from the journal (I12, I27): the
        // journal is never rewritten and wins on any disagreement — this
        // also naturally accumulates across repeated apply() invocations
        // against the same --report (I5's idempotent rerun), since each run
        // appends to the same journal file.
        if (journalPath) {
          const journalLines = readJournalLines(journalPath).filter(
            (line) => line.diagnosisId === report.diagnosisId
          );
          const reconciledAppliedWrites: AppliedWrite[] = journalLines
            .filter((line) => line.type === "appliedWrite")
            .map((line) => ({
              languageId: line.languageId as number,
              masterId: line.masterId as number,
              text: line.text as string,
              overwrote: (line.overwrote as string | null) ?? null,
              appliedAt: line.appliedAt as string,
            }));
          const reconciledDriftSkips: DriftSkip[] = journalLines
            .filter((line) => line.type === "driftSkip")
            .map((line) => ({
              languageId: line.languageId as number,
              masterId: line.masterId as number,
              plannedText: line.plannedText as string,
              liveProductionText: (line.liveProductionText as string | null) ?? null,
              reclassifiedAs: line.reclassifiedAs as Exclude<TranslationClassification, "restore">,
              benign: line.benign as boolean,
              detectedAt: line.detectedAt as string,
            }));
          workingReport = {
            ...workingReport,
            appliedWrites: reconciledAppliedWrites,
            driftSkips: reconciledDriftSkips,
          };
        }

        workingReport = {
          ...workingReport,
          applyState: {
            ...(workingReport.applyState as ApplyState),
            completedAt: now().toISOString(),
          },
          conflicts: mergeConflicts(report.conflicts, newConflicts),
        };
        flush();
        return workingReport;
      } finally {
        // (no local storage to close — see the `persistence` comment above)
      }
    } finally {
      try {
        await advisoryLockOps.unlock(reserved, key);
      } catch {
        // Best-effort: the connection may already be gone, which is exactly
        // the "lock lost" case already surfaced above.
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// apply — argument parsing and runApplyCommand()
// ─────────────────────────────────────────────────────────────────────────

export interface ApplyCliArgs {
  report: string;
  diagnosisId: string;
  dump: string | null;
  languages: number[] | null;
  maxWrites: number | null;
}

const KNOWN_APPLY_FLAGS = new Set([
  "--report",
  "--diagnosis-id",
  "--dump",
  "--languages",
  "--max-writes",
]);

/** Parses `apply` subcommand argv per
 * specs/018-lesson1-translation-restore/contracts/cli.md §apply. Argument
 * errors abort with exit 1. */
export function parseApplyArgs(argv: string[]): ApplyCliArgs {
  let report: string | null = null;
  let diagnosisId: string | null = null;
  let dump: string | null = null;
  let languagesRaw: string | null = null;
  let maxWritesRaw: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_APPLY_FLAGS.has(arg)) {
      throw new RestoreLessonAbortError(1, `Unrecognized argument: ${arg}`);
    }
    switch (arg) {
      case "--report":
        report = requireValue(argv, ++i, arg);
        break;
      case "--diagnosis-id":
        diagnosisId = requireValue(argv, ++i, arg);
        break;
      case "--dump":
        dump = requireValue(argv, ++i, arg);
        break;
      case "--languages":
        languagesRaw = requireValue(argv, ++i, arg);
        break;
      case "--max-writes":
        maxWritesRaw = requireValue(argv, ++i, arg);
        break;
    }
  }

  if (!report) {
    throw new RestoreLessonAbortError(1, "--report <path> is required");
  }
  if (!diagnosisId) {
    throw new RestoreLessonAbortError(
      1,
      "--diagnosis-id <id> is required (apply never runs off a report the operator did not name)"
    );
  }

  let languages: number[] | null = null;
  if (languagesRaw !== null) {
    languages = languagesRaw.split(",").map((raw) => {
      const n = Number(raw.trim());
      if (!Number.isInteger(n)) {
        throw new RestoreLessonAbortError(1, `--languages contains a non-integer value: ${raw}`);
      }
      return n;
    });
  }

  let maxWrites: number | null = null;
  if (maxWritesRaw !== null) {
    const n = Number(maxWritesRaw);
    if (!Number.isInteger(n) || n < 0) {
      throw new RestoreLessonAbortError(
        1,
        `--max-writes must be a non-negative integer: ${maxWritesRaw}`
      );
    }
    maxWrites = n;
  }

  return { report, diagnosisId, dump, languages, maxWrites };
}

export interface RunApplyCommandOptions {
  argv: string[];
  homeDir?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  connectProduction?: () => Promise<SqlFunc> | SqlFunc;
  closeSql?: (sql: SqlFunc) => Promise<void>;
  runPgDump?: RunPgDump;
  advisoryLockOps?: AdvisoryLockOps;
  diskHeadroomOps?: DiskHeadroomOps;
  withReservedConnection?: WithReservedConnection;
  persistence?: Pick<Persistence, "saveTStrings"> & { updateProgress?: () => Promise<void> };
}

/** Runs the `apply` subcommand end to end: argv parsing, the host-local/
 * report-load preconditions, the production connection, and exit code
 * mapping per contracts/cli.md's exit code table
 * (0,11,15,20,21,24,25,27,28,29,32,1). Never throws. */
export async function runApplyCommand(options: RunApplyCommandOptions): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const connectProduction = options.connectProduction ?? defaultConnectProduction;
  const closeSql = options.closeSql ?? defaultCloseSql;
  const homeDir = options.homeDir ?? os.homedir();

  let productionSql: SqlFunc | null = null;

  try {
    const args = parseApplyArgs(options.argv);

    const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
    if (!fs.existsSync(markerPath)) {
      throw new RestoreLessonAbortError(10, `Production marker file missing: ${markerPath}.`);
    }

    if (!fs.existsSync(args.report)) {
      throw new RestoreLessonAbortError(20, `Report not found at ${args.report}.`);
    }
    const report = loadReport(args.report);
    if (report.diagnosisId !== args.diagnosisId) {
      throw new RestoreLessonAbortError(
        20,
        `--diagnosis-id ${args.diagnosisId} does not match the report's diagnosisId ` +
          `(${report.diagnosisId}) at ${args.report}.`
      );
    }

    productionSql = await connectProduction();

    const updated = await apply({
      productionSql,
      report,
      diagnosisId: args.diagnosisId,
      dumpDir: args.dump ?? path.dirname(args.report),
      homeDir,
      languages: args.languages,
      maxWrites: args.maxWrites,
      reportPath: args.report,
      runPgDump: options.runPgDump,
      advisoryLockOps: options.advisoryLockOps,
      diskHeadroomOps: options.diskHeadroomOps,
      withReservedConnection: options.withReservedConnection,
      persistence: options.persistence,
    });

    const appliedCount = updated.appliedWrites?.length ?? 0;
    const driftCount = updated.driftSkips?.length ?? 0;
    const nonBenignDrift = (updated.driftSkips ?? []).some((skip) => !skip.benign);

    if (nonBenignDrift) {
      stdout(
        `DRIFT apply completed with non-benign drift (diagnosisId=${updated.diagnosisId}): ` +
          `${appliedCount} write(s) applied, ${driftCount} withheld because production changed. ` +
          `Re-run diagnose.`
      );
      return 27;
    }

    stdout(
      `OK apply complete (diagnosisId=${updated.diagnosisId}): ${appliedCount} write(s) applied` +
        (driftCount > 0 ? `, ${driftCount} benign drift skip(s)` : "") +
        "."
    );
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
    if (productionSql) await closeSql(productionSql);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// verify — advisory lock (I14), duplicate sweep (I19), client Markdown
// ─────────────────────────────────────────────────────────────────────────

/** Languages named by a set of `languageId`s, for the DRAFT/INTERIM banners —
 * never `masterId`/`lessonStringId` (forbidden content, contract §verify
 * Client-report content rules). */
function languageNamesFor(languageIds: number[], counts: LanguageCounts[]): string[] {
  const byId = new Map(counts.map((c) => [c.languageId, c.languageName]));
  return Array.from(new Set(languageIds)).map((id) => byId.get(id) ?? `language ${id}`);
}

/**
 * The I19 sweep's delta against `duplicateRowsBaseline` (contract §verify
 * "Duplicate-row sweep"): rows whose `(languageId, masterId, lessonStringId)`
 * key is either new or has grown compared to the baseline. Pre-existing
 * duplicates unaffected by this run are excluded, so the recovery is never
 * blamed for a data defect it did not cause.
 */
export function duplicateRowDelta(
  duplicateRows: DuplicateRow[],
  duplicateRowsBaseline: DuplicateRow[]
): DuplicateRow[] {
  const baselineByKey = new Map<string, number>();
  for (const row of duplicateRowsBaseline) {
    baselineByKey.set(
      `${row.languageId}:${row.masterId}:${row.lessonStringId ?? "null"}`,
      row.rowCount
    );
  }
  return duplicateRows.filter((row) => {
    const key = `${row.languageId}:${row.masterId}:${row.lessonStringId ?? "null"}`;
    const baselineCount = baselineByKey.get(key);
    return baselineCount === undefined || row.rowCount > baselineCount;
  });
}

/**
 * Builds the client-facing Markdown report (contract §verify Output,
 * Client-report content rules). Permitted content only: counts, language
 * names, lesson identity, conflict sample text (translation content the
 * client owns), the `diagnosisId`, dates. Never credentials, connection
 * strings, IP addresses, filesystem paths, database names, stack traces, or
 * `masterId`/`lessonStringId` internals. Real Markdown headings/tables, no
 * ASCII art, so it survives an email client and a screen reader.
 */
export function buildVerifyMarkdown(params: {
  report: DiagnosisReport;
  perLanguageCounts: LanguageCounts[];
  duplicateDelta: DuplicateRow[];
  coverage: "complete" | "partial";
  unappliedLanguageIds: number[];
  mode: "snapshot" | "offline";
  verifiedAt: string;
}): string {
  const {
    report,
    perLanguageCounts,
    duplicateDelta,
    coverage,
    unappliedLanguageIds,
    mode,
    verifiedAt,
  } = params;
  const lines: string[] = [];

  if (duplicateDelta.length > 0) {
    const affected = languageNamesFor(
      duplicateDelta.map((row) => row.languageId),
      perLanguageCounts
    );
    lines.push("# DRAFT — DO NOT SEND");
    lines.push("");
    lines.push(
      `This report was withheld from the client: this run's duplicate-row sweep found ` +
        `${duplicateDelta.length} new duplicate translation row(s) affecting ${affected.join(", ")}. ` +
        `A human must resolve these before this report is sent.`
    );
    lines.push("");
  }

  if (coverage === "partial") {
    const outstanding = languageNamesFor(unappliedLanguageIds, perLanguageCounts);
    lines.push("# INTERIM — Partial Restoration");
    lines.push("");
    lines.push(
      `This run restored a scoped subset of languages. Outstanding (not yet applied): ` +
        `${outstanding.length > 0 ? outstanding.join(", ") : "none named"}.` +
        (report.priorDiagnosisId
          ? " This report describes only the remainder this run planned; earlier languages were " +
            "applied under an earlier report."
          : "")
    );
    lines.push("");
  }

  const affectedLesson = report.affectedLessons[0];
  lines.push("# Lesson Restoration Verification");
  lines.push("");
  lines.push(
    `- Lesson: ${affectedLesson?.book ?? ""} series ${affectedLesson?.series ?? ""} lesson ${
      affectedLesson?.lesson ?? ""
    }`
  );
  lines.push(`- Diagnosis ID: ${report.diagnosisId}`);
  lines.push(`- Verified at: ${verifiedAt}`);
  lines.push(
    `- Mode: ${
      mode === "offline"
        ? "offline (snapshot-independent — computed from the stored report and live production only)"
        : "snapshot comparison"
    }`
  );
  lines.push("");

  lines.push("## Per-language translation counts");
  lines.push("");
  lines.push("| Language | Before | After | Restored | Withheld (drift) |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const counts of perLanguageCounts) {
    lines.push(
      `| ${counts.languageName} | ${counts.productionReachableBefore} | ` +
        `${counts.productionReachableAfter ?? "n/a"} | ${counts.restored} | ${counts.driftSkipped} |`
    );
  }
  lines.push("");

  lines.push("## Outstanding conflicts");
  lines.push("");
  if (report.conflicts.length === 0) {
    lines.push("None — every restorable translation was reattached without conflict.");
  } else {
    lines.push("| Language | Sample text |");
    lines.push("| --- | --- |");
    for (const conflict of report.conflicts) {
      const sample = conflict.productionText ?? conflict.snapshotText ?? "";
      lines.push(`| ${conflict.languageName} | ${sample.replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("");

  lines.push("## Post-restore checks");
  lines.push("");
  if (report.englishRestore) {
    lines.push(
      `- This lesson is now at version ${report.englishRestore.newLessonVersion}. TSub substitution ` +
        `suggestions for this lesson currently diff against the immediately prior version, which was ` +
        `a cover-page-only upload — some suggestions offered to translators may reflect that ` +
        `cover-page churn rather than a genuine content change.`
    );
    lines.push(
      `- The web preview for version ${report.englishRestore.newLessonVersion} is what the app now ` +
        `serves to translators.`
    );
  }
  lines.push("");

  return lines.join("\n");
}

export interface VerifyCoreOptions {
  productionSql: SqlFunc;
  report: DiagnosisReport;
  /** Precondition: verify never runs off a report the operator did not name. */
  diagnosisId: string;
  outPath: string;
  homeDir?: string;
  /** Drops the snapshot requirement; before/after come from the report's
   * stored `perLanguageCounts` plus live production only (contract §verify). */
  offline?: boolean;
  /** When given, the updated report (with `verification` appended) is
   * flushed here, recomputing `reportChecksum` (I13). */
  reportPath?: string;
  advisoryLockOps?: AdvisoryLockOps;
  withReservedConnection?: WithReservedConnection;
  /** Only `updateProgress` (I10) is required; verify performs no translation
   * writes. Defaults to a real `PGStorage` wrapping `productionSql`. */
  persistence?: { updateProgress?: () => Promise<void> };
  now?: () => Date;
}

/**
 * The `verify` orchestration core (FR-012, FR-013): re-verifies the report's
 * provenance (checksums + database name, I13), requires `appliedWrites` to be
 * recorded (exit 26), takes the advisory lock on the same terms as the write
 * subcommands (I14, exit 28) — it is not read-only, it writes
 * `languages.progress` (I10) and appends+recomputes `reportChecksum` — then
 * recomputes per-language before/after counts against live production,
 * re-runs the duplicate-row sweep (I19) and reports the delta against
 * `duplicateRowsBaseline`, and always writes the client-facing Markdown,
 * headed `DRAFT — DO NOT SEND` when the duplicate delta is non-empty and/or
 * `INTERIM` when `coverage` is `"partial"`. Never throws for a non-empty
 * duplicate delta — that is `runVerifyCommand`'s exit-code decision (parallel
 * to `apply`'s 27), not a core-level abort. No translation writes.
 */
export async function verify(options: VerifyCoreOptions): Promise<DiagnosisReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new RestoreLessonAbortError(
      10,
      `Production marker file missing: ${markerPath}. This tool must be run on the production host.`
    );
  }

  const sql = options.productionSql;
  const { report } = options;
  const storage = new PGConnectedStorage(sql);

  const liveFingerprint = await fetchProductionFingerprint(sql);
  verifyReportIntegrity(report, liveFingerprint.databaseName);

  if (report.diagnosisId !== options.diagnosisId) {
    throw new RestoreLessonAbortError(
      20,
      `--diagnosis-id ${options.diagnosisId} does not match the report's diagnosisId ` +
        `(${report.diagnosisId}).`
    );
  }

  // A completed apply with zero writes is legitimate (the English re-upload
  // alone can reattach every translation); verify's duplicate sweep, progress
  // update, and client report are still due. Only an apply that never
  // completed leaves nothing to verify.
  const applyCompleted = report.applyState?.completedAt != null;
  if (!applyCompleted && (!report.appliedWrites || report.appliedWrites.length === 0)) {
    throw new RestoreLessonAbortError(
      26,
      `Report ${report.diagnosisId} has no appliedWrites recorded and no completed applyState; ` +
        `nothing to verify. Run apply first.`
    );
  }

  const advisoryLockOps = options.advisoryLockOps ?? realAdvisoryLockOps;
  const withReservedConnection = options.withReservedConnection ?? beginReservedConnection;
  const now = options.now ?? (() => new Date());

  return withReservedConnection(sql, async (reserved: SqlFunc) => {
    const key = advisoryLockKey();
    const locked = await advisoryLockOps.tryLock(reserved, key);
    if (!locked) {
      throw new RestoreLessonAbortError(
        28,
        "Another write subcommand (restore-english/apply/verify) already holds the restoreLesson " +
          "advisory lock. Wait for it to finish, or investigate a stuck process before retrying."
      );
    }

    try {
      const persistence: { updateProgress?: () => Promise<void> } = options.persistence ?? storage;

      const affectedLesson = report.affectedLessons[0];
      // Mirrors `classify.ts`'s own dual-branch lookup (`classifyOne`): a
      // mapping with a live `productionMasterId` is looked up there, but an
      // unmatched mapping (`productionMasterId === null`) still carries real
      // evidence on its own now-orphaned row, still keyed by
      // `snapshotMasterId` in the same-id-space `findTSubsBridge` regime
      // (FR-008). Using only `productionMasterId` here would silently drop
      // every orphaned `conflict`/`lost` finding from the "after" fetch,
      // making `productionReachableAfter` incomparable to
      // `productionReachableBefore` (which classify.ts computed using both
      // branches) — an already-orphaned-and-still-orphaned conflict would
      // vanish from the count entirely instead of carrying through unchanged.
      const masterIds = Array.from(
        new Set(
          report.mappings.map((mapping) =>
            mapping.productionMasterId !== null
              ? mapping.productionMasterId
              : mapping.snapshotMasterId
          )
        )
      );

      const reservedStorage = new PGConnectedStorage(reserved);
      const liveTStrings = affectedLesson
        ? await reservedStorage.fetchTStringsForLesson(
            affectedLesson.productionLessonId,
            masterIds,
            { includeLegacyLessonStringScoped: true }
          )
        : [];
      const perLanguageCounts: LanguageCounts[] = report.perLanguageCounts.map((counts) => ({
        ...counts,
        productionReachableAfter: liveTStrings.filter(
          (row) => row.languageId === counts.languageId && row.text !== null
        ).length,
      }));

      const duplicateRows = await reservedStorage.fetchDuplicateRowSweep(masterIds);
      const duplicateDelta = duplicateRowDelta(duplicateRows, report.duplicateRowsBaseline);

      const scopedLanguageIds = report.applyState?.scopedLanguageIds ?? null;
      const coverage: "complete" | "partial" = scopedLanguageIds === null ? "complete" : "partial";
      const unappliedLanguageIds =
        scopedLanguageIds === null
          ? []
          : perLanguageCounts
              .map((counts) => counts.languageId)
              .filter((languageId) => !scopedLanguageIds.includes(languageId));

      if (persistence.updateProgress) await persistence.updateProgress();

      const mode: "snapshot" | "offline" = options.offline ? "offline" : "snapshot";
      const verifiedAt = now().toISOString();
      const clientReportWithheld = duplicateDelta.length > 0;

      const markdown = buildVerifyMarkdown({
        report,
        perLanguageCounts,
        duplicateDelta,
        coverage,
        unappliedLanguageIds,
        mode,
        verifiedAt,
      });
      ensureReportDirectory(path.dirname(options.outPath));
      fs.writeFileSync(options.outPath, markdown, { mode: 0o600 });
      // mode above only applies when the file is newly created — re-assert it
      // so a pre-existing (looser-permissioned or planted) file at outPath
      // ends up 0600 too, matching writeReportAtomic (report.ts).
      fs.chmodSync(options.outPath, 0o600);

      const verification: Verification = {
        mode,
        coverage,
        unappliedLanguageIds,
        verifiedAt,
        clientReportPath: options.outPath,
        clientReportWithheld,
      };

      let updated: DiagnosisReport = {
        ...report,
        mode: "verify",
        perLanguageCounts,
        duplicateRows,
        verification,
      };
      updated = { ...updated, reportChecksum: computeReportChecksum(updated) };
      if (options.reportPath) {
        writeReportAtomic(options.reportPath, updated);
      }
      return updated;
    } finally {
      try {
        await advisoryLockOps.unlock(reserved, key);
      } catch {
        // Best-effort: the connection may already be gone.
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// verify — argument parsing and runVerifyCommand()
// ─────────────────────────────────────────────────────────────────────────

export interface VerifyCliArgs {
  report: string;
  diagnosisId: string;
  out: string | null;
  offline: boolean;
  snapshotUrl: string | null;
}

const KNOWN_VERIFY_FLAGS = new Set([
  "--report",
  "--diagnosis-id",
  "--out",
  "--offline",
  "--snapshot-url",
]);

/** Parses `verify` subcommand argv per
 * specs/018-lesson1-translation-restore/contracts/cli.md §verify. Argument
 * errors abort with exit 1. */
export function parseVerifyArgs(argv: string[]): VerifyCliArgs {
  let report: string | null = null;
  let diagnosisId: string | null = null;
  let out: string | null = null;
  let offline = false;
  let snapshotUrl: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_VERIFY_FLAGS.has(arg)) {
      throw new RestoreLessonAbortError(1, `Unrecognized argument: ${arg}`);
    }
    switch (arg) {
      case "--report":
        report = requireValue(argv, ++i, arg);
        break;
      case "--diagnosis-id":
        diagnosisId = requireValue(argv, ++i, arg);
        break;
      case "--out":
        out = requireValue(argv, ++i, arg);
        break;
      case "--offline":
        offline = true;
        break;
      case "--snapshot-url":
        snapshotUrl = requireValue(argv, ++i, arg);
        break;
    }
  }

  if (!report) {
    throw new RestoreLessonAbortError(1, "--report <path> is required");
  }
  if (!diagnosisId) {
    throw new RestoreLessonAbortError(
      1,
      "--diagnosis-id <id> is required (verify never runs off a report the operator did not name)"
    );
  }

  return { report, diagnosisId, out, offline, snapshotUrl };
}

export interface RunVerifyCommandOptions {
  argv: string[];
  homeDir?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  connectProduction?: () => Promise<SqlFunc> | SqlFunc;
  /** injectable for tests; only invoked when `--snapshot-url` is passed
   * (contract §verify: "a snapshot comparison unless `--offline`"). */
  connectSnapshot?: (url: string) => Promise<SqlFunc> | SqlFunc;
  closeSql?: (sql: SqlFunc) => Promise<void>;
  advisoryLockOps?: AdvisoryLockOps;
  withReservedConnection?: WithReservedConnection;
  persistence?: { updateProgress?: () => Promise<void> };
}

/** Runs the `verify` subcommand end to end: argv parsing, the host-local/
 * report-load preconditions, the production connection, and exit code
 * mapping per contracts/cli.md's exit code table (0,20,26,28,30,1). Never
 * throws. */
export async function runVerifyCommand(options: RunVerifyCommandOptions): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const connectProduction = options.connectProduction ?? defaultConnectProduction;
  const connectSnapshot = options.connectSnapshot ?? defaultConnectSnapshot;
  const closeSql = options.closeSql ?? defaultCloseSql;
  const homeDir = options.homeDir ?? os.homedir();

  let productionSql: SqlFunc | null = null;
  let snapshotSql: SqlFunc | null = null;

  try {
    const args = parseVerifyArgs(options.argv);

    // --snapshot-url is optional for verify (contract §verify: "a snapshot
    // comparison unless --offline"). Unlike diagnose, verify's `mode` label
    // was previously set to "snapshot" whenever --offline was absent even
    // though no snapshot connection was ever opened — an argv password
    // exposed via ps/proc for a comparison that never happened. Passing the
    // flag now either opens and reads a real snapshot connection (with the
    // same two warnings diagnose emits) or aborts with a clear message;
    // `mode` is only ever "snapshot" once a connection has actually been
    // opened and read.
    if (args.snapshotUrl) {
      stderr(
        redactConnectionString(
          "--snapshot-url was passed on the command line, which is world-readable via ps/proc. " +
            "Prefer running verify with --offline; verify only opens a snapshot connection to " +
            "confirm reachability, it does not need the snapshot for anything else."
        )
      );
      const snapshotUrlWarning = snapshotUrlSecurityWarning(args.snapshotUrl);
      if (snapshotUrlWarning) {
        stderr(redactConnectionString(snapshotUrlWarning));
      }
      if (args.offline) {
        throw new RestoreLessonAbortError(
          1,
          "--snapshot-url and --offline are mutually exclusive: --offline computes verification " +
            "from the stored report and live production only, opening no snapshot connection."
        );
      }
    }

    const markerPath = path.join(homeDir, PRODUCTION_MARKER_FILENAME);
    if (!fs.existsSync(markerPath)) {
      throw new RestoreLessonAbortError(10, `Production marker file missing: ${markerPath}.`);
    }

    if (!fs.existsSync(args.report)) {
      throw new RestoreLessonAbortError(20, `Report not found at ${args.report}.`);
    }
    const report = loadReport(args.report);
    if (report.diagnosisId !== args.diagnosisId) {
      throw new RestoreLessonAbortError(
        20,
        `--diagnosis-id ${args.diagnosisId} does not match the report's diagnosisId ` +
          `(${report.diagnosisId}) at ${args.report}.`
      );
    }

    if (args.snapshotUrl) {
      try {
        snapshotSql = await connectSnapshot(args.snapshotUrl);
        // The "real snapshot read" the flag promises — confirms the
        // connection is live before `mode` is allowed to say "snapshot".
        await snapshotSql`SELECT 1`;
      } catch (err) {
        if (err instanceof RestoreLessonAbortError) throw err;
        throw new RestoreLessonAbortError(
          1,
          `Snapshot connection failed: ${redactConnectionString(String(err))}`
        );
      } finally {
        if (snapshotSql) {
          await closeSql(snapshotSql);
          snapshotSql = null;
        }
      }
    }

    productionSql = await connectProduction();

    const outPath = args.out ?? path.join(path.dirname(args.report), "client-report.md");

    const updated = await verify({
      productionSql,
      report,
      diagnosisId: args.diagnosisId,
      outPath,
      homeDir,
      offline: args.offline,
      reportPath: args.report,
      advisoryLockOps: options.advisoryLockOps,
      withReservedConnection: options.withReservedConnection,
      persistence: options.persistence,
    });

    if (updated.verification?.clientReportWithheld) {
      stdout(
        `DRAFT verify found new duplicate rows (diagnosisId=${updated.diagnosisId}): the client ` +
          `report at ${outPath} is withheld — resolve the duplicates by hand before sending it.`
      );
      return 30;
    }

    stdout(
      `OK verify complete (diagnosisId=${updated.diagnosisId}): client report written to ${outPath}.`
    );
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
    if (productionSql) await closeSql(productionSql);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// main() — CLI entry point
// ─────────────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "diagnose") {
    return runDiagnoseCommand({ argv: rest });
  }
  if (subcommand === "restore-english") {
    return runRestoreEnglishCommand({ argv: rest });
  }
  if (subcommand === "apply") {
    return runApplyCommand({ argv: rest });
  }
  if (subcommand === "verify") {
    return runVerifyCommand({ argv: rest });
  }
  console.error(
    `Unknown subcommand: ${subcommand ?? "(none)"}. Known subcommands: "diagnose", ` +
      `"restore-english", "apply", "verify".`
  );
  return 1;
}

/**
 * Handles a rejection escaping `main()` — most plausibly `closeSql` throwing
 * in a `finally` block, since every subcommand's own try/catch already
 * redacts and maps its own errors. Applies the same
 * `redactConnectionString` discipline before writing to stderr so a raw,
 * unredacted stack never reaches the terminal, and returns the exit code
 * the caller should set.
 */
export function handleMainRejection(
  err: unknown,
  deps: { stderr?: (line: string) => void } = {}
): number {
  const stderrFn = deps.stderr ?? ((line: string) => console.error(line));
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  stderrFn(redactConnectionString(message));
  return 1;
}

if (require.main === module) {
  // PGStorage registers a prexit shutdown handler, and prexit's default
  // ondone calls process.exit(prexit.code) — its own counter, not
  // process.exitCode — which would replace every contract exit code set
  // below with 0. Let the code set here win; fall back to prexit's only
  // when none was set.
  prexit.ondone = () => process.exit(process.exitCode ?? prexit.code);
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.exitCode = handleMainRejection(err);
    });
}
