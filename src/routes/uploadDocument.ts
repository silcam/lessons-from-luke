import { Request, Response, NextFunction } from "express";
import adminHome from "./adminHome";
import layout from "../util/layout";
import fs from "fs";
import { mkdirSafe, unzip } from "../util/fsUtils";
import { UploadedFile } from "express-fileupload";
import parse from "../xml/parse";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";

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
  const docPath = `${lessonDirPath}/${lessonId.lesson}.odt`;
  await file.mv(docPath);
  unpack(lessonId, docPath);
  return lessonId;
}

function unpack(lessonId: Storage.LessonId, docPath: string) {
  const extractDir = Storage.odtDirPath(lessonId);
  mkdirSafe(extractDir);
  unzip(docPath, extractDir);
  const contentXmlPath = Storage.contentXmlPath(lessonId);
  const strings = parse(contentXmlPath);
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
