import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";

export default async function defaultTranslations(storage: Persistence, languageId: number) {
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

export function canAutoTranslate(text: string) {
  const trimmed = text.trim();
  // Auto-translate strings with nothing but digits, dashes, brackets and whitespace
  const autoTranslatePattern = /^[\d–\-[\]()\s]*$/;
  // Auto-translate numeric verse-reference ranges, e.g. "1:5–25" or "18:35–19:10"
  const verseRangePattern = /^\d+:\d+\s*[-–]\s*\d+(?::\d+)?$/;
  return autoTranslatePattern.test(trimmed) || verseRangePattern.test(trimmed);
}
