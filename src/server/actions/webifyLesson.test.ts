import { PGTestStorage } from "../storage/PGStorage";
import webifyLesson from "./webifyLesson";
import docStorage from "../storage/docStorage";
import { unlinkSafe } from "../../core/util/fsUtils";
import fs from "fs";

// This test takes forever, only run as needed
// IMPORTANT - This test can fail if LibreOffice Writer is open. Try closing LibreOffice and running again.

test.skip("Webify Lesson", async () => {
  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const storage = new PGTestStorage();
  const lesson = await storage.lesson(13);
  expect(lesson).toBeTruthy();
  if (lesson) {
    await webifyLesson(lesson, { force: true });
    expect(docStorage.webifiedHtml(lesson)).toBeTruthy();
  }

  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const filenames = fs.readdirSync(docStorage.webifyPath());
  filenames.forEach(filename => {
    if (/_1-03_htm/.test(filename))
      unlinkSafe(docStorage.webifyPath() + "/" + filename);
  });
}, 15000);
