import { Persistence } from "../../core/interfaces/Persistence";
import translateFromUsfm from "./translateFromUsfm";
import { TString } from "../../core/models/TString";

export default async function importUsfm(
  usfm: string,
  languageId: number,
  storage: Persistence
) {
  const engStrings = await storage.englishScriptureTStrings();
  const { translations, errors } = translateFromUsfm(engStrings, usfm);
  const newTStrings: TString[] = translations.map(translation => ({
    masterId: translation.sourceTString.masterId,
    languageId,
    text: translation.text,
    history: []
  }));
  const finalTStrings = await storage.saveTStrings(newTStrings, {
    awaitProgress: true
  });
  return { errors, tStrings: finalTStrings };
}
