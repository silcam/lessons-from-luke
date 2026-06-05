import process from "process";
import fs from "fs";
import os from "os";
import path from "path";
import { UploadedFile } from "express-fileupload";
import { BaseLesson } from "../../core/models/Lesson";
import { zeroPad } from "../../core/util/numberUtils";
import { mkdirSafe, unzip, unlinkRecursive, unlinkSafe } from "../../core/util/fsUtils";
import { objKeys } from "../../core/util/objectUtils";
import waitFor from "../../core/util/waitFor";

async function saveDoc(file: UploadedFile, lesson: BaseLesson) {
  const filepath = docFilepath(lesson);
  unlinkSafe(filepath);
  await file.mv(filepath);
  return filepath;
}

async function saveTmp<T>(file: UploadedFile, cb: (filepath: string) => Promise<T>): Promise<T> {
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
  filenames.forEach((filename) => {
    if (parseInt(filename) < old) unlinkSafe(`${docsTmpPath()}/${filename}`);
  });
}

// function docXmlForLesson(lesson: BaseLesson) {
//   return docXml(docFilepath(lesson));
// }

function docXml(docPath: string) {
  // Extract into an OS temp dir (outside the project tree) rather than next to
  // the source ODT. When this transient tree lived under docs/, jest-haste-map's
  // NodeWatcher — the fallback watcher used in Docker/Linux where watchman and
  // fsevents are absent — would crash with ENOENT trying to fs.watch() a
  // subdirectory that unlinkRecursive had already deleted mid-scan.
  const extractDirPath = path.join(
    os.tmpdir(),
    `${path.basename(docPath)}_${new Date().valueOf()}_FILES`
  );
  mkdirSafe(extractDirPath);
  try {
    unzip(docPath, extractDirPath);
    const xmls = { content: "", meta: "", styles: "" };
    objKeys(xmls).forEach((xmlType) => {
      const xmlPath = path.join(extractDirPath, `${xmlType}.xml`);
      const xml = fs.readFileSync(xmlPath).toString();
      xmls[xmlType] = xml;
    });
    return xmls;
  } finally {
    unlinkRecursive(extractDirPath);
  }
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

function webifiedHtml(lesson: BaseLesson): string | null {
  const htmPath = webifiedHtmPath(lesson);
  if (!fs.existsSync(htmPath)) return null;
  const html = fs.readFileSync(htmPath).toString();
  return html.replace(/<img src="/g, '<img src="/webified/');
}

async function mvWebifiedHtml(tmpOdtPath: string, lesson: BaseLesson) {
  const inPath = `${webifyPath()}/${path.basename(tmpOdtPath).replace(/odt$/, "htm")}`;
  try {
    await waitFor(() => fs.existsSync(inPath));

    const outPath = webifiedHtmPath(lesson);
    fs.renameSync(inPath, outPath);
  } catch (err) {
    console.error(err);
  }
}

function webifiedHtmPath(lesson: BaseLesson) {
  const { lessonId, version } = lesson;
  return `${webifyPath()}/${lessonId}-${version}.htm`;
}

function docsTmpPath() {
  return requireDir(docsDirPath() + "/tmp");
}

function webifyPath() {
  return requireDir(docsDirPath() + "/web");
}

function docsDirPath() {
  const env = process.env.NODE_ENV;
  const subpath =
    env === "test" ? "/test/docs/serverDocs" : env === "development" ? "/docs/dev" : "/docs";
  return requireDir(process.cwd() + subpath);
}

function requireDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
  return dirPath;
}

export default {
  saveDoc,
  saveTmp,
  tmpFilePath,
  docXml,
  docFilepath,
  webifyPath,
  mvWebifiedHtml,
  webifiedHtml,
};
