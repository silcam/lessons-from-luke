import fs from "fs";
import path from "path";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language } from "../../core/models/Language";
import { Lesson, isTOCLesson, lessonName } from "../../core/models/Lesson";
import makeLessonFile from "./makeLessonFile";
import { prepareConstituentForAssembly, ConstituentMeta } from "./prepareConstituentForAssembly";
import { finalizeAssembledQuarter } from "./finalizeAssembledQuarter";
import { sofficeAssemble } from "../assembly/sofficeAssemble";
import docStorage from "../storage/docStorage";
import { moveFileSync } from "../../core/util/fsUtils";

/**
 * assembleQuarter — orchestrates the 14-constituent quarter-book merge
 * (US1). See specs/007-assembled-quarter-download/data-model.md
 * "Constituent provenance & copy-before-flatten (Pass 5 finding — CRITICAL)"
 * and "Assembly order" for the full contract this MUST satisfy once
 * implemented.
 *
 * **Order resolution**: TOC first, then the 13 lessons ascending by absolute
 * lesson number — NOT `lessonCompare` (which sorts the TOC's sentinel lesson
 * number, 99, to the END, not the front).
 *
 * **Copy-before-transform (CRITICAL, Pass 5)**: `makeLessonFile` is reused
 * unchanged. For the English-mother-tongue-bilingual case
 * (`makeLessonFile.ts:15`) it returns the RAW ADMIN-UPLOADED SOURCE `.odt`
 * under `docs/` — not a tmp copy. Every `makeLessonFile`-returned path MUST
 * be treated as strictly read-only: this function copies each of the 14
 * results into `<workRoot>/<jobId>/` BEFORE `prepareConstituentForAssembly`
 * or the `soffice` merge ever sees them. `prepareConstituentForAssembly`
 * mutates its `odtPath` in place, and an in-place mutation (or deletion) of
 * the raw source would destroy non-recoverable data.
 *
 * **Naming**: the copies are named ASCII, deterministic, insertion-order —
 * `00.odt` (TOC) .. `13.odt` — so `sofficeAssemble`'s injected StarBasic
 * macro can reference only controlled ASCII `file://` URLs (a Unicode/
 * DB-stored language name interpolated into a macro string/URL would break
 * it).
 *
 * **Generate-once**: each constituent is generated via `makeLessonFile`
 * EXACTLY ONCE — the same generated path is reused for both the
 * completeness check and the merge input (Pass 1 finding — no
 * double-generation).
 *
 * **Merge-safe page styles (the duplicated-page-styles fix)**: all 14
 * constituents share one template, so they use the SAME `style:master-page`
 * names, and `sofficeAssemble`'s merge dedupes page styles by DISPLAY NAME,
 * first definition wins. Instead of suffixing every constituent's page-style
 * names per-constituent (the removed `renameMasterPageStyles`, which
 * multiplied every page style 14x in the assembled book — "Coloring Page
 * 00".."13" — and broke applying the client's quarter styles template),
 * `prepareConstituentForAssembly` makes all 14 page-style sets IDENTICAL and
 * per-lesson-correct: footer Lesson fields become live chapter-number fields
 * resolving positionally from each lesson's (hidden) level-1 outline
 * heading, so the ONE surviving footer definition serves every lesson.
 * `finalizeAssembledQuarter` then patches the merged book's outline
 * numbering (start value = first absolute lesson number) and book-level
 * metadata so those live fields resolve. See both modules' doc comments for
 * the full design.
 *
 * **Working-dir lifecycle (this is where eager cleanup lives)**: the per-job
 * dir `<workRoot>/<jobId>/` holds 14 constituent copies, the merge output and
 * `sofficeAssemble`'s LibreOffice profile tree. It is `rm -rf`'d in a
 * `finally` as soon as the job finishes — success OR failure — which is the
 * cleanup both `sofficeAssemble` and `sweepAssemblyWork` describe (the
 * startup sweep is the crash-recovery backstop, not the primary mechanism).
 * The one file that must outlive the job, the assembled result, is FIRST
 * moved into `docStorage`'s `tmp` dir (`<docs>/tmp/<timestamp>_<jobId>.odt`),
 * where the existing 24 h `cleanTmpDir` sweep already covers it — the same
 * retention every per-lesson download gets. `assembly-work` is a *sibling* of
 * `tmp` and its basename `parseInt`s to `NaN`, so `cleanTmpDir` would never
 * reach anything left behind here.
 */
export interface AssembleQuarterOptions {
  /** Storage instance, passed through to `makeLessonFile` for TString lookups. */
  storage: Persistence;
  /**
   * All 14 lessons that make up this quarter (the TOC lesson + the 13
   * ascending lesson-numbered lessons) — already verified complete by the
   * caller. Order in this array is NOT assumed; `assembleQuarter` resolves
   * assembly order itself.
   */
  lessons: readonly Lesson[];
  /** The mother-tongue language to render each constituent for. */
  motherLang: Language;
  /** The majority-translation language id (0 for single-language mode). */
  majorityLangId: number;
  /** The owning job's id — used to derive the per-job working dir. */
  jobId: string;
  /**
   * The dedicated root all per-job working dirs live under
   * (`<docStorage>/assembly-work`). The per-job copies land in
   * `<workRoot>/<jobId>/`.
   */
  workRoot: string;
  /**
   * Cancellation channel from `AssemblyJobRegistry` (aborted when the job's
   * hard timeout fires). Checked between steps, and passed into
   * `sofficeAssemble` so an abort mid-merge kills the process group.
   *
   * Unwinding promptly matters: the registry holds its concurrency-1 slot
   * until this promise settles, so every step this skips is time the next
   * queued assembly spends waiting.
   */
  signal?: AbortSignal;
}

/**
 * Fixed-vocabulary error for an aborted assembly. Path-free like every other
 * reason this module throws (see "reason hygiene" in the catches below),
 * though in practice the registry discards it — a job is only ever aborted
 * once it has already gone terminal with its own `TIMEOUT_REASON`.
 */
class AssemblyAbortedError extends Error {
  constructor() {
    super("assembly was cancelled");
    this.name = "AssemblyAbortedError";
  }
}

/**
 * Abort checkpoint. Every call site sits OUTSIDE the surrounding
 * `try`/`catch`, so an abort is never rewritten into a misleading
 * "a lesson failed to generate" — the reason-hygiene contract below depends
 * on those catches only ever seeing failures they actually describe.
 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AssemblyAbortedError();
  }
}

/**
 * Run the full order-resolution + copy-before-transform + `soffice` merge +
 * finalization orchestration for one assembly job. See the module doc
 * comment for the full contract this satisfies.
 *
 * @returns Absolute path to the retained assembled `.odt` under
 *   `docStorage`'s `tmp` dir — NOT a path inside the (already deleted)
 *   per-job working dir.
 */
export default async function assembleQuarter(options: AssembleQuarterOptions): Promise<string> {
  const { lessons, jobId, workRoot } = options;

  const orderedLessons = orderQuarterLessons(lessons);
  const jobDir = path.join(workRoot, jobId);

  // The `finally` below `rm -rf`s jobDir, and in production `workRoot` is
  // `docs/assembly-work` — a sibling of the admin-uploaded source ODTs. An
  // empty or traversing jobId collapses `path.join` onto `workRoot` itself
  // (or outside it), so validate strict containment BEFORE anything creates
  // or deletes a directory.
  const relativeToRoot = path.relative(workRoot, jobDir);
  if (relativeToRoot === "" || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("failed to prepare assembly working directory");
  }

  try {
    return await assembleIntoJobDir(options, orderedLessons, jobDir);
  } finally {
    // Best-effort ONLY: a cleanup failure must never turn a successful
    // assembly into a failed job. Being a `finally` is what makes failed
    // jobs clean up too — the worst of the leak, since the user retries
    // immediately after one.
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("assembleQuarter: failed to clean up the job working dir", error);
    }
  }
}

/** The assembly proper. Everything it writes lives under `jobDir`, which its caller deletes. */
async function assembleIntoJobDir(
  options: AssembleQuarterOptions,
  orderedLessons: Lesson[],
  jobDir: string
): Promise<string> {
  const { storage, motherLang, majorityLangId, jobId, workRoot, signal } = options;

  throwIfAborted(signal);
  try {
    // Recursive so the dedicated `<docStorage>/assembly-work` root is created
    // on first use — nothing else provisions it (the startup sweep only
    // *removes* entries when the root already exists), so a non-recursive
    // mkdir here ENOENTs on its missing parent and fails every assembly.
    fs.mkdirSync(jobDir, { recursive: true });
  } catch {
    // Curated, fixed-vocabulary reason ONLY — a mkdir failure (e.g. EACCES,
    // ENOSPC) can carry an absolute filesystem path; never forward it (see
    // the makeLessonFile catch below for the full "reason hygiene" contract).
    throw new Error("failed to prepare assembly working directory");
  }

  const files: string[] = [];
  /** The FIRST constituent's (the TOC's) own meta — the assembled book's title/subject source. */
  let bookMeta: ConstituentMeta | undefined;
  for (let i = 0; i < orderedLessons.length; i++) {
    throwIfAborted(signal);
    const lesson = orderedLessons[i];
    let rawPath: string;
    try {
      rawPath = await makeLessonFile(storage, lesson, motherLang, majorityLangId);
    } catch {
      // Curated, fixed-vocabulary reason ONLY — never forward the raw
      // thrown error (data-model.md "reason hygiene"): it can carry a
      // stack trace or an absolute filesystem path, which
      // `AssemblyJobRegistry`'s `promoteNext().catch` would otherwise use
      // verbatim as the failed job's human-facing `reason`.
      throw new Error(`a lesson failed to generate: ${lessonName(lesson)}`);
    }
    const suffix = zeroPad(i);
    const copyPath = path.join(jobDir, `${suffix}.odt`);
    try {
      fs.copyFileSync(rawPath, copyPath);
      const constituentMeta = prepareConstituentForAssembly({
        odtPath: copyPath,
        series: lesson.series,
        lesson: lesson.lesson,
        isTOC: isTOCLesson(lesson),
        fallbackTitle: lessonName(lesson),
      });
      if (i === 0) bookMeta = constituentMeta;
    } catch {
      // Curated, fixed-vocabulary reason ONLY — see the makeLessonFile catch
      // above. A copyFileSync/prepareConstituentForAssembly failure (e.g. an
      // EACCES/ENOSPC copy error, an execFileSync 'zip' failure, a libxmljs2
      // parse error, or the outline-participant validation) can carry an
      // absolute filesystem path or a full command line; never forward it.
      throw new Error(`a lesson failed to prepare for assembly: ${lessonName(lesson)}`);
    }
    files.push(copyPath);
  }

  const outputPath = path.join(jobDir, "assembled.odt");
  throwIfAborted(signal);
  const result = await sofficeAssemble({
    jobId,
    files,
    outputPath,
    workRoot,
    signal,
  });

  // Curated, path-free reason: covers both a never-written outputPath (e.g.
  // soffice exited 0 but the macro silently no-oped — previously silently
  // returned a path to a nonexistent file) and a written-but-empty result.
  if (!fs.existsSync(result.outputPath) || fs.statSync(result.outputPath).size === 0) {
    throw new Error("assembly produced no result");
  }

  const firstLesson = orderedLessons.find((lsn) => !isTOCLesson(lsn));
  throwIfAborted(signal);
  try {
    finalizeAssembledQuarter({
      odtPath: result.outputPath,
      series: firstLesson?.series ?? orderedLessons[0].series,
      firstLessonNumber: firstLesson?.lesson ?? 1,
      title: bookMeta?.title ?? "",
      subject: bookMeta?.subject ?? "",
    });
  } catch {
    // Curated, path-free reason ONLY — a finalization failure (zip/libxmljs2)
    // can carry an absolute path or a full command line.
    throw new Error("assembly failed to finalize the merged book");
  }

  // Move the one file that must outlive the job out of jobDir before the
  // caller's `finally` deletes it. `tmpFilePath` yields
  // `<docs>/tmp/<timestamp>_<jobId>.odt`: the timestamp prefix is what makes
  // the existing 24 h `cleanTmpDir` sweep able to reap it, the jobId suffix
  // keeps it collision-free and traceable.
  const retainedPath = docStorage.tmpFilePath(`${jobId}.odt`);
  throwIfAborted(signal);
  try {
    // `moveFileSync`, not a bare rename: `workRoot` is caller-supplied — the
    // tests pass an `os.tmpdir()` fixture dir, and `docs/` can be its own
    // mount — so this move can cross filesystems and fail EXDEV. Its copy
    // fallback leaves the source behind, which the caller's `finally` deletes
    // along with the rest of the job dir.
    moveFileSync(result.outputPath, retainedPath);
  } catch {
    // Curated, path-free reason ONLY — a move failure (EACCES, ENOSPC)
    // carries both absolute paths.
    throw new Error("assembly failed to store the result");
  }

  return retainedPath;
}

/**
 * Resolve assembly order: TOC first, then the 13 lessons ascending by
 * absolute lesson number. NOT `lessonCompare`, which sorts the TOC
 * lesson's sentinel number (99) to the END rather than the front.
 */
function orderQuarterLessons(lessons: readonly Lesson[]): Lesson[] {
  const toc = lessons.filter(isTOCLesson);
  const rest = lessons.filter((lsn) => !isTOCLesson(lsn)).sort((a, b) => a.lesson - b.lesson);
  return [...toc, ...rest];
}

/** Zero-padded, ASCII, deterministic, insertion-order filename stem (e.g. "00", "13"). */
function zeroPad(index: number): string {
  return index < 10 ? `0${index}` : `${index}`;
}
