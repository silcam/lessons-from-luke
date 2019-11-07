import fs from "fs";
import path from "path";
import { findByStrict, last, findIndexBy } from "../core/util/arrayUtils";
import { SrcStrings, SrcString } from "../core/SrcString";
import { parseMeta, parseStyles } from "./xml/parse";
import { mkdirSafe, unzip, unlinkRecursive } from "../core/util/fsUtils";
import { TStrings } from "../core/TString";
import { TStringHistory } from "../core/TStringHistory";
import {
  SourceLesson,
  Source,
  SourceManifest,
  SourceLessonId
} from "../core/Source";
import {
  Project,
  ProjectManifest,
  ProjectId,
  projectIdToString
} from "../core/Project";
import { UploadedFile } from "express-fileupload";

const stringsDir = stringsDirPath();
const sourceManifestPath = path.join(stringsDir, "sources.json");
const projectsManifestPath = path.join(stringsDir, "projects.json");

// READ MANIFESTS ========================

export function readSourceLesson(
  language: string,
  lesson: string
): SourceLesson {
  const source = readSource(language);
  return findByStrict(source.lessons, "lesson", lesson);
}

export function readSource(language: string): Source {
  const manifest = readSourceManifest();
  return findByStrict(manifest, "language", language);
}

export function readSourceManifest(): SourceManifest {
  return JSON.parse(fs.readFileSync(sourceManifestPath).toString());
}

export function readProject(datetime: number): Project {
  const projects = readProjectManifest();
  return findByStrict(projects, "datetime", datetime);
}

export function readProjectManifest(): ProjectManifest {
  return JSON.parse(fs.readFileSync(projectsManifestPath).toString());
}

// WRITE MANIFESTS ============================

export function writeSourceLanguage(source: Source) {
  const manifest = readSourceManifest();
  const index = findIndexBy(manifest, "language", source.language);
  index >= 0 ? (manifest[index] = source) : manifest.push(source);
  writeSourceManifest(manifest);
}

export function writeProjectLanguage(project: Project) {
  const manifest = readProjectManifest();
  const index = findIndexBy(manifest, "datetime", project.datetime);
  index >= 0 ? (manifest[index] = project) : manifest.push(project);
  writeProjectManifest(manifest);
}

function writeSourceManifest(manifest: SourceManifest) {
  fs.writeFileSync(sourceManifestPath, JSON.stringify(manifest));
}

function writeProjectManifest(manifest: ProjectManifest) {
  fs.writeFileSync(projectsManifestPath, JSON.stringify(manifest));
}

// READ STRINGS ======================

export function getSrcStrings(
  lessonId: SourceLessonId,
  withStylesAndMeta?: boolean
) {
  const stringsJson = fs.readFileSync(srcStringsJsonPath(lessonId)).toString();
  const srcStrings = JSON.parse(stringsJson) as SrcStrings;
  if (withStylesAndMeta)
    return srcStrings
      .concat(parseMeta(odtXml(lessonId, "meta")))
      .concat(parseStyles(odtXml(lessonId, "styles")));
  return srcStrings;
}

export function getAllSrcStrings(srcLang: Source, withStylesAndMeta?: boolean) {
  return srcLang.lessons.map(lesson =>
    getSrcStrings(
      {
        language: srcLang.language,
        lesson: lesson.lesson,
        version: last(lesson.versions).version
      },
      withStylesAndMeta
    )
  );
}

export function getTStrings(projectId: ProjectId, lesson: string): TStrings {
  try {
    return JSON.parse(
      fs.readFileSync(tStringsJsonPath(projectId, lesson)).toString()
    );
  } catch (err) {
    return [];
  }
}

export function getAllTStrings(project: Project): TStrings[] {
  return project.lessons.map(lesson => getTStrings(project, lesson.lesson));
}

export function getTStringsHistory(
  projectId: ProjectId,
  lesson: string
): TStringHistory {
  const histFilepath = tStringsHistoryPath(projectId, lesson);
  return fs.existsSync(histFilepath)
    ? JSON.parse(fs.readFileSync(histFilepath).toString())
    : [];
}

// WRITE STRINGS ===============================================

export function addSource(source: Source) {
  mkdirSafe(sourceDirPath(source.language));
}

export function saveSrcStrings(
  lessonId: SourceLessonId,
  srcStrings: SrcStrings
) {
  fs.writeFileSync(srcStringsJsonPath(lessonId), JSON.stringify(srcStrings));
}

export function saveTStrings(
  projectId: ProjectId,
  lesson: string,
  tStrings: TStrings
) {
  fs.writeFileSync(
    tStringsJsonPath(projectId, lesson),
    JSON.stringify(tStrings)
  );
}

export function saveTStringsHistory(
  projectId: ProjectId,
  lesson: string,
  tStringsHistory: TStringHistory
) {
  fs.writeFileSync(
    tStringsHistoryPath(projectId, lesson),
    JSON.stringify(tStringsHistory)
  );
}

// READ LIBREOFFICE DOC
export function contentXml(lessonId: SourceLessonId) {
  return odtXml(lessonId, "content");
}

type OdtXml = "content" | "styles" | "meta";
export function odtXml(lessonId: SourceLessonId, xmlType: OdtXml) {
  const extractDirPath = path.join(sourceLessonDirPath(lessonId), "odt");
  mkdirSafe(extractDirPath);
  const docPath = documentPathForSource(lessonId);
  unzip(docPath, extractDirPath);
  const xmlPath = path.join(extractDirPath, `${xmlType}.xml`);
  const xml = fs.readFileSync(xmlPath).toString();
  unlinkRecursive(extractDirPath);
  return xml;
}

// WRITE LIBREOFFICE DOC

export async function saveNewSourceDoc(
  lessonId: SourceLessonId,
  docFile: UploadedFile
) {
  const docPath = documentPathForSource(lessonId);
  await docFile.mv(docPath);
  return docPath;
}

// export function desktopProjectManifestExists() {
//   return fs.existsSync(projectsManifestPath);
// }

// export function readDesktopProject(): Project {
//   const projects = readProjectManifest();
//   return projects[0];
// }

// export function removeDesktopProject() {
//   unlinkSafe(projectsManifestPath);
// }

// export function writeDesktopProject(project: Project) {
//   fs.writeFileSync(projectsManifestPath, JSON.stringify([project]));
// }

// PATHS

function stringsDirPath() {
  if (process.env.NODE_ENV == "test")
    return path.join(process.cwd(), "test", "strings");
  return path.join(process.cwd(), "strings");
}

function sourceDirPath(language: string) {
  return mkdirSafe(path.join(srcStringsDirPath(), language));
}

export function sourceLessonDirPath(lessonId: SourceLessonId) {
  const { language, lesson, version } = lessonId;
  return mkdirSafe(path.join(sourceDirPath(language), `${lesson}_${version}`));
}

export function documentPathForSource(lessonId: SourceLessonId) {
  const dirPath = sourceLessonDirPath(lessonId);
  const docPath = path.join(dirPath, `${lessonId.lesson}.odt`);
  return docPath;
}

function projectDirPath(projectId: ProjectId) {
  return mkdirSafe(path.join(tStringsDirPath(), projectIdToString(projectId)));
}

function srcStringsDirPath() {
  return mkdirSafe(path.join(stringsDirPath(), "src"));
}

function tStringsDirPath() {
  return mkdirSafe(path.join(stringsDirPath(), "translations"));
}

export function srcStringsJsonPath(lessonId: SourceLessonId) {
  return path.join(sourceLessonDirPath(lessonId), "strings.json");
}

function tStringsJsonPath(projectId: ProjectId, lesson: string) {
  return path.join(projectDirPath(projectId), `${lesson}.json`);
}

function tStringsHistoryPath(projectId: ProjectId, lesson: string) {
  const histDirPath = path.join(projectDirPath(projectId), "history");
  mkdirSafe(histDirPath);
  return path.join(histDirPath, `${lesson}.json`);
}
