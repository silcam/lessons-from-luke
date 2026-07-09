import fs from "fs";
import path from "path";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language } from "../../core/models/Language";
import { Lesson, isTOCLesson, lessonName } from "../../core/models/Lesson";
import { mkdirSafe } from "../../core/util/fsUtils";
import makeLessonFile from "./makeLessonFile";
import { flattenFooterFields } from "./flattenFooterFields";
import { renameMasterPageStyles } from "./renameMasterPageStyles";
import { sofficeAssemble } from "../assembly/sofficeAssemble";

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
 * **Copy-before-flatten (CRITICAL, Pass 5)**: `makeLessonFile` is reused
 * unchanged. For the English-mother-tongue-bilingual case
 * (`makeLessonFile.ts:15`) it returns the RAW ADMIN-UPLOADED SOURCE `.odt`
 * under `docs/` — not a tmp copy. Every `makeLessonFile`-returned path MUST
 * be treated as strictly read-only: this function copies each of the 14
 * results into `<workRoot>/<jobId>/` BEFORE `flattenFooterFields` or the
 * `soffice` merge ever sees them. `flattenFooterFields` mutates its
 * `odtPath` in place, and an in-place mutation (or deletion) of the raw
 * source would destroy non-recoverable data.
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
 * **Per-constituent master-page/page-layout renaming (real soffice-merge
 * defect)**: all 14 constituents share one Word/LibreOffice template, so
 * they all use the SAME `style:master-page` names. `sofficeAssemble`'s
 * merge macro imports constituents one at a time into a shared base
 * document; on a page-style name collision (true for every constituent
 * after the first) LibreOffice's import keeps the FIRST-imported style
 * definition and discards the rest — even though each constituent's own
 * body content still references its style BY NAME. Since the TOC is
 * inserted first, its footer (whose own `meta.xml` has no `Lesson`
 * property, so it falls back to the sentinel lesson number) becomes the
 * ONE footer definition used for the entire merged book. `renameMasterPageStyles`
 * suffixes each copy's master-page/page-layout names (and every reference
 * to them, in both `styles.xml` and `content.xml`) with its own
 * zero-padded index BEFORE the merge, so the collision never occurs and
 * each of the 14 footers `flattenFooterFields` already correctly flattened
 * survives independently. See `renameMasterPageStyles.ts`'s doc comment for
 * the full contract.
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
}

/**
 * Run the full order-resolution + copy-before-flatten + `soffice` merge
 * orchestration for one assembly job. See the module doc comment for the
 * full contract this satisfies.
 *
 * @returns Absolute path to the assembled `.odt` once `soffice` has written it.
 */
export default async function assembleQuarter(options: AssembleQuarterOptions): Promise<string> {
  const { storage, lessons, motherLang, majorityLangId, jobId, workRoot } = options;

  const orderedLessons = orderQuarterLessons(lessons);
  const jobDir = path.join(workRoot, jobId);
  mkdirSafe(jobDir);

  const files: string[] = [];
  for (let i = 0; i < orderedLessons.length; i++) {
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
    fs.copyFileSync(rawPath, copyPath);
    renameMasterPageStyles({ odtPath: copyPath, suffix });
    flattenFooterFields({
      odtPath: copyPath,
      series: lesson.series,
      lesson: lesson.lesson,
    });
    files.push(copyPath);
  }

  const outputPath = path.join(jobDir, "assembled.odt");
  const result = await sofficeAssemble({
    jobId,
    files,
    outputPath,
    workRoot,
  });

  if (fs.existsSync(result.outputPath)) {
    const stats = fs.statSync(result.outputPath);
    if (stats.size === 0) {
      throw new Error(`sofficeAssemble produced an empty result at ${result.outputPath}`);
    }
  }

  return result.outputPath;
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
