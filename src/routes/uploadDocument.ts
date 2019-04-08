import { Request, Response, NextFunction } from "express";
import adminHome from "./adminHome";
import layout from "../util/layout";
import fs from "fs";
import { mkdirSafe, unzip } from "../util/fsUtils";
import { UploadedFile } from "express-fileupload";
import parse from "../xml/parse";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";

export function validateUploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.body.language) {
    res.send(layout(adminHome({ uploadError: "Language can't be blank." })));
  } else if (!req.files || !req.files.document) {
    res.send(layout(adminHome({ uploadError: "No file was attached." })));
  } else {
    next();
  }
}

export default async function uploadDocument(
  language: string,
  file: UploadedFile
) {
  const lessonId = {
    language,
    lesson: lessonFromFilename(file.name),
    version: new Date().valueOf()
  };
  const lessonDirPath = Storage.makeLessonDir(lessonId);
  const docPath = `${lessonDirPath}/${lessonId.lesson}.odt`;
  await file.mv(docPath);
  await unpack(lessonId, docPath);
  Manifest.addSourceLesson(lessonId);
  return lessonId;
}

async function unpack(lessonId: Storage.LessonId, docPath: string) {
  const extractDir = Storage.odtDirPath(lessonId);
  mkdirSafe(extractDir);
  unzip(docPath, extractDir);
  const contentXmlPath = Storage.contentXmlPath(lessonId);
  const strings = parse(contentXmlPath);
  const stringsJsonPath = Storage.srcStringsJsonPath(lessonId);
  fs.writeFileSync(stringsJsonPath, JSON.stringify(strings));
}

// Todo - validate filenames or something!
function lessonFromFilename(filename: string) {
  const pattern = /Q\d+-L\d+/;
  return pattern.exec(filename)[0];
}
