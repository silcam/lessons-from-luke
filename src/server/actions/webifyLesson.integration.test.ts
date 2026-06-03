/// <reference types="jest" />

// Integration test: actually invokes LibreOffice (`soffice --headless`) to
// convert an ODT lesson to HTML. Opt-in via `yarn test:integration`.
// IMPORTANT — This test can fail if LibreOffice Writer is open. Close it and retry.

import { PGTestStorage } from "../storage/PGStorage";
import webifyLesson from "./webifyLesson";
import docStorage from "../storage/docStorage";
import { unlinkSafe } from "../../core/util/fsUtils";
import fs from "fs";

test("Webify Lesson", async () => {
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
}, 30000);
