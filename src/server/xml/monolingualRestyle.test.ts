/// <reference types="jest" />

import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { extractNamespaces, Namespaces } from "./mergeXml";
import {
  MONOLINGUAL_PARAGRAPH_STYLE_RENAMES,
  restyleMonolingualParagraphs,
  assertRestyleTargetsDefined,
  RESTYLE_TARGET_MISSING_MESSAGE,
} from "./monolingualRestyle";

const OFFICE_NS = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const STYLE_NS = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";

/**
 * Content-shaped fixture: direct `text:style-name` references to all four
 * M.T. styles the monolingual template omits, automatic styles parenting on
 * an in-scope and an out-of-scope M.T. style, and out-of-scope references
 * (body text, TOC, cover) that must survive the restyle untouched.
 */
function buildContentDoc() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${OFFICE_NS}" xmlns:text="${TEXT_NS}" xmlns:style="${STYLE_NS}" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph" style:parent-style-name="M.T._20_Lesson_20_Title"/>
    <style:style style:name="P2" style:family="paragraph" style:parent-style-name="M.T._20_Text"/>
    <style:style style:name="P3" style:family="paragraph" style:parent-style-name="Lesson_20_Title"/>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:h text:style-name="M.T._20_Lesson_20_Title" text:outline-level="1">Yesu</text:h>
      <text:p text:style-name="M.T._20_Lesson_20_title_20_-_20_invisible">invisible title</text:p>
      <text:p text:style-name="M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse">memory verse</text:p>
      <text:p text:style-name="M.T._20_Coloring_20_Page_20_-_20_Truth">truth</text:p>
      <text:p text:style-name="M.T._20_Text">body text</text:p>
      <text:p text:style-name="M.T._20_-_20_Cover_20_Title">cover title</text:p>
      <text:p text:style-name="M.T._20_-_20_Cover_20_subtitle">cover subtitle</text:p>
      <text:p text:style-name="Contents_20_Heading">table of contents</text:p>
      <text:p text:style-name="P1">auto-styled paragraph</text:p>
    </office:text>
  </office:body>
</office:document-content>`;
  const doc = libxmljs2.parseXml(xml);
  return { doc, namespaces: extractNamespaces(doc) };
}

/**
 * Styles-shaped fixture: the four plain restyle targets defined as
 * paragraph styles in `office:styles` (as both template assets guarantee),
 * M.T. style DEFINITIONS that must never be renamed, and a footer-like
 * automatic style parenting on an in-scope M.T. style (the Luke-2-14
 * fixture shape).
 */
function buildStylesDoc(opts: { omitTarget?: string } = {}) {
  const targets = [
    "Lesson_20_Title",
    "Lesson_20_title_20_-_20_invisible",
    "Coloring_20_Page_20_-_20_Memory_20_Verse",
    "Coloring_20_Page_20_-_20_Truth",
  ].filter((name) => name !== opts.omitTarget);
  const targetDefs = targets
    .map((name) => `<style:style style:name="${name}" style:family="paragraph"/>`)
    .join("\n    ");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="${OFFICE_NS}" xmlns:text="${TEXT_NS}" xmlns:style="${STYLE_NS}" office:version="1.2">
  <office:styles>
    ${targetDefs}
    <style:style style:name="M.T._20_Lesson_20_Title" style:family="paragraph"/>
    <style:style style:name="M.T._20_Text" style:family="paragraph"/>
  </office:styles>
  <office:automatic-styles>
    <style:style style:name="MP1" style:family="paragraph" style:parent-style-name="M.T._20_Coloring_20_Page_20_-_20_Truth"/>
    <style:style style:name="MP2" style:family="paragraph" style:parent-style-name="M.T._20_Text"/>
  </office:automatic-styles>
</office:document-styles>`;
  const doc = libxmljs2.parseXml(xml);
  return { doc, namespaces: extractNamespaces(doc) };
}

function styleNameRefs(doc: XmlDocument, namespaces: Namespaces): string[] {
  return doc
    .find<Element>("//*[@text:style-name]", namespaces)
    .map((el) => el.attr("style-name")!.value());
}

test("MONOLINGUAL_PARAGRAPH_STYLE_RENAMES pins exactly the four confirmed M.T. → plain pairs", () => {
  expect(MONOLINGUAL_PARAGRAPH_STYLE_RENAMES).toEqual([
    { from: "M.T._20_Lesson_20_Title", to: "Lesson_20_Title" },
    { from: "M.T._20_Lesson_20_title_20_-_20_invisible", to: "Lesson_20_title_20_-_20_invisible" },
    {
      from: "M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse",
      to: "Coloring_20_Page_20_-_20_Memory_20_Verse",
    },
    { from: "M.T._20_Coloring_20_Page_20_-_20_Truth", to: "Coloring_20_Page_20_-_20_Truth" },
  ]);
});

test("renames direct text:style-name references for all four pairs", () => {
  const { doc, namespaces } = buildContentDoc();

  restyleMonolingualParagraphs(doc, namespaces);

  const refs = styleNameRefs(doc, namespaces);
  expect(refs).toContain("Lesson_20_Title");
  expect(refs).toContain("Lesson_20_title_20_-_20_invisible");
  expect(refs).toContain("Coloring_20_Page_20_-_20_Memory_20_Verse");
  expect(refs).toContain("Coloring_20_Page_20_-_20_Truth");
  expect(refs).not.toContain("M.T._20_Lesson_20_Title");
  expect(refs).not.toContain("M.T._20_Lesson_20_title_20_-_20_invisible");
  expect(refs).not.toContain("M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse");
  expect(refs).not.toContain("M.T._20_Coloring_20_Page_20_-_20_Truth");
});

test("renames style:parent-style-name on automatic styles (content.xml shape)", () => {
  const { doc, namespaces } = buildContentDoc();

  restyleMonolingualParagraphs(doc, namespaces);

  const p1 = doc.get<Element>("//style:style[@style:name='P1']", namespaces)!;
  expect(p1.attr("parent-style-name")!.value()).toBe("Lesson_20_Title");
});

test("renames style:parent-style-name on automatic styles (styles.xml footer shape)", () => {
  const { doc, namespaces } = buildStylesDoc();

  restyleMonolingualParagraphs(doc, namespaces);

  const mp1 = doc.get<Element>("//style:style[@style:name='MP1']", namespaces)!;
  expect(mp1.attr("parent-style-name")!.value()).toBe("Coloring_20_Page_20_-_20_Truth");
});

test("never renames style:name DEFINITIONS — stale M.T. definitions stay, plain targets stay", () => {
  const { doc, namespaces } = buildStylesDoc();

  restyleMonolingualParagraphs(doc, namespaces);

  const names = doc
    .find<Element>("//office:styles/style:style", namespaces)
    .map((el) => el.attr("name")!.value());
  expect(names).toContain("M.T._20_Lesson_20_Title");
  expect(names).toContain("M.T._20_Text");
  expect(names).toContain("Lesson_20_Title");
  // Exactly one Lesson_20_Title definition — the rename must not mint a duplicate.
  expect(names.filter((n) => n === "Lesson_20_Title")).toHaveLength(1);
});

test("leaves out-of-scope styles untouched: M.T. Text, TOC, and both Cover styles", () => {
  const { doc, namespaces } = buildContentDoc();

  restyleMonolingualParagraphs(doc, namespaces);

  const refs = styleNameRefs(doc, namespaces);
  expect(refs).toContain("M.T._20_Text");
  expect(refs).toContain("M.T._20_-_20_Cover_20_Title");
  expect(refs).toContain("M.T._20_-_20_Cover_20_subtitle");
  expect(refs).toContain("Contents_20_Heading");
  const p2 = doc.get<Element>("//style:style[@style:name='P2']", namespaces)!;
  expect(p2.attr("parent-style-name")!.value()).toBe("M.T._20_Text");
});

test("is idempotent — a second pass changes nothing", () => {
  const { doc, namespaces } = buildContentDoc();

  restyleMonolingualParagraphs(doc, namespaces);
  const afterFirst = doc.toString(false);
  restyleMonolingualParagraphs(doc, namespaces);

  expect(doc.toString(false)).toBe(afterFirst);
});

test("is a no-op on a document with no M.T. references", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${OFFICE_NS}" xmlns:text="${TEXT_NS}" xmlns:style="${STYLE_NS}" office:version="1.2">
  <office:body><office:text><text:p text:style-name="Lesson_20_Title">already plain</text:p></office:text></office:body>
</office:document-content>`;
  const doc = libxmljs2.parseXml(xml);
  const namespaces = extractNamespaces(doc);
  const before = doc.toString(false);

  restyleMonolingualParagraphs(doc, namespaces);

  expect(doc.toString(false)).toBe(before);
});

test("assertRestyleTargetsDefined passes when all four plain targets are defined paragraph styles", () => {
  const { doc, namespaces } = buildStylesDoc();

  expect(() => assertRestyleTargetsDefined(doc, namespaces)).not.toThrow();
});

test.each([
  "Lesson_20_Title",
  "Lesson_20_title_20_-_20_invisible",
  "Coloring_20_Page_20_-_20_Memory_20_Verse",
  "Coloring_20_Page_20_-_20_Truth",
])("assertRestyleTargetsDefined throws the curated message when %s is missing", (omitTarget) => {
  const { doc, namespaces } = buildStylesDoc({ omitTarget });

  expect(() => assertRestyleTargetsDefined(doc, namespaces)).toThrow(
    RESTYLE_TARGET_MISSING_MESSAGE
  );
});

test("RESTYLE_TARGET_MISSING_MESSAGE is curated and path-free", () => {
  expect(RESTYLE_TARGET_MISSING_MESSAGE).not.toMatch(/\//);
  expect(RESTYLE_TARGET_MISSING_MESSAGE.length).toBeGreaterThan(0);
});
