import {
  readSource,
  writeSourceLanguage,
  writeProjectLanguage,
  readProject,
  saveTStrings,
  getAllSrcStrings
} from "../FileStorage";
import { newProject } from "../../core/Project";

export default function createProject(
  srcLang: string,
  prjLang: string,
  fullTranslation: boolean
) {
  const source = readSource(srcLang);
  const allSrcStrings = getAllSrcStrings(source, fullTranslation);
  const datetime = newProjectDatetime();
  const [newSource, project, allTStrings] = newProject(
    source,
    allSrcStrings,
    prjLang,
    datetime,
    fullTranslation
  );
  writeSourceLanguage(newSource);
  writeProjectLanguage(project);
  allTStrings.forEach((tStrings, index) => {
    saveTStrings(project, project.lessons[index].lesson, tStrings);
  });
}

function newProjectDatetime() {
  while (true) {
    const datetime = Date.now().valueOf();
    try {
      const existing = readProject(datetime); // Should throw
    } catch (err) {
      return datetime;
    }
  }
}
