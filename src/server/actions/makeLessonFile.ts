import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson, lessonName } from "../../core/models/Lesson";
import docStorage from "../storage/docStorage";
import { Persistence } from "../../core/interfaces/Persistence";
import { makeDocStrings, singleLanguageize } from "../../core/models/DocString";
import mergeXml from "../xml/mergeXml";

export default async function makeLessonFile(
  storage: Persistence,
  lesson: Lesson,
  motherLang: Language,
  majorityLangId: number
): Promise<string> {
  const engFilePath = docStorage.docFilepath(lesson);
  if (motherLang.languageId == ENGLISH_ID && majorityLangId == ENGLISH_ID)
    return engFilePath;

  const mtTStrings = await storage.tStrings({
    languageId: motherLang.languageId,
    lessonId: lesson.lessonId
  });
  const otherTStrings =
    majorityLangId > 0 && majorityLangId != motherLang.languageId
      ? await storage.tStrings({
          languageId: majorityLangId,
          lessonId: lesson.lessonId
        })
      : mtTStrings;

  let docStrings = makeDocStrings(
    lesson.lessonStrings,
    mtTStrings,
    otherTStrings
  );

  const singleLangDoc = majorityLangId == 0 ? true : false;
  if (singleLangDoc)
    docStrings = singleLanguageize(lesson.lessonStrings, docStrings);

  const filepath = docStorage.tmpFilePath(
    `${motherLang.name}_${lessonName(lesson)}.odt`
  );
  mergeXml(engFilePath, filepath, docStrings, {
    clearEmptyParagraphs: singleLangDoc
  });
  return filepath;
}
