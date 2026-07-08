import { Persistence } from "../../core/interfaces/Persistence";
import { Language } from "../../core/models/Language";
import { Lesson } from "../../core/models/Lesson";

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
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.2.2; real
 * implementation (+ REFACTOR) lands in lessons-from-luke-koog.6.2.3.
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
 * full contract this MUST satisfy once implemented.
 *
 * NOT YET IMPLEMENTED — see module doc comment.
 *
 * @returns Absolute path to the assembled `.odt` once `soffice` has written it.
 */
export default function assembleQuarter(_options: AssembleQuarterOptions): Promise<string> {
  throw new Error("not implemented");
}
