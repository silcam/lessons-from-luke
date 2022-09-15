import parse from "./parse";
import libxmljs2 from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import docStorage from "../storage/docStorage";
import { saveDocStrings, parseDocStrings } from "../actions/updateLesson";
import { PGTestStorage } from "../storage/PGStorage";
import { ENGLISH_ID } from "../../core/models/Language";

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
    },
    {
      motherTongue: false,
      text: "Lessons from Luke",
      type: "meta",
      xpath: "/office:document-meta/office:meta/dc:title/text()"
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

test("Verify modified styles are parsed", async () => {
  // updated odt with new styles
  const newOdtPath = process.cwd() + "/cypress/fixtures/Luke-1-01-ChangedStyles.odt";
  let changedXmls: ReturnType<typeof docStorage.docXml>;
  changedXmls = docStorage.docXml(newOdtPath);

  let allStyles = parse(changedXmls.styles, "styles");
  //console.log("XXXX: ALL STYLES");
  //console.log(allStyles);
  //console.log("YYYYY: ALL STYLES");

  let docStrings = parseDocStrings(newOdtPath);
  let allStrings = docStrings.map(docStr => docStr.text);

 // console.log(docStrings);

  // this means they are parsed out of the doc, but not necessarily translatable
  expect(allStrings).toContain("MT_coloring_page_truth");
  expect(allStrings).toContain("MT_coloring_page_memory_verse");
  expect(allStrings).toContain("INVISIBLE");

  let storage = new PGTestStorage();
  let newLesson = await storage.lesson(12);
  expect(newLesson).not.toBe(null);

  let savedLesson = await saveDocStrings(newLesson!.lessonId, newLesson!.lessonId + 1, docStrings, storage);
  
  const tStrings = await storage.tStrings({
    languageId: ENGLISH_ID,
    lessonId: savedLesson.lessonId
  });

  const xmlDoc = libxmljs2.parseXml(changedXmls.content);
  const namespaces = extractNamespaces(xmlDoc);

  let allMTStrings = savedLesson.lessonStrings.map(lessonString => {
    const lsDomElement = xmlDoc.get(lessonString.xpath, namespaces);
    if (lessonString.motherTongue == true) {
      return lsDomElement?.text();
    }
  });

  expect(allMTStrings).toContain("MT_coloring_page_memory_verse");
  expect(allMTStrings).toContain("MT_coloring_page_truth");
  expect(allMTStrings).not.toContain("non_coloring_page");
  expect(allMTStrings).toContain("INVISIBLE"); // why isn't think working?
});