import * as Manifest from "./Manifest";
import * as Storage from "./Storage";
import bestMatchMap from "./bestMatchMap";
import { compareTwoStrings } from "string-similarity";

type ProjectUpdateDiff = {
  change: "none" | "add" | "remove" | "change";
  oldSrc: string;
  newSrc: string;
  oldTranslation: string;
  newTranslation: string;
}[];

export function prjUpdateDiff(
  project: Manifest.Project,
  lessonIndex: number
): ProjectUpdateDiff {
  const prjLesson = project.lessons[lessonIndex];
  const srcLesson = Manifest.readSourceManifest(
    project.sourceLang,
    prjLesson.lesson
  );
  const newVersion = srcLesson.versions[srcLesson.versions.length - 1].version;
  const newSrcStrings = Storage.getSrcStrings({
    language: project.sourceLang,
    lesson: prjLesson.lesson,
    version: newVersion
  });
  const oldSrcStrings = Storage.getSrcStrings({
    language: project.sourceLang,
    lesson: prjLesson.lesson,
    version: prjLesson.version
  });
  const oldTStrings = Storage.getTStrings(project, prjLesson.lesson);
  const matchMap = bestMatchMap(oldSrcStrings, newSrcStrings, (a, b) =>
    compareTwoStrings(a.text, b.text)
  );
  const oldIndex = 0;
  const newIndex = 0;
  const mapIndex = 0;
  const diff: ProjectUpdateDiff = [];
  while (oldIndex < oldSrcStrings.length || newIndex < newSrcStrings.length) {
    const match = matchMap[mapIndex];
    if (match[0] == oldIndex && match[1] == newIndex) {
      if (oldSrcStrings[oldIndex].text == newSrcStrings[newIndex].text) {
        diff.push({ change: "none", oldSrc: oldSrcStrings[oldIndex] });
      }
    }
  }
}

export function prjUpdate(
  project: Manifest.Project,
  lessonIndex: number,
  srcVersion: number,
  translations: string[]
) {
  const prjLesson = project.lessons[lessonIndex];
  const srcStrings = Storage.getSrcStrings({
    language: project.sourceLang,
    lesson: prjLesson.lesson,
    version: srcVersion
  });
  const newTStrings: Storage.TDocString[] = srcStrings.map((srcStr, index) => ({
    id: index,
    xpath: srcStr.xpath,
    src: srcStr.text,
    mtString: srcStr.mtString,
    targetText: translations[index] || ""
  }));
  Storage.saveTStrings(project, prjLesson.lesson, newTStrings);
}
