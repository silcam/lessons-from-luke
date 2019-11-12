import { findIndexBy, findBy } from "./util/arrayUtils";
import update from "immutability-helper";

export interface SourceLessonVersion {
  version: number;
  projects: string[];
  deleted?: boolean;
}

export interface SourceLessonId {
  language: string;
  lesson: string;
  version: number;
}

export interface SourceLesson {
  lesson: string;
  versions: SourceLessonVersion[];
}

export interface Source {
  language: string;
  lessons: SourceLesson[];
  projects: string[];
}

export type SourceManifest = Source[];

export function sourceLessonIdToString(lessonId: SourceLessonId) {
  const { language, lesson, version } = lessonId;
  return `${language}_${lesson}_${version}`;
}

export function sourceLessonIdFromString(str: string): SourceLessonId {
  const pieces = str.split("_");
  return {
    language: pieces[0],
    lesson: pieces[1],
    version: parseInt(pieces[2])
  };
}

export function newSource(language: string): Source {
  return { language, lessons: [], projects: [] };
}

export function newSourceDoc(source: Source, lesson: string) {
  let sourceLesson = findBy(source.lessons, "lesson", lesson);
  if (!sourceLesson) {
    sourceLesson = { lesson, versions: [] };
    const newLessons = [...source.lessons, sourceLesson].sort((a, b) =>
      a.lesson.localeCompare(b.lesson)
    );
    source = update(source, { lessons: { $set: newLessons } });
  }

  const lessonIndex = findIndexBy(source.lessons, "lesson", lesson);
  const version = sourceLesson.versions.length + 1;
  source = update(source, {
    lessons: {
      [lessonIndex]: { versions: { $push: [{ version, projects: [] }] } }
    }
  });
  sourceLesson.versions.push({ version, projects: [] });
  return source;
}

export function deleteLessonVersion(
  source: Source,
  lessonId: SourceLessonId
): Source {
  const lessonIndex = findIndexBy(source.lessons, "lesson", lessonId.lesson);
  if (
    source.lessons[lessonIndex].versions[lessonId.version - 1].projects.length >
    0
  )
    throw new Error(
      "Can't delete a source lesson version which still has projects!"
    );
  return update(source, {
    lessons: {
      [lessonIndex]: {
        versions: { [lessonId.version - 1]: { deleted: { $set: true } } }
      }
    }
  });
}
