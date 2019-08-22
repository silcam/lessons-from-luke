import fs from "fs";
import { UploadedFile } from "express-fileupload";
import parse from "../xml/parse";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import path from "path";

export function validateUploadDocument() {
  // Validate that the filename will produce a lesson name
}
export default async function uploadDocument(
  language: string,
  series: string,
  file: UploadedFile
) {
  const lesson = lessonFromFilename(series, file.name);
  const lessonManifest = Manifest.addSourceLesson(language, lesson);
  const lessonId = {
    language,
    lesson,
    version: lessonManifest.versions.length
  };
  const lessonDirPath = Storage.makeLessonDir(lessonId);
  const docPath = path.join(lessonDirPath, `${lessonId.lesson}.odt`);
  await file.mv(docPath);
  unpackStrings(lessonId, docPath);
  return lessonId;
}

function unpackStrings(lessonId: Storage.LessonId, docPath: string) {
  const xml = Storage.contentXml(lessonId);
  const strings = parse(xml);
  const stringsJsonPath = Storage.srcStringsJsonPath(lessonId);
  fs.writeFileSync(stringsJsonPath, JSON.stringify(strings));
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
