import { UploadedFile } from "express-fileupload";
import { EnglishUploadMeta } from "../controllers/documentsController";
import { Persistence } from "../../core/interfaces/Persistence";
import { BaseLesson, DraftLesson } from "../../core/models/Lesson";
import { unset, objKeys } from "../../core/util/objectUtils";
import docStorage from "../storage/docStorage";
import { DocString } from "../../core/models/DocString";
import parse from "../xml/parse";

export async function uploadEnglishDoc(
  file: UploadedFile,
  meta: EnglishUploadMeta,
  storage: Persistence
): Promise<DocString[]> {
  const lessons = await storage.lessons();
  const existingLesson = lessons.find(
    lsn =>
      lsn.book === meta.book &&
      lsn.series === meta.series &&
      lsn.lesson === meta.lesson
  );
  const lesson: BaseLesson | DraftLesson = existingLesson
    ? { ...existingLesson, version: existingLesson.version + 1 }
    : {
        ...unset(meta, "languageId"),
        version: 1
      };

  const docFilepath = await docStorage.saveDoc(file, lesson);
  const xmls = docStorage.docXml(docFilepath);
  const docStrings = objKeys(xmls).reduce(
    (docStrings: DocString[], xmlType) =>
      docStrings.concat(parse(xmls[xmlType], xmlType)),
    []
  );

  return docStrings;
}

export async function uploadNonenglishDoc(
  file: UploadedFile
): Promise<DocString[]> {
  const xmls = await docStorage.saveTmp(file, async docFilepath => {
    return docStorage.docXml(docFilepath);
  });
  const docStrings = objKeys(xmls).reduce(
    (docStrings: DocString[], xmlType) =>
      docStrings.concat(parse(xmls[xmlType], xmlType)),
    []
  );
  return docStrings;
}
