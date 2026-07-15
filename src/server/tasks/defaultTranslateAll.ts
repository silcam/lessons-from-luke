import { ENGLISH_ID } from "../../core/models/Language";
import PGStorage from "../storage/PGStorage";
import { canAutoTranslate } from "../actions/defaultTranslations";
import { Persistence } from "../../core/interfaces/Persistence";

/*
    This script is designed to be run manually on the server
    to insert default translations for existing languages
*/

if (require.main === module) {
  defaultTranslateAll().then(() => process.exit());
}

export async function defaultTranslateAll(storage: Persistence = new PGStorage()) {
  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const autoTranslatableStrings = englishStrings.filter((tStr) => canAutoTranslate(tStr.text));

  const languages = await storage.languages();
  for (let i = 0; i < languages.length; ++i) {
    const language = languages[i];
    const existingTStrings = await storage.tStrings({
      languageId: language.languageId,
    });
    const newTStrings = autoTranslatableStrings
      .filter((engStr) => !existingTStrings.find((tStr) => tStr.masterId == engStr.masterId))
      .map((englishString) => ({
        masterId: englishString.masterId,
        text: englishString.text,
        languageId: language.languageId,
        history: [],
        source: englishString.text,
        sourceLanguageId: ENGLISH_ID,
      }));
    if (newTStrings.length > 0) await storage.saveTStrings(newTStrings);
  }
  console.log("Done");
}
