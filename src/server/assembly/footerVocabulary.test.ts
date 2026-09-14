/// <reference types="jest" />

import fs from "fs";
import os from "os";
import path from "path";
import libxmljs2, { Text } from "libxmljs2";
import { unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces } from "../xml/mergeXml";
import {
  QUARTER_FOOTER_LITERALS,
  collectFooterVocabulary,
  forEachFooterTextNode,
} from "./footerVocabulary";
import { resolveTemplatePath } from "./quarterStylesTemplate";

/** The committed template asset's own `styles.xml`, read straight out of the `.odt`. */
function templateStylesXml(singleLanguage: boolean): string {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "footer-vocabulary-template-"));
  try {
    unzip(resolveTemplatePath(singleLanguage), extractDir);
    return fs.readFileSync(path.join(extractDir, "styles.xml"), "utf-8");
  } finally {
    unlinkRecursive(extractDir);
  }
}

function stylesXmlWithFooter(footerInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:master-styles>
    <style:master-page style:name="Standard">
      <style:footer><text:p>${footerInner}</text:p></style:footer>
    </style:master-page>
  </office:master-styles>
</office:document-styles>`;
}

/** Every `(text, parentLocalName)` pair the walker visits, in document order. */
function visitedNodes(stylesXml: string): { text: string; parent: string }[] {
  const doc = libxmljs2.parseXml(stylesXml);
  const visited: { text: string; parent: string }[] = [];
  forEachFooterTextNode(doc, extractNamespaces(doc), (node, parentLocalName) => {
    visited.push({ text: node.text(), parent: parentLocalName });
  });
  return visited;
}

describe("QUARTER_FOOTER_LITERALS", () => {
  test("covers the generic footer words, both apostrophe variants of the guide subtitle, and a book title per book", () => {
    expect(QUARTER_FOOTER_LITERALS).toEqual(
      expect.arrayContaining([
        "Quarter",
        "Lesson",
        "Page",
        "Teacher’s Guide",
        "Teacher's Guide",
        "Lessons from Luke",
        "Lessons from Acts",
      ])
    );
  });
});

describe("collectFooterVocabulary (committed template guard)", () => {
  test("every translatable literal in the BILINGUAL template's footers is a known literal", () => {
    const vocabulary = collectFooterVocabulary(templateStylesXml(false));

    expect(vocabulary.length).toBeGreaterThan(0);
    expect(vocabulary.filter((literal) => !QUARTER_FOOTER_LITERALS.includes(literal))).toEqual([]);
  });

  test("every translatable literal in the MONOLINGUAL template's footers is a known literal", () => {
    const vocabulary = collectFooterVocabulary(templateStylesXml(true));

    expect(vocabulary.length).toBeGreaterThan(0);
    expect(vocabulary.filter((literal) => !QUARTER_FOOTER_LITERALS.includes(literal))).toEqual([]);
  });

  test("trims surrounding whitespace and dedupes repeated literals", () => {
    const vocabulary = collectFooterVocabulary(
      stylesXmlWithFooter(
        `<text:span>Quarter </text:span><text:span> Quarter</text:span><text:span>Lesson</text:span>`
      )
    );

    expect(vocabulary).toEqual(["Quarter", "Lesson"]);
  });
});

describe("forEachFooterTextNode", () => {
  test("skips the cached text of live fields (chapter, page-number, user-defined)", () => {
    const visited = visitedNodes(
      stylesXmlWithFooter(
        `<text:chapter text:display="name">Review Lesson</text:chapter>` +
          `<text:user-defined text:name="Quarter">2</text:user-defined>` +
          `<text:page-number text:select-page="current">iii</text:page-number>` +
          `<text:span>Lesson</text:span>`
      )
    );

    expect(visited).toEqual([{ text: "Lesson", parent: "span" }]);
  });

  test("skips text carrying no letters (separators, digits, whitespace)", () => {
    const visited = visitedNodes(
      stylesXmlWithFooter(`: <text:span> – </text:span>42<text:span>Page </text:span>`)
    );

    expect(visited).toEqual([{ text: "Page ", parent: "span" }]);
  });

  test("reports the cached text of text:title and text:subject with their own parent names", () => {
    const visited = visitedNodes(
      stylesXmlWithFooter(
        `<text:title>Lessons from Luke</text:title><text:subject>Teacher's Guide</text:subject>`
      )
    );

    expect(visited).toEqual([
      { text: "Lessons from Luke", parent: "title" },
      { text: "Teacher's Guide", parent: "subject" },
    ]);
  });

  test("reports text nodes that are direct children of the footer paragraph", () => {
    const visited = visitedNodes(stylesXmlWithFooter(`Page <text:span>Quarter</text:span>`));

    expect(visited).toEqual([
      { text: "Page ", parent: "p" },
      { text: "Quarter", parent: "span" },
    ]);
  });

  test("visits nothing when the document has no master-styles footers", () => {
    const doc = libxmljs2.parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:styles/></office:document-styles>`
    );
    const visited: Text[] = [];

    forEachFooterTextNode(doc, extractNamespaces(doc), (node) => {
      visited.push(node);
    });

    expect(visited).toEqual([]);
  });
});
