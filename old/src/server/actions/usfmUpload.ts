import testTranslateFromUsfm, {
  usfmParseBook
} from "../../core/translateFromUsfm";
import {
  getTStrings,
  saveTStrings,
  writeProjectLanguage,
  getTStringsHistory,
  saveTStringsHistory
} from "../FileStorage";
import { Project, translate } from "../../core/Project";
import { TStrings } from "../../core/TString";

export default function usfmUpload(
  usfm: string,
  project: Project,
  overwrite: boolean
) {
  const bookName = usfmParseBook(usfm);
  const lessonDiffs: {
    lesson: string;
    diff: { old: string; new: string }[];
  }[] = [];
  let parseErrors: string[] = [];
  const lessons = project.lessons;
  lessons.forEach(lesson => {
    if (lesson.lesson.startsWith(bookName)) {
      const oldTStrings = getTStrings(project, lesson.lesson);
      const tStringHistory = getTStringsHistory(project, lesson.lesson);
      try {
        const translateResult = testTranslateFromUsfm(oldTStrings, usfm, {
          overwrite
        });
        const [newProject, newTStrings, newTStringHistory] = translate(
          project,
          lesson.lesson,
          oldTStrings,
          translateResult.translations,
          tStringHistory
        );
        project = newProject;
        saveTStrings(project, lesson.lesson, newTStrings);
        saveTStringsHistory(project, lesson.lesson, newTStringHistory);

        lessonDiffs.push({
          lesson: lesson.lesson,
          diff: calcLessonDiff(oldTStrings, newTStrings)
        });
        parseErrors = parseErrors.concat(
          translateResult.errors.map(e => `${lesson.lesson} : ${e}`)
        );
      } catch (err) {
        parseErrors.push(`${lesson.lesson} : ${err}`);
      }
    }
  });
  writeProjectLanguage(project);
  return {
    lessonDiffs,
    parseErrors
  };
}

function calcLessonDiff(oldTStrings: TStrings, newTStrings: TStrings) {
  const diffs: { old: string; new: string }[] = [];
  return newTStrings.reduce((diffs, tString, index) => {
    if (tString.targetText == oldTStrings[index].targetText) return diffs;
    return [
      ...diffs,
      { old: oldTStrings[index].targetText, new: tString.targetText }
    ];
  }, diffs);
}
