import { tmpDirPath, mkdirSafe } from "../../core/util/fsUtils";
import path from "path";
import mergeXml from "../xml/mergeXml";
import { ProjectId, projectIdToString } from "../../core/Project";
import {
  readProject,
  getTStrings,
  documentPathForSource
} from "../FileStorage";

export default function documentPathForTranslation(
  projectId: ProjectId,
  lesson: string
) {
  const projectManifest = readProject(projectId.datetime);
  const lessonManifest = projectManifest.lessons.find(
    lm => lm.lesson == lesson
  );
  if (!lessonManifest)
    throw `Lesson "${lesson}" not found in Project Manifest for project ${projectIdToString(
      projectId
    )}!`;
  const allTStrings = getTStrings(projectId, lesson);
  const tStrings = projectManifest.fullTranslation
    ? allTStrings
    : allTStrings.filter(str => str.mtString);

  const tmpDocsPath = path.join(tmpDirPath(), "docs");
  mkdirSafe(tmpDocsPath);

  const lessonId = { ...lessonManifest, language: projectManifest.sourceLang };
  const docPath = path.join(
    tmpDocsPath,
    `${projectId.targetLang}-${lesson}.odt`
  );
  mergeXml(documentPathForSource(lessonId), docPath, tStrings);

  return docPath;
}
