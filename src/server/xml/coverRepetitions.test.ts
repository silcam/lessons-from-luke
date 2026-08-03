/// <reference types="jest" />

import libxmljs2 from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import {
  COVER_REPETITION_PARAGRAPH_STYLES,
  removeCoverRepetitionParagraphs,
} from "./coverRepetitions";

const TITLE_STYLE = "English_20_translation_20_-_20_Cover_20_Title_20_";
const SUBTITLE_STYLE = "English_20_translation_20_-_20_Cover_20_subtitle";

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

describe("removeCoverRepetitionParagraphs", () => {
  test("exports the two real master repetition styles (title style ends with an encoded trailing space)", () => {
    expect(COVER_REPETITION_PARAGRAPH_STYLES).toEqual([TITLE_STYLE, SUBTITLE_STYLE]);
  });

  test("removes a paragraph referencing a repetition style directly (A3 master title form)", () => {
    const { doc, namespaces } = makeDoc(
      `<text:p text:style-name="M.T._20_-_20_Cover_20_Title">Titre</text:p>` +
        `<text:p text:style-name="${TITLE_STYLE}">Lessons from Luke</text:p>`
    );

    removeCoverRepetitionParagraphs(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("Lessons from Luke");
    expect(xml).toContain("Titre");
  });

  test("removes paragraphs referencing a repetition style through an automatic-style parent chain (A4 master form)", () => {
    const { doc, namespaces } = makeDoc(
      `<text:p text:style-name="P6">Lessons from Luke</text:p>` +
        `<text:p text:style-name="P8">Teacher’s guide</text:p>` +
        `<text:p text:style-name="P9">Keep me</text:p>`,
      `<style:style style:name="P6" style:family="paragraph" style:parent-style-name="${TITLE_STYLE}"/>` +
        `<style:style style:name="P8" style:family="paragraph" style:parent-style-name="P6b"/>` +
        `<style:style style:name="P6b" style:family="paragraph" style:parent-style-name="${SUBTITLE_STYLE}"/>` +
        `<style:style style:name="P9" style:family="paragraph" style:parent-style-name="Standard"/>`
    );

    removeCoverRepetitionParagraphs(doc, namespaces);

    const xml = doc.toString(false);
    expect(xml).not.toContain("Lessons from Luke");
    expect(xml).not.toContain("Teacher’s guide");
    expect(xml).toContain("Keep me");
  });

  test("never empties a table cell: a repetition paragraph that is the cell's only paragraph is blanked but kept", () => {
    const { doc, namespaces } = makeDoc(
      `<table:table><table:table-row><table:table-cell>` +
        `<text:p text:style-name="${SUBTITLE_STYLE}">Teacher’s guide</text:p>` +
        `</table:table-cell></table:table-row></table:table>`
    );

    removeCoverRepetitionParagraphs(doc, namespaces);

    const cellParagraphs = doc.find("//table:table-cell/text:p", namespaces);
    expect(cellParagraphs).toHaveLength(1);
    expect(doc.toString(false)).not.toContain("Teacher’s guide");
  });

  test("removes a repetition paragraph sharing a cell with its M.T. sibling, leaving the sibling", () => {
    const { doc, namespaces } = makeDoc(
      `<table:table><table:table-row><table:table-cell>` +
        `<text:p text:style-name="M.T._20_-_20_Cover_20_Title">Darussa daga Luka</text:p>` +
        `<text:p text:style-name="${TITLE_STYLE}">Lessons from Luke</text:p>` +
        `</table:table-cell></table:table-row></table:table>`
    );

    removeCoverRepetitionParagraphs(doc, namespaces);

    const cellParagraphs = doc.find("//table:table-cell/text:p", namespaces);
    expect(cellParagraphs).toHaveLength(1);
    expect(doc.toString(false)).toContain("Darussa daga Luka");
    expect(doc.toString(false)).not.toContain("Lessons from Luke");
  });

  test("is idempotent: running again on already-derived monolingual content changes nothing", () => {
    const { doc, namespaces } = makeDoc(
      `<text:p text:style-name="P6">Lessons from Luke</text:p>`,
      `<style:style style:name="P6" style:family="paragraph" style:parent-style-name="${TITLE_STYLE}"/>`
    );

    removeCoverRepetitionParagraphs(doc, namespaces);
    const firstPass = doc.toString(false);
    removeCoverRepetitionParagraphs(doc, namespaces);
    expect(doc.toString(false)).toBe(firstPass);
  });
});
