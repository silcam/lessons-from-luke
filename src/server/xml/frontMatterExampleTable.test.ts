/// <reference types="jest" />

import libxmljs2, { Document as XmlDocument } from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import {
  FRONT_MATTER_EXAMPLE_INSET_STYLES,
  collectFrontMatterExampleElements,
  removeFrontMatterExampleElements,
} from "./frontMatterExampleTable";

const MT_INSET_STYLE = "M.T._20_Text_20_-_20_Single_20_Inset";
const ENGLISH_INSET_STYLE = "English_20_Translation_20_-_20_single_20_inset";

function makeDoc(body: string, automaticStyles = "") {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
  <office:automatic-styles>${automaticStyles}</office:automatic-styles>
  <office:body><office:text>${body}</office:text></office:body>
</office:document-content>`;
  const doc = libxmljs2.parseXml(xml);
  return { doc, namespaces: extractNamespaces(doc) };
}

function exampleTable(name: string, mtStyle = MT_INSET_STYLE, engStyle = ENGLISH_INSET_STYLE) {
  return (
    `<table:table table:name="${name}"><table:table-row><table:table-cell>` +
    `<text:p text:style-name="${mtStyle}">Buma bo Kwasio</text:p>` +
    `<text:p text:style-name="${engStyle}">Kwasio line</text:p>` +
    `</table:table-cell></table:table-row></table:table>`
  );
}

const INTRO = `<text:p text:style-name="Standard">This curriculum is set up as a bilingual document (see example below).</text:p>`;

function collectAndRemove(doc: XmlDocument, namespaces: ReturnType<typeof extractNamespaces>) {
  removeFrontMatterExampleElements(collectFrontMatterExampleElements(doc, namespaces));
}

describe("collectFrontMatterExampleElements / removeFrontMatterExampleElements", () => {
  test("exports the two real inset styles", () => {
    expect(FRONT_MATTER_EXAMPLE_INSET_STYLES).toEqual([MT_INSET_STYLE, ENGLISH_INSET_STYLE]);
  });

  test("matches the table via the M.T. inset style alone", () => {
    const { doc, namespaces } = makeDoc(
      INTRO +
        `<table:table table:name="Table6"><table:table-row><table:table-cell>` +
        `<text:p text:style-name="${MT_INSET_STYLE}">Buma bo Kwasio</text:p>` +
        `</table:table-cell></table:table-row></table:table>` +
        `<text:p>Keep me</text:p>`
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("Table6");
    expect(xml).not.toContain("see example below");
    expect(xml).toContain("Keep me");
  });

  test("matches the table via the English inset style alone", () => {
    const { doc, namespaces } = makeDoc(
      INTRO +
        `<table:table table:name="Table6"><table:table-row><table:table-cell>` +
        `<text:p text:style-name="${ENGLISH_INSET_STYLE}">Kwasio line</text:p>` +
        `</table:table-cell></table:table-row></table:table>`
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("Table6");
    expect(xml).not.toContain("see example below");
  });

  test("matches the table via a derived automatic style (style:parent-style-name chain)", () => {
    const { doc, namespaces } = makeDoc(
      INTRO + exampleTable("Table6", "P7", "P8"),
      `<style:style style:name="P7" style:family="paragraph" style:parent-style-name="P7b"/>` +
        `<style:style style:name="P7b" style:family="paragraph" style:parent-style-name="${MT_INSET_STYLE}"/>` +
        `<style:style style:name="P8" style:family="paragraph" style:parent-style-name="${ENGLISH_INSET_STYLE}"/>`
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("Table6");
    expect(xml).not.toContain("see example below");
  });

  test("ancestor::table:table[1] resolves to the nearest enclosing table, not an outer one", () => {
    const { doc, namespaces } = makeDoc(
      `<table:table table:name="Outer"><table:table-row><table:table-cell>` +
        exampleTable("Inner") +
        `<text:p>Outer cell text</text:p>` +
        `</table:table-cell></table:table-row></table:table>`
    );

    const collected = collectFrontMatterExampleElements(doc, namespaces);
    const tables = collected.filter((el) => el.name() === "table");
    expect(tables).toHaveLength(1);
    expect(tables[0].attr("name")?.value()).toBe("Inner");

    removeFrontMatterExampleElements(collected);
    const xml = doc.toString(false);
    expect(xml).toContain("Outer cell text");
    expect(xml).not.toContain("Inner");
  });

  test("collects and removes the intro sentence when the immediate preceding sibling is a text:p", () => {
    const { doc, namespaces } = makeDoc(
      `<text:p>Earlier prose stays</text:p>` + INTRO + exampleTable("Table6")
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("see example below");
    expect(xml).toContain("Earlier prose stays");
  });

  test("leaves the preceding sibling alone when it is a heading", () => {
    const { doc, namespaces } = makeDoc(
      `<text:h text:outline-level="1">Introduction</text:h>` + exampleTable("Table6")
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).toContain("Introduction");
    expect(xml).not.toContain("Table6");
  });

  test("leaves the preceding sibling alone when it is another table", () => {
    const { doc, namespaces } = makeDoc(
      `<table:table table:name="Unrelated"><table:table-row><table:table-cell>` +
        `<text:p>Unrelated cell</text:p>` +
        `</table:table-cell></table:table-row></table:table>` +
        exampleTable("Table6")
    );

    collectAndRemove(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).toContain("Unrelated cell");
    expect(xml).not.toContain("Table6");
  });

  test("no-ops without throwing when a collected intro was already detached before removal", () => {
    const { doc, namespaces } = makeDoc(INTRO + exampleTable("Table6"));

    const collected = collectFrontMatterExampleElements(doc, namespaces);
    const intro = collected.find((el) => el.name() === "p");
    expect(intro).toBeDefined();
    // Simulate clearEmptyParagraphs detaching the untranslated intro between
    // collect and remove.
    intro!.remove();

    expect(() => removeFrontMatterExampleElements(collected)).not.toThrow();
    expect(doc.toString(false)).not.toContain("Table6");
  });

  test("leaves an unrelated table with no matching style untouched", () => {
    const { doc, namespaces } = makeDoc(
      `<table:table table:name="Plain"><table:table-row><table:table-cell>` +
        `<text:p text:style-name="Standard">Plain content</text:p>` +
        `</table:table-cell></table:table-row></table:table>`
    );

    const before = doc.toString(false);
    collectAndRemove(doc, namespaces);
    expect(doc.toString(false)).toBe(before);
  });

  test("no-ops on a document with no inset styles anywhere", () => {
    const { doc, namespaces } = makeDoc(`<text:p>Just prose</text:p>`);
    const before = doc.toString(false);
    collectAndRemove(doc, namespaces);
    expect(doc.toString(false)).toBe(before);
  });

  test("is idempotent: a second collect-and-remove pass changes nothing", () => {
    const { doc, namespaces } = makeDoc(INTRO + exampleTable("Table6"));

    collectAndRemove(doc, namespaces);
    const firstPass = doc.toString(false);
    collectAndRemove(doc, namespaces);
    expect(doc.toString(false)).toBe(firstPass);
  });

  test("removes two matching tables, deduped by path (both styles in each table collect it once)", () => {
    const { doc, namespaces } = makeDoc(
      INTRO + exampleTable("Table6") + INTRO + exampleTable("Table7")
    );

    const collected = collectFrontMatterExampleElements(doc, namespaces);
    expect(collected.filter((el) => el.name() === "table")).toHaveLength(2);
    expect(collected.filter((el) => el.name() === "p")).toHaveLength(2);

    removeFrontMatterExampleElements(collected);
    const xml = doc.toString(false);
    expect(xml).not.toContain("Table6");
    expect(xml).not.toContain("Table7");
    expect(xml).not.toContain("see example below");
  });
});
