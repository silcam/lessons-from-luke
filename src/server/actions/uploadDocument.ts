import { UploadedFile } from "express-fileupload";
import { EnglishUploadMeta } from "../../core/models/DocUploadMeta";
import { Persistence } from "../../core/interfaces/Persistence";
import { Lesson } from "../../core/models/Lesson";
import { unset } from "../../core/util/objectUtils";
import docStorage from "../storage/docStorage";
import { DocString } from "../../core/models/DocString";
import { saveDocStrings, parseDocStrings } from "./updateLesson";

export async function uploadEnglishDoc(
  file: UploadedFile,
  meta: EnglishUploadMeta,
  storage: Persistence
): Promise<Lesson> {
  const lessons = await storage.lessons();
  const existingLesson = lessons.find(
    lsn =>
      lsn.book === meta.book &&
      lsn.series === meta.series &&
      lsn.lesson === meta.lesson
  );
  const lesson =
    existingLesson || (await storage.createLesson(unset(meta, "languageId")));
  const newVersion = lesson.version + 1;

  const docFilepath = await docStorage.saveDoc(file, {
    ...lesson,
    version: newVersion
  });
  const docStrings = parseDocStrings(docFilepath);

  return saveDocStrings(lesson.lessonId, newVersion, docStrings, storage);
}

export async function uploadNonenglishDoc(
  file: UploadedFile
): Promise<DocString[]> {
  return docStorage.saveTmp(file, async docFilepath => {
    return parseDocStrings(docFilepath);
  });
}
