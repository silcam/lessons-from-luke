/**
 * restoreEnglish.ts — `restore-english` core (task 5.7.2): the copy shim
 * (I15), known-bad hard denial and byte-verification preconditions (I16,
 * I23), the upload/relink dispatch, and the post-upload mode/owner
 * repair-then-abort sequence (I18, I21).
 *
 * This module is the pure(ish) orchestration core — analogous to `cli.ts`'s
 * `diagnose()` — that `restoreLesson.integration.test.ts`'s not-yet-wired
 * `cli.restoreEnglish()` (task 5.7.3) will call. It does NOT: parse argv,
 * take the advisory lock, or produce the pre-write `pg_dump` (those are
 * task 5.7.3's job, per the split documented in
 * specs/018-lesson1-translation-restore/contracts/cli.md §restore-english —
 * `dumpPath` is threaded in here as an already-produced fact). `upload`,
 * `relink`, and `webify` are injected (`RestoreEnglishDeps`) so this module
 * is unit-testable from fixtures/temp dirs with no real database or real
 * `uploadEnglishDoc`/`webifyLesson` — the acceptance criteria for this task.
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md
 * §restore-english (preconditions 1-7 minus the dump/lock/db-identity ones
 * this module doesn't own, side effects, exit codes),
 * specs/018-lesson1-translation-restore/plan.md
 * §The restore-source document must survive being used (I15),
 * §The verified document and the used document must be the same bytes (I23),
 * §Known-bad document guard (I16),
 * §Aborting after the upload has already happened (I18, I21).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ENGLISH_ID } from "../../../core/models/Language";
import { RestoreLessonAbortError } from "./identity";
import { computeReportChecksum } from "./report";
import { AffectedLesson, DiagnosisReport, EnglishRestore, MasterDocumentCandidate } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// The copy shim (I15)
// ─────────────────────────────────────────────────────────────────────────

/** The subset of `express-fileupload`'s `UploadedFile` that `uploadEnglishDoc`
 * -> `docStorage.saveDoc` actually calls. */
export interface UploadedFileLike {
  name: string;
  mv(destPath: string): Promise<void>;
}

/**
 * Wraps a plain filesystem path as an `UploadedFileLike`. Its `mv` COPIES,
 * never renames or unlinks the source (I15): `docs/Luke-1-01v157.odt` is the
 * only recovery source and MUST survive being used, in case the upload fails
 * partway or a second attempt is needed.
 */
export function copyShimUploadedFile(sourcePath: string): UploadedFileLike {
  return {
    name: path.basename(sourcePath),
    mv: (destPath: string) =>
      new Promise<void>((resolve, reject) => {
        fs.copyFile(sourcePath, destPath, (err) => (err ? reject(err) : resolve()));
      }),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Document verification (I16, I23) and destination-path preconditions
// ─────────────────────────────────────────────────────────────────────────

/** sha256 + sizeBytes of a file on disk, matching `cli.ts`'s
 * `scanCandidateMasterDocuments` hashing so re-hashing here is comparable. */
export function hashFile(filepath: string): { sha256: string; sizeBytes: number } {
  const buffer = fs.readFileSync(filepath);
  return {
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    sizeBytes: buffer.length,
  };
}

/** True iff `filepath`'s resolved real path lies inside `root`'s resolved
 * real path (I23's symlink guard). */
export function isInsideDocsRoot(filepath: string, root: string): boolean {
  let realFile: string;
  let realRoot: string;
  try {
    realFile = fs.realpathSync(filepath);
    realRoot = fs.realpathSync(root);
  } catch {
    return false;
  }
  const relative = path.relative(realRoot, realFile);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Finds `masterDocumentPath`'s entry in the affected lesson's
 * `candidateMasterDocuments` (by path), enforcing preconditions 3-5:
 * hard-denies a known-bad candidate (I16, no override — checked before
 * anything else and regardless of `--force-relink`'s existence, since there
 * is no flag that authorises an unverified/known-bad document), requires
 * `englishTextSetMatchesSnapshot === true`, re-hashes the file and confirms
 * it is still inside `docsRoot` (I23), and asserts the resolved source
 * differs from the computed destination path (I15's second half).
 */
export function verifyMasterDocument(input: {
  affectedLesson: AffectedLesson;
  masterDocumentPath: string;
  docsRoot: string;
  destinationPath: string;
}): MasterDocumentCandidate {
  const { affectedLesson, masterDocumentPath, docsRoot, destinationPath } = input;

  const candidate = affectedLesson.candidateMasterDocuments.find(
    (c) => c.filepath === masterDocumentPath
  );

  if (candidate?.isKnownBadUpload) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} (version ${candidate.version}) is the known-bad ` +
        `upload (pinned in this report's knownBadVersions). This is the cover file; there is no ` +
        `override for this check, not even --force-relink (that selects the direct re-link ` +
        `fallback, it does not authorise an unverified document).`
    );
  }

  if (!candidate || !candidate.englishTextSetMatchesSnapshot) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} is not one of this report's verified ` +
        `candidateMasterDocuments (englishTextSetMatchesSnapshot === true). Pass --force-relink ` +
        `to use the direct re-link fallback instead, or point at a verified candidate.`
    );
  }

  if (!fs.existsSync(masterDocumentPath)) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} no longer exists on disk.`
    );
  }

  const { sha256, sizeBytes } = hashFile(masterDocumentPath);
  if (sha256 !== candidate.sha256 || sizeBytes !== candidate.sizeBytes) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} has changed since it was verified at diagnose time ` +
        `(I23): expected sha256=${candidate.sha256} sizeBytes=${candidate.sizeBytes}, found ` +
        `sha256=${sha256} sizeBytes=${sizeBytes}. Something replaced, edited, or symlinked this ` +
        `file between diagnosis and restore. Refusing to upload unverified bytes.`
    );
  }

  if (!isInsideDocsRoot(masterDocumentPath, docsRoot)) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} does not resolve inside the configured docs/ root ` +
        `(${docsRoot}) — refusing to follow a symlink to a file diagnosis never inspected.`
    );
  }

  if (path.resolve(masterDocumentPath) === path.resolve(destinationPath)) {
    throw new RestoreLessonAbortError(
      22,
      `--master-document ${masterDocumentPath} resolves to the same path as the upload ` +
        `destination (${destinationPath}). saveDoc unlinks its destination first; using the same ` +
        `path would delete the only recovery source. This indicates a version-arithmetic error.`
    );
  }

  return candidate;
}

// ─────────────────────────────────────────────────────────────────────────
// Post-upload mode/owner repair-then-abort (I18, I21)
// ─────────────────────────────────────────────────────────────────────────

export interface ModeOwner {
  mode: number;
  uid: number;
  gid: number;
}

/** Injectable so unit tests can simulate a repair that fails (e.g. `chown`
 * requiring root privileges the test process doesn't have) without needing
 * real root access. Defaults to real `fs` calls. */
export interface FileModeOps {
  stat(filepath: string): ModeOwner;
  chmod(filepath: string, mode: number): void;
  chown(filepath: string, uid: number, gid: number): void;
}

export const realFileModeOps: FileModeOps = {
  stat: (filepath) => {
    const stat = fs.statSync(filepath);
    return { mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
  },
  chmod: (filepath, mode) => fs.chmodSync(filepath, mode),
  chown: (filepath, uid, gid) => fs.chownSync(filepath, uid, gid),
};

function sameModeOwner(a: ModeOwner, b: ModeOwner): boolean {
  return a.mode === b.mode && a.uid === b.uid && a.gid === b.gid;
}

function describeModeOwner(m: ModeOwner): string {
  return `mode ${m.mode.toString(8)} owner ${m.uid}:${m.gid}`;
}

/**
 * Asserts every path in `targetPaths` matches `siblingPath`'s mode and
 * owner. This runs AFTER production has already changed, so on mismatch it
 * attempts `chmod`/`chown` repair and re-checks BEFORE aborting (I21) — the
 * abort message states plainly that Lesson 1 may currently be unreadable,
 * names the offending files with actual vs expected modes, and prints the
 * exact fix command (exit 31).
 */
export function repairAndVerifyFileModes(
  targetPaths: string[],
  siblingPath: string,
  ops: FileModeOps = realFileModeOps
): void {
  const expected = ops.stat(siblingPath);

  const mismatched = (): { path: string; actual: ModeOwner }[] =>
    targetPaths
      .map((p) => ({ path: p, actual: ops.stat(p) }))
      .filter(({ actual }) => !sameModeOwner(actual, expected));

  if (mismatched().length === 0) return;

  for (const { path: targetPath } of mismatched()) {
    try {
      ops.chmod(targetPath, expected.mode);
    } catch {
      // Attempt only — re-checked below; a failed chmod surfaces in the abort.
    }
    try {
      ops.chown(targetPath, expected.uid, expected.gid);
    } catch {
      // Attempt only — chown commonly requires root; re-checked below.
    }
  }

  const stillMismatched = mismatched();
  if (stillMismatched.length === 0) return;

  const details = stillMismatched
    .map(({ path: p, actual }) => `${p} (actual ${describeModeOwner(actual)})`)
    .join("; ");
  const fixCommands = stillMismatched
    .map(
      ({ path: p }) =>
        `chmod ${expected.mode.toString(8)} ${p} && chown ${expected.uid}:${expected.gid} ${p}`
    )
    .join(" && ");

  throw new RestoreLessonAbortError(
    31,
    `Lesson 1 may currently be unreadable: automatic repair failed to bring the restored file(s) ` +
      `to app-readable modes/ownership. Expected ${describeModeOwner(expected)} (matching sibling ` +
      `${siblingPath}). Offending files: ${details}. Fix with: ${fixCommands}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Path conventions (mirrors docStorage.ts's docFilepath/webifiedHtmPath)
// ─────────────────────────────────────────────────────────────────────────

function zeroPad(num: number, digits: number): string {
  const s = num.toString();
  return s.length >= digits ? s : "0".repeat(digits - s.length) + s;
}

/** `{docsRoot}/{book}-{series}-{lesson:2}v{version:2}.odt`, matching
 * `docStorage.docFilepath`'s convention exactly. */
export function computeDestinationDocPath(
  docsRoot: string,
  affectedLesson: Pick<AffectedLesson, "book" | "series" | "lesson">,
  version: number
): string {
  const filename =
    `${affectedLesson.book}-${affectedLesson.series}-` +
    `${zeroPad(affectedLesson.lesson, 2)}v${zeroPad(version, 2)}.odt`;
  return path.join(docsRoot, filename);
}

/** `{previewDir}/{lessonId}-{version}.htm`, matching
 * `docStorage.webifiedHtmPath`'s convention. */
export function computeDestinationPreviewPath(
  previewDir: string,
  lessonId: number,
  version: number
): string {
  return path.join(previewDir, `${lessonId}-${version}.htm`);
}

// ─────────────────────────────────────────────────────────────────────────
// restoreEnglish() core
// ─────────────────────────────────────────────────────────────────────────

/** What `deps.upload`/`deps.relink` hand back — just enough for `webify`
 * and for recording `EnglishRestore.newLessonVersion`. */
export interface RestoredLessonResult {
  lessonId: number;
  version: number;
}

export interface RestoreEnglishDeps {
  /** The app's real upload pathway (`uploadEnglishDoc`), given the copy-shim
   * `UploadedFileLike`. Not called at all under `--force-relink`. */
  upload: (
    file: UploadedFileLike,
    meta: { languageId: number; book: string; series: number; lesson: number }
  ) => Promise<RestoredLessonResult>;
  /** The direct re-link fallback (`--force-relink`): writes the Snapshot's
   * `lessonstrings` generation directly, no document involved. */
  relink: (report: DiagnosisReport) => Promise<RestoredLessonResult>;
  /** Called explicitly after either branch — mirrors `documentsController.ts`
   * calling `webifyLesson` itself after `uploadEnglishDoc` returns, and
   * matches the contract's "the relink fallback calls it explicitly". */
  webify: (lesson: RestoredLessonResult) => Promise<void>;
}

export interface RestoreEnglishOptions {
  report: DiagnosisReport;
  /** Required unless `forceRelink` is true. */
  masterDocumentPath: string | null;
  forceRelink: boolean;
  /** Already produced by the caller (task 5.7.3 owns the pre-write dump) —
   * threaded through into the returned `EnglishRestore.dumpPath`. */
  dumpPath: string;
  /** The root `--master-document` must resolve inside (I23's symlink guard)
   * and the destination ODT is written under. Mirrors `cli.ts`'s
   * `resolveDocsRoot()` default when omitted by the real CLI wiring. */
  docsRoot: string;
  /** Where the web preview is written; defaults to `{docsRoot}/web`. */
  previewDir?: string;
  /** An existing file in `docsRoot` to compare the new ODT's mode/owner
   * against (I18). Defaults to the just-used `masterDocumentPath` itself
   * (which, thanks to the copy shim, is still present after use) when
   * uploading; required (no default) under `--force-relink` in the unlikely
   * case a caller also wants the check to run there. Omit to skip the check
   * entirely (e.g. in unit tests uninterested in I18). */
  siblingDocPath?: string;
  deps: RestoreEnglishDeps;
  fileModeOps?: FileModeOps;
  now?: () => Date;
}

/**
 * The `restore-english` orchestration core (FR-006). Given a checksum-valid
 * `DiagnosisReport` (verified by the caller — this module does not
 * re-verify `reportChecksum`/`diagnosisChecksum`, that's task 5.7.3's
 * precondition 2), either re-uploads the verified pre-incident master
 * document through `deps.upload` (copying, never moving, the source — I15)
 * or, under `--force-relink`, calls `deps.relink` directly. Runs the
 * post-upload mode/owner repair-then-abort sequence (I18/I21) when
 * `siblingDocPath` is given, then returns the report with `englishRestore`
 * appended and `reportChecksum` recomputed.
 */
export async function restoreEnglish(options: RestoreEnglishOptions): Promise<DiagnosisReport> {
  const { report, forceRelink, dumpPath, docsRoot, deps } = options;
  const previewDir = options.previewDir ?? path.join(docsRoot, "web");
  const now = options.now ?? (() => new Date());

  const affectedLesson = report.affectedLessons[0];
  if (!affectedLesson) {
    throw new RestoreLessonAbortError(1, "Report has no affectedLessons entry to restore.");
  }

  const newVersion = affectedLesson.productionVersion + 1;
  const destinationDocPath = computeDestinationDocPath(docsRoot, affectedLesson, newVersion);

  let restored: RestoredLessonResult;
  let method: EnglishRestore["method"];
  let masterDocumentSha256: string | null = null;
  let usedMasterDocumentPath: string | null = null;

  if (forceRelink) {
    method = "relink";
    restored = await deps.relink(report);
  } else {
    method = "upload";
    if (!options.masterDocumentPath) {
      throw new RestoreLessonAbortError(
        22,
        "--master-document is required unless --force-relink is given."
      );
    }
    const masterDocumentPath = options.masterDocumentPath;
    const candidate = verifyMasterDocument({
      affectedLesson,
      masterDocumentPath,
      docsRoot,
      destinationPath: destinationDocPath,
    });

    const file = copyShimUploadedFile(masterDocumentPath);
    restored = await deps.upload(file, {
      languageId: ENGLISH_ID,
      book: affectedLesson.book,
      series: affectedLesson.series,
      lesson: affectedLesson.lesson,
    });

    usedMasterDocumentPath = masterDocumentPath;
    masterDocumentSha256 = candidate.sha256;
  }

  await deps.webify(restored);

  if (method === "upload" && options.siblingDocPath) {
    const newPreviewPath = computeDestinationPreviewPath(previewDir, restored.lessonId, newVersion);
    repairAndVerifyFileModes(
      [destinationDocPath, newPreviewPath],
      options.siblingDocPath,
      options.fileModeOps ?? realFileModeOps
    );
  }

  const englishRestore: EnglishRestore = {
    method,
    masterDocumentPath: usedMasterDocumentPath,
    masterDocumentSha256,
    newLessonVersion: restored.version,
    dumpPath,
    restoredAt: now().toISOString(),
    carriedFromDiagnosisId: null,
  };

  const updated: DiagnosisReport = { ...report, mode: "restore-english", englishRestore };
  return { ...updated, reportChecksum: computeReportChecksum(updated) };
}
