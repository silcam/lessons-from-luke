import { Language } from "../../core/models/Language";
import { AssemblyMode } from "../assembly/AssemblyJobRegistry";

/**
 * deriveMajorityLanguageId — the single, shared `mode` → `majorityLanguageId`
 * derivation used by both the per-lesson download (`documentsController`)
 * and the assembled-quarter download (`assemblyController`). US2
 * (lessons-from-luke-koog.6.3) requires assembled-quarter mode selection to
 * mirror the existing per-lesson rule EXACTLY — this function is the single
 * source of truth so the two call sites can never drift.
 *
 * Mirrors `documentsController`'s existing default:
 * `language.motherTongue ? language.defaultSrcLang : language.languageId`
 * for the `"bilingual"` mode; `"single-language"` mode always resolves to
 * `0` (no majority-language merge — `makeLessonFile`/`mergeXml`
 * single-languageizes the doc).
 *
 * This is a PURE derivation only — it introduces NO completeness gate of its
 * own (FR-004/FR-005: assembled-quarter mode selection has no stricter
 * completeness bar than the existing per-lesson partial-translation
 * fallback).
 *
 */
export default function deriveMajorityLanguageId(mode: AssemblyMode, language: Language): number {
  if (mode === "single-language") return 0;
  return language.motherTongue ? language.defaultSrcLang : language.languageId;
}
