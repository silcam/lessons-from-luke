import { UploadedFile } from "express-fileupload";
import { EnglishUploadMeta } from "../../core/models/DocUploadMeta";
import { Persistence } from "../../core/interfaces/Persistence";
import { Lesson } from "../../core/models/Lesson";
import { unset } from "../../core/util/objectUtils";
import docStorage from "../storage/docStorage";
import { DocString } from "../../core/models/DocString";
import { saveDocStrings, parseDocStrings } from "./updateLesson";
import { splitReferencesInDocument } from "../xml/referenceSplitter";
import { canAutoTranslate } from "./defaultTranslations";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";

export async function uploadEnglishDoc(
  file: UploadedFile,
  meta: EnglishUploadMeta,
  storage: Persistence
): Promise<Lesson> {
  const lessons = await storage.lessons();
  const existingLesson = lessons.find(
    (lsn) => lsn.book === meta.book && lsn.series === meta.series && lsn.lesson === meta.lesson
  );
  const lesson = existingLesson || (await storage.createLesson(unset(meta, "languageId")));
  const newVersion = lesson.version + 1;
  const oldFullLesson = existingLesson ? await storage.lesson(existingLesson.lessonId) : null;
  const oldMasterIds = new Set<number>(
    oldFullLesson ? oldFullLesson.lessonStrings.map((ls) => ls.masterId) : []
  );

  const docFilepath = await docStorage.saveDoc(file, {
    ...lesson,
    version: newVersion,
  });
  splitReferencesInDocument(docFilepath, docFilepath);
  const docStrings = parseDocStrings(docFilepath);

  const finalLesson = await saveDocStrings(lesson.lessonId, newVersion, docStrings, storage);

  if (existingLesson) {
    await reCarryChangedNumericReferences(finalLesson, oldMasterIds, storage);
  }

  return finalLesson;
}

/**
 * Option A re-carry (spec.md FR-010, FR-011; red-team Pass 1 HIGH closure):
 * after an English re-upload creates new masters for changed auto-translatable
 * numeric references (e.g. "1:5–25" -> "1:5–24"), every existing non-English
 * language is filled in for those new masters ONLY if it does not already
 * have a tString for them (mirrors `defaultTranslateAll`'s skip-if-exists
 * logic exactly — never overwrites an existing translation, manual or auto).
 * Each language's fill write is isolated in a try/catch so one language's
 * failure is logged and does not abort processing the rest, or the upload
 * response itself (continue-on-error, matching `reparseEnglish`'s batch
 * discipline).
 */
async function reCarryChangedNumericReferences(
  finalLesson: Lesson,
  oldMasterIds: Set<number>,
  storage: Persistence
): Promise<void> {
  const newMasterIds = new Set(
    finalLesson.lessonStrings
      .map((ls) => ls.masterId)
      .filter((masterId) => !oldMasterIds.has(masterId))
  );
  if (newMasterIds.size === 0) return;

  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const autoTranslatableNewStrings = englishStrings.filter(
    (tStr) => newMasterIds.has(tStr.masterId) && canAutoTranslate(tStr.text)
  );
  if (autoTranslatableNewStrings.length === 0) return;

  const languages = await storage.languages();
  for (const language of languages) {
    if (language.languageId === ENGLISH_ID) continue;
    try {
      const existingTStrings = await storage.tStrings({ languageId: language.languageId });
      const fillTStrings: TString[] = autoTranslatableNewStrings
        .filter((engStr) => !existingTStrings.find((tStr) => tStr.masterId === engStr.masterId))
        .map((englishString) => ({
          masterId: englishString.masterId,
          text: englishString.text,
          languageId: language.languageId,
          history: [],
          source: englishString.text,
          sourceLanguageId: ENGLISH_ID,
        }));
      if (fillTStrings.length > 0) {
        await storage.saveTStrings(fillTStrings);
        console.log(
          `Re-carry: languageId=${language.languageId} filled ${fillTStrings.length} master(s) for lessonId=${finalLesson.lessonId}`
        );
      }
    } catch (error) {
      console.log(
        `Re-carry: languageId=${language.languageId} failed for lessonId=${finalLesson.lessonId}: ${error}`
      );
    }
  }
}

export async function uploadNonenglishDoc(file: UploadedFile): Promise<DocString[]> {
  return docStorage.saveTmp(file, async (docFilepath) => {
    return parseDocStrings(docFilepath);
  });
}
