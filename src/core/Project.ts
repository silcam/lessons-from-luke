import { last, findBy, findByStrict, findIndexBy } from "./util/arrayUtils";
import update from "immutability-helper";
import { TStrings } from "./TString";
import { Source } from "./Source";
import updateTStringHistory, { TStringHistory } from "./TStringHistory";
import { SrcStrings } from "./SrcString";

export interface ProjectLesson {
  lesson: string;
  version: number;
  progress?: number;
}

export interface ProjectId {
  targetLang: string;
  datetime: number;
}

export interface Project {
  sourceLang: string;
  targetLang: string;
  datetime: number;
  lockCode?: string;
  lessons: ProjectLesson[];
  fullTranslation?: boolean;
}

export type ProjectManifest = Project[];

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

export function newProject(
  source: Source,
  allSrcStrings: SrcStrings[],
  targetLang: string,
  datetime: number,
  fullTranslation?: boolean
): [Source, Project, TStrings[]] {
  const id: ProjectId = {
    targetLang,
    datetime
  };
  source = update(source, { projects: { $push: [projectIdToString(id)] } });

  const projectLessons: ProjectLesson[] = [];
  for (let i = 0; i < source.lessons.length; ++i) {
    const sourceLessonVersion = last(source.lessons[i].versions);
    projectLessons.push({
      lesson: source.lessons[i].lesson,
      version: sourceLessonVersion.version
    });
    sourceLessonVersion.projects.push(projectIdToString(id));
  }
  const project = {
    ...id,
    sourceLang: source.language,
    lessons: projectLessons,
    fullTranslation
  };

  const allTStrings = allSrcStrings.map(srcStrings =>
    generateTStrings(srcStrings)
  );

  return [source, project, allTStrings];
}

export type Translations = { [id: string]: string };

export function updateTStrings(
  project: Project,
  lesson: string,
  oldTStrings: TStrings,
  newTStrings: TStrings,
  tStringHistory: TStringHistory
): [Project, TStringHistory] {
  return [
    updateProgress(project, lesson, newTStrings),
    updateTStringHistory(tStringHistory, oldTStrings, newTStrings)
  ];
}

export function translate(
  project: Project,
  lesson: string,
  tStrings: TStrings,
  translations: Translations,
  tStringHistory: TStringHistory
): [Project, TStrings, TStringHistory] {
  const newTStrings = translateStrings(tStrings, translations);
  const newProject = updateProgress(project, lesson, newTStrings);
  const newHistory = updateTStringHistory(
    tStringHistory,
    tStrings,
    newTStrings
  );
  return [newProject, newTStrings, newHistory];
}

export function copyAheadTranslations(
  project: Project,
  translatedLesson: string,
  allTStrings: TStrings[]
): [Project, TStrings[], boolean[]] {
  const translatedLessonIndex = findIndexBy(
    project.lessons,
    "lesson",
    translatedLesson
  );
  const tStrings = allTStrings[translatedLessonIndex];
  const availableTranslations = tStrings.filter(
    str => str.targetText.length > 0
  );
  const updated = allTStrings.map(_ => false);
  project.lessons.forEach((lesson, lessonIndex) => {
    if (lesson.lesson === translatedLesson) return;
    const targetTStrings = allTStrings[lessonIndex];
    targetTStrings.forEach((targetTString, strIndex) => {
      if (targetTString.targetText.length > 0) return;
      const srcTString = availableTranslations.find(
        srcTStr => srcTStr.src === targetTString.src
      );
      if (srcTString) {
        allTStrings = update(allTStrings, {
          [lessonIndex]: {
            [strIndex]: { targetText: { $set: srcTString.targetText } }
          }
        });
        updated[lessonIndex] = true;
      }
    });
    if (updated[lessonIndex])
      project = updateProgress(
        project,
        lesson.lesson,
        allTStrings[lessonIndex]
      );
  });
  return [project, allTStrings, updated];
}

export function lockProject(project: Project): Project {
  if (project.lockCode)
    throw new Error("Cannot lock a project that is already locked!");
  const lock = Date.now()
    .valueOf()
    .toString();
  return update(project, { lockCode: { $set: lock } });
}

export function unlockProject(project: Project): Project {
  return update(project, { lockCode: { $set: undefined } });
}

export function projectSrcUpdatesAvailable(source: Source, project: Project) {
  return project.lessons.reduce((indices: number[][], lesson, index) => {
    const srcLesson = findByStrict(source.lessons, "lesson", lesson.lesson);
    const srcVersion = srcLesson!.versions[srcLesson.versions.length - 1]
      .version;
    if (srcVersion > lesson.version) indices.push([index, srcVersion]);
    return indices;
  }, []);
}

export function updateLessonVersion(
  source: Source,
  project: Project,
  lessonIndex: number,
  oldVersion: number,
  newVersion: number,
  srcStrings: SrcStrings,
  tStrings: TStrings,
  translations: Translations,
  tStringHistory: TStringHistory
): [Source, Project, TStrings, TStringHistory] {
  const newTStrings = generateTStrings(srcStrings).map(tStr => ({
    ...tStr,
    targetText: translations[tStr.id]
  }));
  const projectId = projectIdToString(project);
  let oldVersionProjects =
    source.lessons[lessonIndex].versions[oldVersion - 1].projects;
  oldVersionProjects = oldVersionProjects.filter(prj => prj !== projectId);
  source = update(source, {
    lessons: {
      [lessonIndex]: {
        versions: {
          [oldVersion - 1]: { projects: { $set: oldVersionProjects } },
          [newVersion - 1]: { projects: { $push: [projectId] } }
        }
      }
    }
  });
  project = update(project, {
    lessons: { [lessonIndex]: { version: { $set: newVersion } } }
  });
  tStringHistory = updateTStringHistory(tStringHistory, tStrings, newTStrings);
  return [source, project, newTStrings, tStringHistory];
}

function updateProgress(
  project: Project,
  lesson: string,
  tStrings: TStrings
): Project {
  const strings = project.fullTranslation
    ? tStrings
    : tStrings.filter(s => !!s.mtString);
  const progress = Math.round(
    (100 * strings.filter(ts => ts.targetText.length > 0).length) /
      strings.length
  );
  const lessonIndex = findIndexBy(project.lessons, "lesson", lesson);
  return update(project, {
    lessons: { [lessonIndex]: { progress: { $set: progress } } }
  });
}

function generateTStrings(srcStrings: SrcStrings): TStrings {
  return srcStrings.map((srcStr, index) => {
    const { text, ...str } = srcStr;
    return {
      ...str,
      id: index,
      src: text,
      targetText: ""
    };
  });
}

function translateStrings(
  tStrings: TStrings,
  translations: Translations
): TStrings {
  Object.keys(translations).forEach(id => {
    const targetText = translations[id].trim();
    if (targetText.length > 0) {
      const index = parseInt(id);
      tStrings = update(tStrings, {
        [index]: { targetText: { $set: targetText } }
      });
    }
  });
  return tStrings;
}
