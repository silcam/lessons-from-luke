import libxmljs2, { Element } from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import { splitUnsplitReferences } from "./referenceSplitter";

/**
 * RED (US3): unit tests for the pre-parse content.xml splitter (Mechanism 2,
 * spec.md FR-006..FR-009; research.md Decision 3).
 *
 * `splitUnsplitReferences` is a pure string->string transform over a
 * content.xml document: it finds paragraphs, under the four reference-bearing
 * styles, whose reference is still stored as a single unsplit text run
 * (`<book words> <chapter:verse range>`) and splits it into a book-name run +
 * `<text:s/>` + a numeric run — matching the structure the parser already
 * emits for the majority of references (see the real corpus example:
 * `<text:p ...>Luke <text:s/>1:5–25</text:p>`).
 *
 * The module does not exist yet — this file is expected to fail to even
 * compile/import (RED) until src/server/xml/referenceSplitter.ts is created.
 */

// The four reference-bearing paragraph styles named in spec.md's
// "Reference-bearing style" key entity (011-verse-reference-auto-population).
const REFERENCE_BEARING_STYLES = [
  "M.T._20_Text_20_-_20_Lesson_20_Title_20_Scrip_20_Reference",
  "Sub-Head_20_1",
  "M.T._20_Table_20_of_20_Contents",
  "Lesson_20_Title_20_Scrip_20_Reference",
];

const P_XPATH = "//text:p[1]";

function wrapContent(paragraphXml: string): string {
  return `<?xml version="1.0"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:body>
    <office:text>
      ${paragraphXml}
    </office:text>
  </office:body>
</office:document-content>`;
}

function unsplitParagraph(styleName: string, text: string): string {
  return `<text:p text:style-name="${styleName}">${text}</text:p>`;
}

function getFirstParagraph(xml: string): Element {
  const xmlDoc = libxmljs2.parseXml(xml);
  const ns = extractNamespaces(xmlDoc);
  return xmlDoc.get<Element>(P_XPATH, ns)!;
}

describe("splitUnsplitReferences (US3, FR-006..FR-009)", () => {
  describe.each(REFERENCE_BEARING_STYLES)(
    "a single unsplit reference under style %s",
    (styleName) => {
      it("splits into a book-name run, <text:s/>, and a numeric run", () => {
        const contentXml = wrapContent(unsplitParagraph(styleName, "Luke 1:26–38"));

        const result = splitUnsplitReferences(contentXml);
        const resultP = getFirstParagraph(result);

        const childNodes = resultP.childNodes() as Element[];
        // Exactly one <text:s/> element run separating the book name from
        // the numeric part.
        const sRuns = childNodes.filter((n) => n.name && n.name() === "s");
        expect(sRuns).toHaveLength(1);

        // Text content is unchanged when whitespace-normalized (rendering
        // preserved, FR-008): the same visible characters, just split into
        // runs around a single space now expressed as <text:s/>.
        expect(resultP.text().replace(/\s+/g, " ").trim()).toBe("Luke 1:26–38");

        // The book-name run is "Luke" and the numeric run is the
        // chapter:verse range.
        const textNodes = childNodes.filter((n) => n.type() === "text");
        expect(textNodes[0].text().trim()).toBe("Luke");
        expect(textNodes[textNodes.length - 1].text().trim()).toBe("1:26–38");
      });
    }
  );

  it("splits the spaced-dash variant, with the numeric run matching the chapter:verse range shape", () => {
    const contentXml = wrapContent(unsplitParagraph(REFERENCE_BEARING_STYLES[0], "Luke 1:26 – 38"));

    const result = splitUnsplitReferences(contentXml);
    const resultP = getFirstParagraph(result);

    const sRuns = (resultP.childNodes() as Element[]).filter((n) => n.name && n.name() === "s");
    expect(sRuns).toHaveLength(1);

    const textNodes = (resultP.childNodes() as Element[]).filter((n) => n.type() === "text");
    expect(textNodes[0].text().trim()).toBe("Luke");

    // Whatever the exact boundary rule trims, the numeric run's raw text
    // must match the chapter:verse range shape (hyphen or en-dash, optional
    // surrounding whitespace around the separator).
    const numericRunText = textNodes[textNodes.length - 1].text().trim();
    expect(numericRunText).toMatch(/^\d+:\d+\s*[-–]\s*\d+$/);
  });

  it("splits a numbered book, keeping the leading book number with the book-name run (FR-007)", () => {
    const contentXml = wrapContent(
      unsplitParagraph(REFERENCE_BEARING_STYLES[0], "1 Corinthians 2:1–5")
    );

    const result = splitUnsplitReferences(contentXml);
    const resultP = getFirstParagraph(result);

    const sRuns = (resultP.childNodes() as Element[]).filter((n) => n.name && n.name() === "s");
    expect(sRuns).toHaveLength(1);

    const textNodes = (resultP.childNodes() as Element[]).filter((n) => n.type() === "text");
    expect(textNodes[0].text().trim()).toBe("1 Corinthians");
    expect(textNodes[textNodes.length - 1].text().trim()).toBe("2:1–5");
  });

  it("is idempotent: an already-split paragraph is left byte-identical (no-op)", () => {
    const alreadySplit = `<text:p text:style-name="${REFERENCE_BEARING_STYLES[0]}">Luke <text:s/>1:5–25</text:p>`;
    const contentXml = wrapContent(alreadySplit);

    const canonicalBefore = getFirstParagraph(contentXml).toString();
    const result = splitUnsplitReferences(contentXml);
    const canonicalAfter = getFirstParagraph(result).toString();

    expect(canonicalAfter).toBe(canonicalBefore);
  });

  it("leaves a reference split across more than 2 runs completely unchanged (out-of-scope, safe degrade)", () => {
    // Bold book run + separate space run + separate numeric run with
    // different formatting metadata: 3 sibling runs, not the simple
    // book-run + <text:s/> + numeric-run shape the splitter targets.
    const multiRunParagraph = `<text:p text:style-name="${REFERENCE_BEARING_STYLES[0]}"><text:span text:style-name="Bold">Luke</text:span><text:s/><text:span text:style-name="Italic">1:26–38</text:span></text:p>`;
    const contentXml = wrapContent(multiRunParagraph);

    const canonicalBefore = getFirstParagraph(contentXml).toString();
    const result = splitUnsplitReferences(contentXml);
    const canonicalAfter = getFirstParagraph(result).toString();

    expect(canonicalAfter).toBe(canonicalBefore);
  });
});
