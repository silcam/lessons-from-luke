import * as Storage from "./Storage";
import * as Manifest from "./Manifest";
import { tmpDirPath, mkdirSafe } from "./fsUtils";
import path from "path";
import mergeXml from "../xml/mergeXml";

export default function documentPathForTranslation(
  projectId: Storage.ProjectId,
  lesson: string
) {
  const projectManifest = Manifest.readProjectManifest(projectId.datetime);
  const lessonManifest = projectManifest.lessons.find(
    lm => lm.lesson == lesson
  );
  if (!lessonManifest)
    throw `Lesson "${lesson}" not found in Project Manifest for project ${Storage.projectIdToString(
      projectId
    )}!`;
  const tStrings = Storage.getTStrings(projectId, lesson).filter(
    str => str.mtString
  );

  const tmpDocsPath = path.join(tmpDirPath(), "docs");
  mkdirSafe(tmpDocsPath);

  const lessonId = { ...lessonManifest, language: projectManifest.sourceLang };
  const docPath = path.join(
    tmpDocsPath,
    `${projectId.targetLang}-${lesson}.odt`
  );
  mergeXml(Storage.documentPathForSource(lessonId), docPath, tStrings);

  return docPath;
}
