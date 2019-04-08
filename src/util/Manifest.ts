import { LessonId, stringsDirPath } from "./Storage";
import fs from "fs";

const stringsDir = stringsDirPath();
const sourceManifestPath = `${stringsDir}/sources.json`;
const projectsManifestPath = `${stringsDir}/projects.json`;

interface LessonVersion {
  version: number;
  projects: string[];
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

export function addSourceLesson(lessonId: LessonId) {
  const manifest = readSourceManifest();
  let langManifest = manifest.find(lm => lm.language == lessonId.language);
  if (!langManifest) {
    langManifest = { language: lessonId.language, lessons: [], projects: [] };
    manifest.push(langManifest);
  }
  let lessonManifest = langManifest.lessons.find(
    lm => lm.lesson == lessonId.lesson
  );
  if (!lessonManifest) {
    lessonManifest = { lesson: lessonId.lesson, versions: [] };
    langManifest.lessons.push(lessonManifest);
  }
  lessonManifest.versions.push({ version: lessonId.version, projects: [] });

  writeSourceManifest(manifest);
}

// function languageManifest(language: string): Language | undefined {
//   return readSourceManifest().find(lm => lm.language == language)
// }

export function readSourceManifest(): SourceManifest {
  return JSON.parse(fs.readFileSync(sourceManifestPath).toString());
}

function writeSourceManifest(manifest: SourceManifest) {
  fs.writeFileSync(sourceManifestPath, JSON.stringify(manifest));
}
