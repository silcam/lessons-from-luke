import { Project } from "../../core/Project";
import { readSourceLesson, getSrcStrings, getTStrings } from "../FileStorage";
import { last } from "../../core/util/arrayUtils";
import { prjUpdateDiff } from "../../core/projectUpdate";

export default function projectUpdate(project: Project, lessonIndex: number) {
  const prjLesson = project.lessons[lessonIndex];
  const srcLesson = readSourceLesson(project.sourceLang, prjLesson.lesson);
  const newVersion = last(srcLesson.versions).version;
  const newSrcStrings = getSrcStrings({
    language: project.sourceLang,
    lesson: prjLesson.lesson,
    version: newVersion
  });
  const oldSrcStrings = getSrcStrings({
    language: project.sourceLang,
    lesson: prjLesson.lesson,
    version: prjLesson.version
  });
  const oldTStrings = getTStrings(project, prjLesson.lesson);

  return prjUpdateDiff(oldSrcStrings, newSrcStrings, oldTStrings);
}
