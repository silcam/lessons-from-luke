import * as Storage from "./Storage";
import * as Manifest from "./Manifest";
import {
  tmpDirPath,
  mkdirSafe,
  copyRecursive,
  zip,
  unlinkRecursive
} from "./fsUtils";
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
  const odtStagingPath = path.join(
    tmpDocsPath,
    Storage.projectIdToString(projectId)
  );
  mkdirSafe(odtStagingPath);

  const srcDirPath = Storage.lessonDirPath({
    ...lessonManifest,
    language: projectManifest.sourceLang
  });
  copyRecursive(path.join(srcDirPath, "odt"), odtStagingPath);
  mergeXml(path.join(odtStagingPath, "content.xml"), tStrings);

  const docPath = path.join(
    tmpDocsPath,
    `${projectId.targetLang}-${lesson}.odt`
  );
  zip(odtStagingPath, docPath);

  unlinkRecursive(odtStagingPath);
  return docPath;
}
