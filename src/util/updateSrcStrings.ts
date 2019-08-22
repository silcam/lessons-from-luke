import { LessonId } from "./Storage";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import mergeXml from "../xml/mergeXml";
import parse from "../xml/parse";
import fs from "fs";

interface StrData {
  [name: string]: string;
}

export default function updateSrcStrings(
  oldLessonId: LessonId,
  strData: StrData
) {
  // Add new version to Manifest and copy files from old version
  const lessonManifest = Manifest.addSourceLesson(
    oldLessonId.language,
    oldLessonId.lesson
  );
  const newLessonid = {
    ...oldLessonId,
    version: lessonManifest.versions.length
  };
  Storage.makeLessonDir(newLessonid);

  // Update the xml based on form data
  const srcStrings = Storage.getSrcStrings(oldLessonId);
  const tStrings: Storage.TDocString[] = Object.keys(strData).map(idStr => {
    const id = parseInt(idStr);
    const srcString = srcStrings[id];
    return {
      id,
      xpath: srcString.xpath,
      src: srcString.text,
      targetText: strData[idStr]
    };
  });
  mergeXml(
    Storage.documentPathForSource(oldLessonId),
    Storage.documentPathForSource(newLessonid),
    tStrings
  );

  // Regenenerate source string json from updated xml
  const newSrcStrings = parse(Storage.contentXml(newLessonid));
  const stringsJsonPath = Storage.srcStringsJsonPath(newLessonid);
  fs.writeFileSync(stringsJsonPath, JSON.stringify(newSrcStrings));
}
