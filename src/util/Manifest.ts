import {
  stringsDirPath,
  ProjectId,
  projectIdToString,
  TDocString,
  LessonId
} from "./Storage";
import fs from "fs";

const stringsDir = stringsDirPath();
const sourceManifestPath = `${stringsDir}/sources.json`;
const projectsManifestPath = `${stringsDir}/projects.json`;

interface LessonVersion {
  version: number;
  projects: string[];
  deleted?: boolean;
}

interface Lesson {
  lesson: string;
  versions: LessonVersion[];
}

interface Language {
  language: string;
  lessons: Lesson[];
  projects: string[];
}

export type SourceManifest = Language[];

interface ProjectLesson {
  lesson: string;
  version: number;
  progress?: number;
}

export interface Project {
  sourceLang: string;
  targetLang: string;
  datetime: number;
  lessons: ProjectLesson[];
}

export type ProjectManifest = Project[];

export function saveProgress(
  projectId: ProjectId,
  lesson: string,
  tStrings: TDocString[]
) {
  const mtStrings = tStrings.filter(s => !!s.mtString);
  const progress = Math.round(
    (100 * mtStrings.filter(ts => ts.targetText.length > 0).length) /
      mtStrings.length
  );
  const manifest = readProjectManifest();
  findBy(
    findBy(manifest, "datetime", projectId.datetime)!.lessons,
    "lesson",
    lesson
  )!.progress = progress;
  writeProjectManifest(manifest);
}

export function addSourceLanguage(language: string) {
  const manifest = readSourceManifest();
  if (findBy(manifest, "language", language)) return;
  manifest.push({ language, lessons: [], projects: [] });
  writeSourceManifest(manifest);
}

export function addSourceLesson(language: string, lesson: string) {
  const manifest = readSourceManifest();

  const langManifest = findBy(manifest, "language", language)!;

  let lessonManifest = findBy(langManifest.lessons, "lesson", lesson);
  if (!lessonManifest) {
    lessonManifest = { lesson, versions: [] };
    langManifest.lessons.push(lessonManifest);
    langManifest.lessons.sort((a, b) => a.lesson.localeCompare(b.lesson));
  }

  const version = lessonManifest.versions.length + 1;
  lessonManifest.versions.push({ version, projects: [] });
  writeSourceManifest(manifest);
  return lessonManifest;
}

export function deleteLessonVersion(lessonId: LessonId) {
  const manifest = readSourceManifest();
  const langManifest = findBy(manifest, "language", lessonId.language)!;
  const lessonManifest = findBy(
    langManifest.lessons,
    "lesson",
    lessonId.lesson
  )!;
  lessonManifest.versions[lessonId.version - 1].deleted = true;
  writeSourceManifest(manifest);
}

export function addProject(sourceLang: string, targetLang: string): Project {
  const projects = readProjectManifest();
  const sources = readSourceManifest();
  const source = findBy(sources, "language", sourceLang)!;
  const id: ProjectId = {
    targetLang,
    datetime: Date.now().valueOf()
  };

  source.projects.push(projectIdToString(id));

  const projectLessons: ProjectLesson[] = [];
  for (let i = 0; i < source.lessons.length; ++i) {
    const lessonVersionManifest = last(source.lessons[i].versions);
    projectLessons.push({
      lesson: source.lessons[i].lesson,
      version: lessonVersionManifest.version
    });
    lessonVersionManifest.projects.push(projectIdToString(id));
  }
  const project = {
    ...id,
    sourceLang,
    lessons: projectLessons
  };
  projects.push(project);

  writeProjectManifest(projects);
  writeSourceManifest(sources);
  return project;
}

// function languageManifest(language: string): Language | undefined {
//   return readSourceManifest().find(lm => lm.language == language)
// }

export function readSourceManifest(language: string, lesson: string): Lesson;
export function readSourceManifest(language: string): Language;
export function readSourceManifest(): SourceManifest;
export function readSourceManifest(language?: string, lesson?: string) {
  const manifest: SourceManifest = JSON.parse(
    fs.readFileSync(sourceManifestPath).toString()
  );
  if (!language) return manifest;
  const langManifest = findBy(manifest, "language", language)!;
  if (!lesson) return langManifest;
  return findBy(langManifest.lessons, "lesson", lesson)!;
}

function writeSourceManifest(manifest: SourceManifest) {
  fs.writeFileSync(sourceManifestPath, JSON.stringify(manifest));
}

export function readProjectManifest(datetime: number): Project;
export function readProjectManifest(datetime?: never): ProjectManifest;
export function readProjectManifest(datetime?: number) {
  const projects: ProjectManifest = JSON.parse(
    fs.readFileSync(projectsManifestPath).toString()
  );
  if (typeof datetime === "number") {
    return findBy(projects, "datetime", datetime);
  }
  return projects;
}

function writeProjectManifest(manifest: ProjectManifest) {
  fs.writeFileSync(projectsManifestPath, JSON.stringify(manifest));
}

function findBy<T, K extends keyof T>(list: T[], key: K, value: T[K]) {
  return list.find(item => item[key] === value);
}

function last<T>(list: T[]) {
  return list[list.length - 1];
}
