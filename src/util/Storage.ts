import { mkdirSafe } from "./fsUtils";
import fs from "fs";
import { DocString } from "../xml/parse";
import process from "process";

export interface LessonId {
  language: string;
  lesson: string;
  version: number;
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

export function getSrcStrings(lessonId: LessonId) {
  const stringsJson = fs.readFileSync(srcStringsJsonPath(lessonId)).toString();
  return JSON.parse(stringsJson) as DocString[];
}

export function srcStringsJsonPath(lessonId: LessonId) {
  return `${lessonDirPath(lessonId)}/strings.json`;
}

export function contentXmlPath(lessonId: LessonId) {
  return `${odtDirPath(lessonId)}/content.xml`;
}

export function odtDirPath(lessonId: LessonId) {
  return `${lessonDirPath(lessonId)}/odt`;
}

export function makeLessonDir(lessonId: LessonId) {
  makeLangDir(lessonId.language);
  const dirPath = lessonDirPath(lessonId);
  mkdirSafe(dirPath);
  return dirPath;
}

export function lessonDirPath(lessonId: LessonId) {
  const { language, lesson, version } = lessonId;
  return `${languageDirPath(language)}/${lesson}_${version}`;
}

function makeLangDir(language: string) {
  const dirPath = languageDirPath(language);
  mkdirSafe(dirPath);
  return dirPath;
}

export function languageDirPath(language: string) {
  return `${srcStringsDirPath()}/${language}`;
}

function srcStringsDirPath() {
  return `${stringsDirPath()}/src`;
}

export function stringsDirPath() {
  if (process.env.NODE_ENV == "test") return "test/strings";
  return "strings";
}
