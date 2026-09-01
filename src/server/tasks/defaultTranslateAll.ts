import { ENGLISH_ID } from "../../core/models/Language";
import makeStorage from "../storage/makeStorage";
import { canAutoTranslate, fillMissingAutoTranslations } from "../actions/defaultTranslations";
import { Persistence } from "../../core/interfaces/Persistence";

/*
    This script is designed to be run manually on the server
    to insert default translations for existing languages
*/

if (require.main === module) {
  defaultTranslateAll().then(() => process.exit());
}

export async function defaultTranslateAll(storage: Persistence = makeStorage()) {
  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const autoTranslatableStrings = englishStrings.filter((tStr) => canAutoTranslate(tStr.text));

  const languages = await storage.languages();
  for (let i = 0; i < languages.length; ++i) {
    const language = languages[i];
    await fillMissingAutoTranslations(storage, autoTranslatableStrings, language.languageId);
  }
  console.log("Done");
}
