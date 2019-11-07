import { resetTestStorage } from "../testHelper";
import fs from "fs";
import mergeXml from "../../src/server/xml/mergeXml";
import {
  documentPathForSource,
  contentXml
} from "../../src/server/FileStorage";
import { TStrings } from "../../src/core/TString";
import { SourceLessonId } from "../../src/core/Source";

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
  let tStrings: TStrings = JSON.parse(
    fs
      .readFileSync(
        "test/strings/translations/Pidgin_1555081479425/Luke-Q1-L01.json"
      )
      .toString()
  );
  tStrings = tStrings.map(s => ({ ...s, targetText: s.src }));
  mergeXml(
    documentPathForSource(lessonId),
    documentPathForSource(lessonId),
    tStrings
  );
  const finalXml = compXml(lessonId);
  expect(finalXml).toEqual(startXml);
});

function compXml(lessonId: SourceLessonId) {
  return contentXml(lessonId).replace(/\s+/g, "");
}
