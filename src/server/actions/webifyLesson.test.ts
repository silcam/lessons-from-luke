import { PGTestStorage } from "../storage/PGStorage";
import webifyLesson from "./webifyLesson";
import docStorage from "../storage/docStorage";
import { unlinkSafe } from "../../core/util/fsUtils";
import fs from "fs";

test("Webify Lesson", async () => {
  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const storage = new PGTestStorage();
  const lesson = await storage.lesson(13);
  if (lesson) await webifyLesson(lesson);
  expect(docStorage.webifiedHtml(13)).toBeTruthy();

  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const filenames = fs.readdirSync(docStorage.webifyPath());
  filenames.forEach(filename => {
    if (/_1-03_htm/.test(filename))
      unlinkSafe(docStorage.webifyPath() + "/" + filename);
  });
}, 11000);