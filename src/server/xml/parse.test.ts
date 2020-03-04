import docStorage from "../storage/docStorage";
import parse from "./parse";

const odtPath = process.cwd() + "/cypress/fixtures/English_Luke-Q1-L06.odt";
let xmls: ReturnType<typeof docStorage.docXml>;

beforeAll(() => {
  xmls = docStorage.docXml(odtPath);
});

/* 
  I'm pretty sure the current test doc doesn't have any tracked changes in it, so this test would be useless
*/
// test("Remove tracked changes", () => {
//   // We should ignore the <text:tracked-changes> block. That block has many strings with the text "Unkown Author"
//   const srcStrings = parse(xmls.content, "content");
//   const unkownAuthorStrings = srcStrings.filter(str =>
//     str.text.includes("Unknown Author")
//   );
//   expect(unkownAuthorStrings.length).toBe(0);
// });

test("Parse Meta Xml", () => {
  const metaSrcStrings = parse(xmls.meta, "meta");
  expect(metaSrcStrings).toEqual([
    {
      text: "Review: Lessons 1-5",
      xpath: "/office:document-meta/office:meta/dc:subject/text()",
      motherTongue: false,
      type: "meta"
    }
  ]);
});

test("Parse Styles Xml", () => {
  const stylesSrcStrings = parse(xmls.styles, "styles");
  const stylesTexts = stylesSrcStrings.map(docStr => docStr.text);
  expect(stylesTexts).toEqual([
    "Quarter",
    "Lesson",
    "Review: Lessons 1-5",
    "Page",
    "of",
    "2019 Wycliffe Bible Translators, Inc.;",
    "This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License. To view a copy of this license, visit http://creativecommons.org/licenses/by-nc-sa/4.0/deed.en_US.",
    "Quarter 1, Lesson 2",
    "An Angel Visits Mary",
    "Page",
    "of",
    "Wycliffe Bible Translators, Inc.",
    ";",
    "L",
    "essons from Luke, Q",
    ", L",
    "Wycliffe Bible Translators, Inc.",
    ";",
    "L",
    "essons from Luke, Q",
    ", L",
    "Quarter",
    "Lesson",
    "Review: Lessons 1-5",
    "Page"
  ]);
});
