import {
  mkdirSafe,
  copyRecursive,
  zip,
  stringsDirPath,
  unzip,
  unlinkRecursive
} from "./fsUtils";
import fs from "fs";
import path from "path";
import { DocString } from "../xml/parse";
import { Project } from "./Manifest";
import tStringHistory from "./TStringHistory";

export interface LessonId {
  language: string;
  lesson: string;
  version: number;
}

export interface TDocString {
  id: number;
  xpath: string;
  src: string;
  targetText: string;
  mtString?: boolean;
}

export interface ProjectId {
  targetLang: string;
  datetime: number;
}

export function lessonIdToString(lessonId: LessonId) {
  const { language, lesson, version } = lessonId;
  return `${language}_${lesson}_${version}`;
}

export function lessonIdFromString(str: string): LessonId {
  const pieces = str.split("_");
  return {
    language: pieces[0],
    lesson: pieces[1],
    version: parseInt(pieces[2])
  };
}

export function projectIdToString(id: ProjectId) {
  return `${id.targetLang}_${id.datetime}`;
}

export function projectIdFromString(str: string): ProjectId {
  const pieces = str.split("_");
  return {
    targetLang: pieces[0],
    datetime: parseInt(pieces[1])
  };
}

export function makeProjectDir(project: Project) {
  const dirPath = projectDirPath(project);
  mkdirSafe(dirPath);
  project.lessons.forEach(projectLesson => {
    const srcStrings = getSrcStrings({
      language: project.sourceLang,
      ...projectLesson
    });
    const tStrings: TDocString[] = srcStrings.map((srcString, index) => ({
      id: index,
      xpath: srcString.xpath,
      src: srcString.text,
      targetText: "",
      mtString: srcString.mtString
    }));
    fs.writeFileSync(
      tStringsJsonPath(project, projectLesson.lesson),
      JSON.stringify(tStrings)
    );
  });
}

export function makeDesktopProjectDir(project: Project) {
  const dirPath = projectDirPath(project);
  mkdirSafe(dirPath);
}

export function getSrcStrings(lessonId: LessonId) {
  const stringsJson = fs.readFileSync(srcStringsJsonPath(lessonId)).toString();
  return JSON.parse(stringsJson) as DocString[];
}

export function srcStringsJsonPath(lessonId: LessonId) {
  return path.join(lessonDirPath(lessonId), "strings.json");
}

export function getTStrings(
  projectId: ProjectId,
  lesson: string
): TDocString[] {
  return JSON.parse(
    fs.readFileSync(tStringsJsonPath(projectId, lesson)).toString()
  );
}

export function saveTStrings(
  projectId: ProjectId,
  lesson: string,
  tStrings: TDocString[]
) {
  saveTStringHistory(projectId, lesson, tStrings);
  fs.writeFileSync(
    tStringsJsonPath(projectId, lesson),
    JSON.stringify(tStrings)
  );
}

function saveTStringHistory(
  projectId: ProjectId,
  lesson: string,
  newTStrings: TDocString[]
) {
  const oldTStrings = getTStrings(projectId, lesson);
  const histFilepath = tStringsHistoryPath(projectId, lesson);
  const oldHistory = fs.existsSync(histFilepath)
    ? JSON.parse(fs.readFileSync(histFilepath).toString())
    : [];
  const newHistory = tStringHistory(oldHistory, oldTStrings, newTStrings);
  fs.writeFileSync(histFilepath, JSON.stringify(newHistory));
}

function tStringsHistoryPath(projectId: ProjectId, lesson: string) {
  const histDirPath = path.join(projectDirPath(projectId), "history");
  mkdirSafe(histDirPath);
  return path.join(histDirPath, `${lesson}.json`);
}

function tStringsJsonPath(projectId: ProjectId, lesson: string) {
  return path.join(projectDirPath(projectId), `${lesson}.json`);
}

export function documentPathForSource(lessonId: LessonId) {
  const dirPath = lessonDirPath(lessonId);
  const docPath = path.join(dirPath, `${lessonId.lesson}.odt`);
  return docPath;
}

export function makeLessonDir(lessonId: LessonId) {
  const dirPath = lessonDirPath(lessonId);
  mkdirSafe(dirPath);
  return dirPath;
}

export function contentXml(lessonId: LessonId) {
  const extractDirPath = path.join(lessonDirPath(lessonId), "odt");
  mkdirSafe(extractDirPath);
  const docPath = documentPathForSource(lessonId);
  unzip(docPath, extractDirPath);
  const contentXmlPath = path.join(extractDirPath, "content.xml");
  const xml = fs.readFileSync(contentXmlPath).toString();
  unlinkRecursive(extractDirPath);
  return xml;
}

export function copyLessonDir(oldLessonId: LessonId, newLessonId: LessonId) {
  const newDirPath = lessonDirPath(newLessonId);
  const oldDirPath = lessonDirPath(oldLessonId);
  copyRecursive(oldDirPath, newDirPath);
}

export function lessonDirPath(lessonId: LessonId) {
  const { language, lesson, version } = lessonId;
  return path.join(languageDirPath(language), `${lesson}_${version}`);
}

export function makeLangDir(language: string) {
  const dirPath = languageDirPath(language);
  mkdirSafe(dirPath);
  return dirPath;
}

export function languageDirPath(language: string) {
  return path.join(srcStringsDirPath(), language);
}

function projectDirPath(projectId: ProjectId) {
  return path.join(tStringsDirPath(), projectIdToString(projectId));
}

function tStringsDirPath() {
  return path.join(stringsDirPath(), "translations");
}

function srcStringsDirPath() {
  return path.join(stringsDirPath(), "src");
}
