import translateFromUsfm, { usfmParseBook } from "../util/translateFromUsfm";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";

export default function usfmUpload(
  usfm: string,
  project: Manifest.Project,
  overwrite: boolean
) {
  const bookName = usfmParseBook(usfm);
  const lessonDiffs: {
    lesson: string;
    diff: { old: string; new: string }[];
  }[] = [];
  let parseErrors: string[] = [];
  project.lessons.forEach(lesson => {
    if (lesson.lesson.startsWith(bookName)) {
      const oldTStrings = Storage.getTStrings(project, lesson.lesson);
      try {
        const translateResult = translateFromUsfm(oldTStrings, usfm, {
          overwrite
        });
        lessonDiffs.push({
          lesson: lesson.lesson,
          diff: calcLessonDiff(oldTStrings, translateResult.tStrings)
        });
        Storage.saveTStrings(project, lesson.lesson, translateResult.tStrings);
        Manifest.saveProgress(project, lesson.lesson, translateResult.tStrings);
        parseErrors = parseErrors.concat(
          translateResult.errors.map(e => `${lesson.lesson} : ${e}`)
        );
      } catch (err) {
        parseErrors.push(`${lesson.lesson} : ${err}`);
      }
    }
  });
  return {
    lessonDiffs,
    parseErrors
  };
}

function calcLessonDiff(
  oldTStrings: Storage.TDocString[],
  newTStrings: Storage.TDocString[]
) {
  const diffs: { old: string; new: string }[] = [];
  return newTStrings.reduce((diffs, tString, index) => {
    if (tString.targetText == oldTStrings[index].targetText) return diffs;
    return [
      ...diffs,
      { old: oldTStrings[index].targetText, new: tString.targetText }
    ];
  }, diffs);
}
