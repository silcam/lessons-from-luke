import process from "process";
import fs from "fs";
import path from "path";
import { UploadedFile } from "express-fileupload";
import { BaseLesson } from "../../core/models/Lesson";
import { zeroPad } from "../../core/util/numberUtils";
import {
  mkdirSafe,
  unzip,
  unlinkRecursive,
  unlinkSafe
} from "../../core/util/fsUtils";
import { objKeys } from "../../core/util/objectUtils";

async function saveDoc(file: UploadedFile, lesson: BaseLesson) {
  const filepath = docFilepath(lesson);
  unlinkSafe(filepath);
  await file.mv(filepath);
  return filepath;
}

async function saveTmp<T>(
  file: UploadedFile,
  cb: (filepath: string) => Promise<T>
): Promise<T> {
  const filename = new Date().valueOf().toString() + ".odt";
  const filepath = `${docsTmpPath()}/${filename}`;
  await file.mv(filepath);
  const val = await cb(filepath);
  unlinkSafe(filepath);
  return val;
}

function tmpFilePath(baseName: string) {
  cleanTmpDir();
  const timestamp = new Date().valueOf().toString();
  const filepath = `${docsTmpPath()}/${timestamp}_${baseName}`;
  return filepath;
}

function cleanTmpDir() {
  const old = new Date().valueOf() - 1000 * 60 * 60 * 24;
  const filenames = fs.readdirSync(docsTmpPath());
  filenames.forEach(filename => {
    if (parseInt(filename) < old) unlinkSafe(`${docsTmpPath()}/${filename}`);
  });
}

// function docXmlForLesson(lesson: BaseLesson) {
//   return docXml(docFilepath(lesson));
// }

function docXml(docPath: string) {
  const extractDirPath = `${docPath}_${new Date().valueOf()}_FILES`;
  mkdirSafe(extractDirPath);
  unzip(docPath, extractDirPath);
  const xmls = { content: "", meta: "", styles: "" };
  objKeys(xmls).forEach(xmlType => {
    const xmlPath = path.join(extractDirPath, `${xmlType}.xml`);
    const xml = fs.readFileSync(xmlPath).toString();
    xmls[xmlType] = xml;
  });
  unlinkRecursive(extractDirPath);
  return xmls;
}

function docFilepath(lesson: BaseLesson) {
  const filename =
    lesson.book +
    "-" +
    lesson.series +
    "-" +
    zeroPad(lesson.lesson, 2) +
    "v" +
    zeroPad(lesson.version, 2) +
    ".odt";
  return `${docsDirPath()}/${filename}`;
}

function docsTmpPath() {
  const tmpPath = docsDirPath() + "/tmp";
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);
  return tmpPath;
}

function docsDirPath() {
  const docsPath =
    process.cwd() +
    (process.env.NODE_ENV === "test" ? "/test/docs/serverDocs" : "/docs");
  if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath);
  return docsPath;
}

export default {
  saveDoc,
  saveTmp,
  tmpFilePath,
  docXml,
  docFilepath
};
