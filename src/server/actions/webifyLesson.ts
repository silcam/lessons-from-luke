import mergeXml from "../xml/mergeXml";
import docStorage from "../storage/docStorage";
import { Lesson } from "../../core/models/Lesson";
import { makeWebifyDocStrings } from "../../core/models/DocString";
import { zeroPad } from "../../core/util/numberUtils";
import { exec } from "child_process";

export default function webifyLesson(lesson: Lesson): Promise<void> {
  const origDocPath = docStorage.docFilepath(lesson);
  const webDocPath = docStorage.tmpFilePath(
    `${lesson.series}-${zeroPad(lesson.lesson, 2)}.odt`
  );
  const docStrings = makeWebifyDocStrings(lesson.lessonStrings);
  mergeXml(origDocPath, webDocPath, docStrings);
  return new Promise((resolve, reject) => {
    exec(
      `soffice --headless --convert-to htm:HTML --outdir ${docStorage.webifyPath()} ${webDocPath}`,
      error => {
        if (error) {
          console.error(error);
          resolve();
        } else {
          docStorage.mvWebifiedHtml(webDocPath, lesson.lessonId).finally(() => {
            resolve();
          });
        }
      }
    );
  });
}
