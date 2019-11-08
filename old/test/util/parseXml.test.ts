import { resetTestStorage } from "../testHelper";
import parse, { parseMeta, parseStyles } from "../../src/server/xml/parse";
import { contentXml, odtXml } from "../../src/server/FileStorage";

const lesson1Id = {
  language: "English",
  lesson: "Luke-Q1-L01",
  version: 1
};

beforeAll(() => {
  resetTestStorage();
});

test("Remove tracked changes", () => {
  // We should ignore the <text:tracked-changes> block. That block has many strings with the text "Unkown Author"
  const srcXml = contentXml(lesson1Id);
  const srcStrings = parse(srcXml);
  const unkownAuthorStrings = srcStrings.filter(str =>
    str.text.includes("Unknown Author")
  );
  expect(unkownAuthorStrings.length).toBe(0);
});

test("Parse Meta Xml", () => {
  const metaXml = odtXml(lesson1Id, "meta");
  const metaSrcStrings = parseMeta(metaXml);
  expect(metaSrcStrings).toEqual([
    {
      text: "The Book of Luke and the Birth of John the Baptizer",
      xpath: "/office:document-meta/office:meta/dc:subject/text()",
      metaString: true
    }
  ]);
});

test("Parse Styles Xml", () => {
  const stylesXml = odtXml(lesson1Id, "styles");
  const stylesSrcStrings = parseStyles(stylesXml);
  const stylesTexts = stylesSrcStrings.map(docStr => docStr.text);
  expect(stylesTexts).toEqual([
    "Quarter",
    "Lesson",
    "The Book of Luke and the Birth of John the Baptizer",
    "Page",
    "of",
    "2019 Wycliffe Bible Translators, Inc.;",
    "This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License. To view a copy of this license, visit http://creativecommons.org/licenses/by-nc-sa/4.0/deed.en_US.",
    "Wycliffe Bible Translators, Inc.",
    "; Lessons from Luke,",
    "Q",
    ", L",
    "Wycliffe Bible Translators",
    ", Inc.",
    "; Lessons from Luke,",
    "Q",
    ", L"
  ]);
});
