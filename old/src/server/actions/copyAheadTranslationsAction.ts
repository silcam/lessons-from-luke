import { Project, copyAheadTranslations } from "../../core/Project";
import {
  getAllTStrings,
  writeProjectLanguage,
  saveTStrings
} from "../FileStorage";

export default function copyAheadTranslationsAction(
  project: Project,
  translatedLesson: string
) {
  const [newProject, allTStrings, updated] = copyAheadTranslations(
    project,
    translatedLesson,
    getAllTStrings(project)
  );
  writeProjectLanguage(newProject);
  allTStrings.forEach((tStrings, index) => {
    if (updated[index])
      saveTStrings(project, project.lessons[index].lesson, tStrings);
  });
}
