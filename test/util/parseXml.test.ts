import { resetTestStorage } from "../testHelper";
import parse from "../../src/xml/parse";
import * as Storage from "../../src/util/Storage";

beforeAll(() => {
  resetTestStorage();
});

test("Remove tracked changes", () => {
  // We should ignore the <text:tracked-changes> block. That block has many strings with the text "Unkown Author"
  const lessonId = {
    language: "English",
    lesson: "Luke-Q1-L01",
    version: 1
  };
  const srcXml = Storage.contentXml(lessonId);
  const srcStrings = parse(srcXml);
  const unkownAuthorStrings = srcStrings.filter(str =>
    str.text.includes("Unknown Author")
  );
  expect(unkownAuthorStrings.length).toBe(0);
});
