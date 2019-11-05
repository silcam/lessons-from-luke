import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";

export default function copyAheadTranslations(
  project: Manifest.Project,
  translatedLesson: string,
  tStrings: Storage.TDocString[]
) {
  const availableTranslations = tStrings.filter(
    str => str.targetText.length > 0
  );
  project.lessons.forEach(lesson => {
    if (lesson.lesson === translatedLesson) return;
    const targetTStrings = Storage.getTStrings(project, lesson.lesson);
    let targetTStringsUpdated = false;
    targetTStrings.forEach(targetTString => {
      if (targetTString.targetText.length > 0) return;
      const srcTString = availableTranslations.find(
        srcTStr => srcTStr.src === targetTString.src
      );
      if (srcTString) {
        targetTString.targetText = srcTString.targetText;
        targetTStringsUpdated = true;
      }
    });
    if (targetTStringsUpdated)
      Storage.saveTStrings(project, lesson.lesson, targetTStrings);
    Manifest.saveProgress(project, lesson.lesson, targetTStrings);
  });
}
