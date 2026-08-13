/**
 * report.ts — `report.json` read/write, checksums, atomic flush, and journal
 * for the `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * Responsibilities, all preconditions or write paths shared by every
 * subcommand that touches `report.json`:
 *
 * 1. The two checksums (I13): `diagnosisChecksum` frozen over only the
 *    diagnosis-produced fields, and `reportChecksum` recomputed over the
 *    whole body on every append. `verifyReportIntegrity` re-checks both plus
 *    `productionFingerprint.databaseName`, throwing exit 20 on any mismatch.
 * 2. Atomic flush (I12): `writeReportAtomic` writes a temp file in the same
 *    directory as the report, `fsync`s it, then `rename`s it into place —
 *    the temp file is never created elsewhere (e.g. `/tmp`), since
 *    `rename(2)` is only atomic within one filesystem.
 * 3. File/directory modes (I17): the report is written `0600` inside a
 *    `0700` directory; an existing group/world-readable directory aborts
 *    with exit 14 rather than being silently reused.
 * 4. The journal (I12, I27): path derived from the report's own basename
 *    (`<report-basename>.journal.jsonl`, never a fixed name), append-only,
 *    each line carrying its `diagnosisId`.
 * 5. `--force-report` refusal (I26): refuses to overwrite a report holding a
 *    self-produced `englishRestore` (not one carried via `--prior-report`)
 *    or `appliedWrites`, or beside which that report's own non-empty
 *    journal exists.
 * 6. `--prior-report` carry-forward (I20, I26): verifies the prior report's
 *    checksums and database name (exit 20 on mismatch) before handing back
 *    `knownBadVersions`, `expectedBumpCount`, and a re-marked `englishRestore`
 *    for the caller (`cli.ts`, task 5.6.7) to fold into the new diagnosis.
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Report integrity and
 * identity (I13), §Crash mid-apply must not lose the audit trail (I12),
 * §The residual write race section (I19 duplicateRowsBaseline — computed by
 * gateway.ts's fetchDuplicateRowSweep, merely carried here), §Two dumps one
 * recorded path, specs/018-lesson1-translation-restore/contracts/cli.md
 * §Contract tests, specs/018-lesson1-translation-restore/data-model.md
 * DiagnosisReport / ProductionFingerprint.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { RestoreLessonAbortError } from "./identity";
import { AffectedLesson, DiagnosisReport, EnglishRestore, LessonRef } from "./types";

/** Report file mode (I17): readable/writable only by the owner. */
export const REPORT_FILE_MODE = 0o600;
/** Report directory mode (I17): traversable/listable only by the owner. */
export const REPORT_DIR_MODE = 0o700;

/**
 * Exactly the `DiagnosisReport` fields `diagnosisChecksum` is computed over
 * (data-model.md `ProductionFingerprint` validation note; plan.md §Report
 * integrity and identity). Order here is irrelevant — `canonicalStringify`
 * sorts keys — but this is the single source of truth for which fields are
 * "diagnosis-produced".
 */
export const DIAGNOSIS_CHECKSUM_FIELDS = [
  "identity",
  "affectedLessons",
  "languageIdentityChecks",
  "mappings",
  "findings",
  "perLanguageCounts",
  "blastRadius",
  "plannedWrites",
  "conflicts",
] as const;

/**
 * Deterministic JSON serialisation with object keys sorted at every level,
 * so a checksum does not depend on property insertion order — only on
 * content. Arrays keep their order (it is meaningful data).
 */
export function canonicalStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * `diagnosisChecksum` (I13): SHA-256 over only the diagnosis-produced
 * fields. Computed once by `diagnose` and never recomputed thereafter —
 * callers that already have a full `DiagnosisReport` may pass it directly;
 * this function only reads the frozen fields, ignoring everything else
 * (including any stale `diagnosisChecksum` already on the object).
 */
export function computeDiagnosisChecksum(
  report: Pick<DiagnosisReport, (typeof DIAGNOSIS_CHECKSUM_FIELDS)[number]>
): string {
  const picked: Record<string, unknown> = {};
  for (const field of DIAGNOSIS_CHECKSUM_FIELDS) {
    picked[field] = report[field];
  }
  return sha256(canonicalStringify(picked));
}

/**
 * `reportChecksum` (I13): SHA-256 over the whole body, excluding
 * `reportChecksum` itself. Recomputed on every append — whatever value is
 * already on `report.reportChecksum` is ignored, not fed into the hash.
 */
export function computeReportChecksum(report: DiagnosisReport): string {
  const { reportChecksum: _ignored, ...rest } = report;
  return sha256(canonicalStringify(rest));
}

/**
 * Every subcommand that reads a report (`restore-english`, `apply`,
 * `verify`, `diagnose --prior-report`) calls this before doing anything
 * else. Re-verifies `diagnosisChecksum`, `reportChecksum`, and — when a live
 * database name is supplied — `productionFingerprint.databaseName`. Any
 * mismatch aborts with exit 20 (I13).
 */
export function verifyReportIntegrity(report: DiagnosisReport, liveDatabaseName?: string): void {
  const expectedDiagnosisChecksum = computeDiagnosisChecksum(report);
  if (expectedDiagnosisChecksum !== report.diagnosisChecksum) {
    throw new RestoreLessonAbortError(
      20,
      `Report diagnosisChecksum mismatch (diagnosisId=${report.diagnosisId}): expected ` +
        `${expectedDiagnosisChecksum}, found ${report.diagnosisChecksum}. The diagnosis-produced ` +
        `fields have changed since the report was generated; this report is not trustworthy.`
    );
  }

  const expectedReportChecksum = computeReportChecksum(report);
  if (expectedReportChecksum !== report.reportChecksum) {
    throw new RestoreLessonAbortError(
      20,
      `Report reportChecksum mismatch (diagnosisId=${report.diagnosisId}): expected ` +
        `${expectedReportChecksum}, found ${report.reportChecksum}. The report has been modified ` +
        `since the tool last wrote it; this report is not trustworthy.`
    );
  }

  if (
    liveDatabaseName !== undefined &&
    liveDatabaseName !== report.productionFingerprint.databaseName
  ) {
    throw new RestoreLessonAbortError(
      20,
      `Report productionFingerprint.databaseName mismatch (diagnosisId=${report.diagnosisId}): ` +
        `report was generated against "${report.productionFingerprint.databaseName}", this run is ` +
        `connected to "${liveDatabaseName}". Refusing to apply a report from a different database.`
    );
  }
}

/**
 * The journal's path is derived from the report's basename, never fixed
 * (I27): `/rec/report.json` -> `/rec/report.journal.jsonl`,
 * `/rec/report-2.json` -> `/rec/report-2.journal.jsonl`.
 */
export function journalPathForReport(reportPath: string): string {
  const dir = path.dirname(reportPath);
  const ext = path.extname(reportPath);
  const base = path.basename(reportPath, ext);
  return path.join(dir, `${base}.journal.jsonl`);
}

/**
 * Asserts `dirPath` is a safe place to write `0600` files into: if it
 * already exists it must not be group/world-readable (exit 14); if it does
 * not exist it is created at `0700`. `fs.mkdirSync`'s `mode` is subject to
 * the process umask, so the mode is re-asserted with `chmodSync` after
 * creation.
 */
export function ensureReportDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new RestoreLessonAbortError(
        14,
        `Report path ${dirPath} exists and is not a directory.`
      );
    }
    if ((stat.mode & 0o077) !== 0) {
      throw new RestoreLessonAbortError(
        14,
        `Report directory ${dirPath} is group/world-readable (mode ${(stat.mode & 0o777).toString(
          8
        )}). Refusing to write a report containing translation text into it. ` +
          `Run "chmod 700 ${dirPath}" and re-run.`
      );
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true, mode: REPORT_DIR_MODE });
  fs.chmodSync(dirPath, REPORT_DIR_MODE);
}

/**
 * Atomic flush (I12): write a temp file in the SAME DIRECTORY as
 * `reportPath`, `fsync` it, then `rename` it into place. Never writes
 * anywhere else (e.g. `/tmp`) — `rename(2)` is only atomic within one
 * filesystem. The report is written mode `0600` (I17); its directory is
 * asserted/created `0700` first.
 */
export function writeReportAtomic(reportPath: string, report: DiagnosisReport): void {
  const dir = path.dirname(reportPath);
  ensureReportDirectory(dir);

  const tempPath = path.join(dir, `.${path.basename(reportPath)}.tmp-${process.pid}-${Date.now()}`);
  const fd = fs.openSync(tempPath, "w", REPORT_FILE_MODE);
  try {
    fs.writeFileSync(fd, JSON.stringify(report, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(tempPath, REPORT_FILE_MODE);
  fs.renameSync(tempPath, reportPath);
}

/**
 * Recomputes `reportChecksum` (never `diagnosisChecksum`, which stays
 * frozen once set) and flushes the result atomically. This is the one
 * function every write subcommand should call to persist a report — it
 * keeps "recompute reportChecksum" and "flush atomically" from drifting
 * apart at a call site.
 */
export function saveReport(reportPath: string, report: DiagnosisReport): DiagnosisReport {
  const updated: DiagnosisReport = { ...report, reportChecksum: computeReportChecksum(report) };
  writeReportAtomic(reportPath, updated);
  return updated;
}

/** Reads and JSON-parses a report file. Throws (uncaught `ENOENT` etc.) if absent. */
export function loadReport(reportPath: string): DiagnosisReport {
  return JSON.parse(fs.readFileSync(reportPath, "utf8")) as DiagnosisReport;
}

export interface JournalEntry {
  /** every journal line carries its diagnosisId as a second line of defence (I27) */
  diagnosisId: string;
  [key: string]: unknown;
}

/** Appends one line to the report's journal, creating it (and its directory) if needed. */
export function appendJournalLine(journalPath: string, entry: JournalEntry): void {
  ensureReportDirectory(path.dirname(journalPath));
  fs.appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, { mode: REPORT_FILE_MODE });
  fs.chmodSync(journalPath, REPORT_FILE_MODE);
}

/** Reads every journal line back as parsed JSON, in file order. Empty array if the journal is absent. */
export function readJournalLines(journalPath: string): JournalEntry[] {
  if (!fs.existsSync(journalPath)) return [];
  const content = fs.readFileSync(journalPath, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournalEntry);
}

/** True iff the journal file exists and has at least one byte. */
export function journalIsNonEmpty(journalPath: string): boolean {
  return fs.existsSync(journalPath) && fs.statSync(journalPath).size > 0;
}

/**
 * `--force-report` precondition (I26, exit 14): refuses to overwrite a
 * report that is itself the record of production writes. Refuses on:
 *
 * - a SELF-PRODUCED `englishRestore` (`carriedFromDiagnosisId === null`) —
 *   a carried one (non-null) does NOT block the refusal, since it records
 *   no writes this report performed itself;
 * - any non-empty `appliedWrites`;
 * - the existing report's own (derived-path) journal being non-empty.
 *
 * Does nothing (returns) when none of the above hold; throws otherwise.
 */
export function checkForceReportOverwrite(existingReportPath: string): void {
  const existingReport = loadReport(existingReportPath);
  const journalPath = journalPathForReport(existingReportPath);

  const hasSelfProducedEnglishRestore =
    existingReport.englishRestore !== undefined &&
    existingReport.englishRestore.carriedFromDiagnosisId === null;
  const hasAppliedWrites = (existingReport.appliedWrites?.length ?? 0) > 0;
  const hasNonEmptyJournal = journalIsNonEmpty(journalPath);

  if (hasSelfProducedEnglishRestore || hasAppliedWrites || hasNonEmptyJournal) {
    const reasons: string[] = [];
    if (hasSelfProducedEnglishRestore) reasons.push("a self-produced englishRestore");
    if (hasAppliedWrites) reasons.push("non-empty appliedWrites");
    if (hasNonEmptyJournal) reasons.push(`a non-empty journal (${journalPath})`);
    throw new RestoreLessonAbortError(
      14,
      `--force-report refused: ${existingReportPath} contains ${reasons.join(
        ", "
      )} — this is the audit record of production writes this tool already made. ` +
        `Re-diagnose to a new --report path instead.`
    );
  }
}

/**
 * `diagnose --prior-report` precondition (I20, exit 20): the prior report is
 * a trust input, so its checksums and database name are verified before any
 * of its facts are carried forward.
 */
export function loadAndVerifyPriorReport(
  priorReportPath: string,
  liveDatabaseName: string
): DiagnosisReport {
  const priorReport = loadReport(priorReportPath);
  verifyReportIntegrity(priorReport, liveDatabaseName);
  return priorReport;
}

function affectedLessonMatches(affected: AffectedLesson, ref: LessonRef): boolean {
  return (
    affected.book === ref.book && affected.series === ref.series && affected.lesson === ref.lesson
  );
}

/** Finds the prior report's `AffectedLesson` entry for the lesson currently being diagnosed. */
export function findPriorAffectedLesson(
  priorReport: DiagnosisReport,
  lesson: LessonRef
): AffectedLesson | undefined {
  return priorReport.affectedLessons.find((affected) => affectedLessonMatches(affected, lesson));
}

/**
 * Re-marks a prior report's `englishRestore` for carry-forward (I26):
 * `carriedFromDiagnosisId` is set to the prior report's `diagnosisId` only
 * if it is not already set — a second drift recovery must keep pointing at
 * the report that actually performed the restore, not the one it was most
 * recently copied from.
 */
export function carryForwardEnglishRestore(
  priorReport: DiagnosisReport
): EnglishRestore | undefined {
  if (!priorReport.englishRestore) return undefined;
  return {
    ...priorReport.englishRestore,
    carriedFromDiagnosisId:
      priorReport.englishRestore.carriedFromDiagnosisId ?? priorReport.diagnosisId,
  };
}

export interface PriorReportCarryForward {
  priorDiagnosisId: string;
  knownBadVersions: number[];
  expectedBumpCount: number;
  englishRestore: EnglishRestore | undefined;
}

/**
 * Assembles everything `diagnose --prior-report` carries forward for one
 * affected lesson (I20, I26): `knownBadVersions` and bump accounting
 * (`expectedBumpCount`, bumped by one for the re-diagnosis) from the prior
 * report's matching `AffectedLesson`, and the re-marked `englishRestore`.
 * Throws (uncaught) if the prior report has no matching affected lesson —
 * carrying forward facts about the wrong lesson would be worse than
 * refusing.
 */
export function deriveCarryForward(
  priorReport: DiagnosisReport,
  lesson: LessonRef
): PriorReportCarryForward {
  const priorAffected = findPriorAffectedLesson(priorReport, lesson);
  if (!priorAffected) {
    throw new RestoreLessonAbortError(
      20,
      `--prior-report ${priorReport.diagnosisId} has no affectedLessons entry for ` +
        `${lesson.book} series ${lesson.series} lesson ${lesson.lesson}; nothing to carry forward.`
    );
  }
  return {
    priorDiagnosisId: priorReport.diagnosisId,
    knownBadVersions: priorAffected.knownBadVersions,
    expectedBumpCount: priorAffected.expectedBumpCount + 1,
    englishRestore: carryForwardEnglishRestore(priorReport),
  };
}
