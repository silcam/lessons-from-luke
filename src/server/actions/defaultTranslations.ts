import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";

export default async function defaultTranslations(
  storage: Persistence,
  languageId: number
): Promise<void> {
  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const tStrings: TString[] = englishStrings
    .filter((tStr) => canAutoTranslate(tStr.text))
    .map((englishString) => ({
      masterId: englishString.masterId,
      text: englishString.text,
      languageId: languageId,
      history: [],
      source: englishString.text,
      sourceLanguageId: ENGLISH_ID,
    }));
  await storage.saveTStrings(tStrings);
}

/**
 * Determines whether an English master string should be auto-translated
 * (copied verbatim as its own translation) rather than left for a human
 * translator.
 *
 * Accepts two shapes of trimmed text:
 *  1. Digit/dash/bracket/whitespace-only strings — e.g. numeral labels,
 *     verse-number lists, or bracketed digit groups such as `"12"`,
 *     `"[3]"`, or `""` (whitespace-only).
 *  2. Numeric verse-reference ranges — e.g. `"1:5–25"` or `"18:35–19:10"`.
 *
 * FR-016 invariant: recognition relies on the measured corpus fact that
 * every standalone numeric-reference-shaped master is a real scripture
 * reference (the corpus contains zero standalone non-reference numerics).
 * Recognition therefore uses text shape alone — there is deliberately **no**
 * parse-time book-name-adjacency guard. The accepted residual risk is that a
 * future document introducing a standalone reference-shaped non-reference
 * (e.g. a time such as `"3:00"`) would be auto-populated; this tradeoff is
 * accepted in favor of simplicity.
 */
export function canAutoTranslate(text: string): boolean {
  const trimmed = text.trim();
  // Auto-translate strings with nothing but digits, dashes, brackets and whitespace
  const autoTranslatePattern = /^[\d–\-[\]()\s]*$/;
  // Auto-translate numeric verse-reference ranges, e.g. "1:5–25" or "18:35–19:10"
  const verseRangePattern = /^\d+:\d+\s*[-–]\s*\d+(?::\d+)?$/;
  return autoTranslatePattern.test(trimmed) || verseRangePattern.test(trimmed);
}
