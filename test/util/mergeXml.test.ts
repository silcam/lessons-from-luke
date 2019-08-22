import { resetTestStorage } from "../testHelper";
import fs from "fs";
import * as Storage from "../../src/util/Storage";
import mergeXml from "../../src/xml/mergeXml";

beforeAll(() => {
  resetTestStorage();
});

test("No-op XML merge", () => {
  const lessonId = {
    language: "English",
    lesson: "Luke-Q1-L01",
    version: 1
  };
  const startXml = compXml(lessonId);
  let tStrings: Storage.TDocString[] = JSON.parse(
    fs
      .readFileSync(
        "test/strings/translations/Pidgin_1555081479425/Luke-Q1-L01.json"
      )
      .toString()
  );
  tStrings = tStrings.map(s => ({ ...s, targetText: s.src }));
  mergeXml(
    Storage.documentPathForSource(lessonId),
    Storage.documentPathForSource(lessonId),
    tStrings
  );
  const finalXml = compXml(lessonId);
  expect(finalXml).toEqual(startXml);
});

function compXml(lessonId: Storage.LessonId) {
  return Storage.contentXml(lessonId).replace(/\s+/g, "");
}
