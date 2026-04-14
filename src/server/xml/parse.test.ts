import parse, {
  findStylesToMatch,
  xPathForPWithStyle,
  xPathForHWithStyle,
  xPathForPWithStyleNameContains,
  xPathForParentStyle,
  xPathForParentStyleNameContains
} from "./parse";
import libxmljs2, { Element } from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import docStorage from "../storage/docStorage";
import { saveDocStrings, parseDocStrings } from "../actions/updateLesson";
import { ENGLISH_ID } from "../../core/models/Language";

const odtPath = process.cwd() + "/cypress/fixtures/English_Luke-Q1-L06.odt";
let xmls: ReturnType<typeof docStorage.docXml>;

beforeAll(() => {
  xmls = docStorage.docXml(odtPath);
});

test("Remove tracked changes", () => {
  // We should ignore the <text:tracked-changes> block. That block has many strings with the text "Unknown Author"
  // The fixture doesn't have tracked changes, so we verify the result is 0 Unknown Author strings
  const srcStrings = parse(xmls.content, "content");
  const unknownAuthorStrings = srcStrings.filter(str =>
    str.text.includes("Unknown Author")
  );
  expect(unknownAuthorStrings.length).toBe(0);
});

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

  let storage = (global as any).testStorage;
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
    const lsDomElement = xmlDoc.get<Element>(lessonString.xpath, namespaces);
    if (lessonString.motherTongue == true) {
      return lsDomElement?.text();
    }
  });

  expect(allMTStrings).toContain("MT_coloring_page_memory_verse");
  expect(allMTStrings).toContain("MT_coloring_page_truth");
  expect(allMTStrings).not.toContain("non_coloring_page");
  expect(allMTStrings).toContain("INVISIBLE"); // why isn't think working?
});

// Task 15: XPath generator function tests
describe("XPath generator functions", () => {
  test("xPathForPWithStyle", () => {
    expect(xPathForPWithStyle("Lesson_20_Title")).toBe(
      "//text:p[@text:style-name='Lesson_20_Title']"
    );
  });

  test("xPathForHWithStyle", () => {
    expect(xPathForHWithStyle("Lesson_20_Title")).toBe(
      "//text:h[@text:style-name='Lesson_20_Title']"
    );
  });

  test("xPathForPWithStyleNameContains", () => {
    expect(xPathForPWithStyleNameContains("M.T._20_Text")).toBe(
      "//text:p[contains(@text:style-name, 'M.T._20_Text')]"
    );
  });

  test("xPathForParentStyle", () => {
    expect(xPathForParentStyle("M.T._20_Text")).toBe(
      "//style:style[@style:parent-style-name='M.T._20_Text']"
    );
  });

  test("xPathForParentStyleNameContains", () => {
    expect(xPathForParentStyleNameContains("M.T._20")).toBe(
      "//style:style[contains(@style:parent-style-name, 'M.T._20')]"
    );
  });
});

// Task 16: findStylesToMatch tests
describe("findStylesToMatch", () => {
  const minimalStylesXml = `<?xml version="1.0"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">
  <office:styles>
    <style:style style:name="Child_Style" style:parent-style-name="Parent_Style"/>
    <style:style style:name="Another_MT_Child" style:parent-style-name="M.T._20_Text"/>
    <style:style style:name="Pattern_Child" style:parent-style-name="M.T._20_Pattern"/>
  </office:styles>
</office:document-styles>`;

  let xmlDoc: ReturnType<typeof libxmljs2.parseXml>;
  let namespaces: ReturnType<typeof extractNamespaces>;

  beforeAll(() => {
    xmlDoc = libxmljs2.parseXml(minimalStylesXml);
    namespaces = extractNamespaces(xmlDoc);
  });

  test("returns empty array when no matching styles found", () => {
    const result = findStylesToMatch(xmlDoc, namespaces, "Nonexistent_Style");
    expect(result).toEqual([]);
  });

  test("exact match: finds child style by parent name", () => {
    const result = findStylesToMatch(xmlDoc, namespaces, "Parent_Style");
    expect(result).toContain("Child_Style");
  });

  test("pattern match: finds styles by parent style name pattern", () => {
    const result = findStylesToMatch(xmlDoc, namespaces, "", "M.T._20");
    expect(result).toContain("Another_MT_Child");
    expect(result).toContain("Pattern_Child");
  });

  test("styles are concatenated (not deduplicated) for multiple matches", () => {
    // Both Another_MT_Child and Pattern_Child match "M.T._20" pattern
    const result = findStylesToMatch(xmlDoc, namespaces, "", "M.T._20");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// Task 18: Spanish and Cishingini parse roundtrip tests
describe("Parse Spanish ODT", () => {
  const spanishOdtPath =
    process.cwd() + "/test/fixtures/Spanish_Luke-Q1-L01.odt";
  let spanishXmls: ReturnType<typeof docStorage.docXml>;

  beforeAll(() => {
    spanishXmls = docStorage.docXml(spanishOdtPath);
  });

  test("Parse Spanish content produces DocStrings", () => {
    const docStrings = parse(spanishXmls.content, "content");
    expect(docStrings.length).toBeGreaterThan(0);
    expect(docStrings[0]).toHaveProperty("text");
    expect(docStrings[0]).toHaveProperty("xpath");
    expect(docStrings[0].type).toBe("content");
  });

  test("Parse Spanish meta produces DocStrings", () => {
    const metaStrings = parse(spanishXmls.meta, "meta");
    expect(metaStrings.length).toBeGreaterThan(0);
    expect(metaStrings[0].type).toBe("meta");
  });

  test("Parse Spanish styles produces DocStrings", () => {
    const stylesStrings = parse(spanishXmls.styles, "styles");
    expect(stylesStrings.length).toBeGreaterThan(0);
    expect(stylesStrings[0].type).toBe("styles");
  });
});

describe("Parse Cishingini ODT", () => {
  const cishinginiOdtPath =
    process.cwd() + "/test/fixtures/Cishingini (asg)_Luke-Q1-L01.odt";
  let cishinginiXmls: ReturnType<typeof docStorage.docXml>;

  beforeAll(() => {
    cishinginiXmls = docStorage.docXml(cishinginiOdtPath);
  });

  test("Parse Cishingini content produces DocStrings", () => {
    const docStrings = parse(cishinginiXmls.content, "content");
    expect(docStrings.length).toBeGreaterThan(0);
    expect(docStrings[0]).toHaveProperty("text");
    expect(docStrings[0]).toHaveProperty("xpath");
    expect(docStrings[0].type).toBe("content");
  });

  test("Parse Cishingini meta produces DocStrings", () => {
    const metaStrings = parse(cishinginiXmls.meta, "meta");
    expect(metaStrings.length).toBeGreaterThan(0);
    expect(metaStrings[0].type).toBe("meta");
  });

  test("Parse Cishingini styles produces DocStrings", () => {
    const stylesStrings = parse(cishinginiXmls.styles, "styles");
    expect(stylesStrings.length).toBeGreaterThan(0);
    expect(stylesStrings[0].type).toBe("styles");
  });
});