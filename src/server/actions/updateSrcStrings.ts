import { SourceLessonId, newSourceDoc } from "../../core/Source";
import mergeXml from "../xml/mergeXml";
import parse from "../xml/parse";
import fs from "fs";
import {
  readSource,
  getSrcStrings,
  documentPathForSource,
  contentXml,
  saveSrcStrings,
  writeSourceLanguage
} from "../FileStorage";
import { Translations } from "../../core/Project";
import { findByStrict } from "../../core/util/arrayUtils";
import { TStrings } from "../../core/TString";

// interface StrData {
//   [name: string]: string;
// }

export default function updateSrcStrings(
  oldLessonId: SourceLessonId,
  strData: Translations
) {
  // Add new version to Manifest and copy files from old version
  const source = newSourceDoc(
    readSource(oldLessonId.language),
    oldLessonId.lesson
  );
  const sourceLesson = findByStrict(
    source.lessons,
    "lesson",
    oldLessonId.lesson
  );
  const newLessonid = {
    ...oldLessonId,
    version: sourceLesson.versions.length
  };

  // Update the xml based on form data
  const srcStrings = getSrcStrings(oldLessonId);
  const tStrings: TStrings = Object.keys(strData).map(idStr => {
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
    documentPathForSource(oldLessonId),
    documentPathForSource(newLessonid),
    tStrings
  );

  // Regenenerate source string json from updated xml
  const newSrcStrings = parse(contentXml(newLessonid));
  saveSrcStrings(newLessonid, newSrcStrings);
  writeSourceLanguage(source);
}
