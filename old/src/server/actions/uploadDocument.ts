import { UploadedFile } from "express-fileupload";
import parse from "../xml/parse";
import { newSourceDoc, SourceLessonId } from "../../core/Source";
import {
  readSource,
  saveNewSourceDoc,
  contentXml,
  writeSourceLanguage,
  saveSrcStrings
} from "../FileStorage";
import { findByStrict } from "../../core/util/arrayUtils";

export function validateUploadDocument() {
  // Validate that the filename will produce a lesson name
}
export default async function uploadDocument(
  language: string,
  series: string,
  file: UploadedFile
) {
  const lesson = lessonFromFilename(series, file.name);
  const source = newSourceDoc(readSource(language), lesson);
  const sourceLesson = findByStrict(source.lessons, "lesson", lesson);
  const lessonId = {
    language,
    lesson,
    version: sourceLesson.versions.length
  };

  await saveNewSourceDoc(lessonId, file);
  const srcStrings = parse(contentXml(lessonId));
  writeSourceLanguage(source);
  saveSrcStrings(lessonId, srcStrings);

  return lessonId;
}

// Todo - validate filenames or something!
function lessonFromFilename(series: string, filename: string) {
  const pattern = /[QT]\d+-L\d+/;
  const match = pattern.exec(filename);
  if (!match)
    throw `Could not determine lesson name from filename ${filename}.`;
  const lessonName = match[0];
  return `${series}-${lessonName}`;
}
