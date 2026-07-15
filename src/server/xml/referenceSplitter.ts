import fs from "fs";
import path from "path";
import libxmljs2, { Element, Text } from "libxmljs2";
import { extractNamespaces } from "./mergeXml";
import { xPathForPWithStyle, xPathForHWithStyle } from "./parse";
import { mkdirSafe, unzip, zip, unlinkRecursive } from "../../core/util/fsUtils";

// The four reference-bearing paragraph styles named in spec.md's
// "Reference-bearing style" key entity (011-verse-reference-auto-population):
// `M.T. Text - Lesson Title Scrip Reference`, `Sub-Head 1`,
// `M.T. Table of Contents`, and the source-language `Lesson Title Scrip
// Reference`. ODT XML encodes spaces in style names as the literal `_20_`
// token.
const REFERENCE_BEARING_STYLES = [
  "M.T._20_Text_20_-_20_Lesson_20_Title_20_Scrip_20_Reference",
  "Sub-Head_20_1",
  "M.T._20_Table_20_of_20_Contents",
  "Lesson_20_Title_20_Scrip_20_Reference",
];

// Matches an unsplit `<book words><space><chapter:verse range>` run, e.g.
// "Luke 1:26–38", "1 Corinthians 2:1–5", "Luke 1:26 – 38" (spaced-dash
// variant), or a chapter-spanning range like "18:35–19:10". Captures the
// book-name portion and the numeric portion separately, splitting at the
// whitespace immediately preceding the numeric token.
const UNSPLIT_REFERENCE_PATTERN = /^(.*\S)\s+(\d+:\d+(?:\s*[-–]\s*\d+(?::\d+)?)?)$/;

/**
 * Splits a single unsplit `<book words> <chapter:verse range>` text run
 * (under a reference-bearing style) into a book-name run + `<text:s/>` + a
 * numeric run, matching the structure the parser already emits for the
 * majority of references (spec.md FR-006..FR-009; research.md Decision 3).
 * Leaves already-split and out-of-scope (>2-run) paragraphs unchanged.
 */
export function splitUnsplitReferences(contentXml: string): string {
  const xmlDoc = libxmljs2.parseXml(contentXml);
  const namespaces = extractNamespaces(xmlDoc);

  const xPath = REFERENCE_BEARING_STYLES.map(
    (styleName) => `${xPathForPWithStyle(styleName)} | ${xPathForHWithStyle(styleName)}`
  ).join(" | ");

  const nodes = xmlDoc.root()!.find<Element>(xPath, namespaces);

  nodes.forEach((paragraph) => splitParagraphIfUnsplit(paragraph));

  return xmlDoc.toString(false);
}

function splitParagraphIfUnsplit(paragraph: Element): void {
  const children = paragraph.childNodes();
  // Only a single text run (no existing <text:s/> or other sibling runs) is
  // in scope; already-split and multi-run paragraphs are left untouched.
  if (children.length !== 1) return;

  const onlyChild = children[0];
  if (onlyChild.type() !== "text") return;

  const rawText = (onlyChild as Text).text();
  const match = rawText.trim().match(UNSPLIT_REFERENCE_PATTERN);
  if (!match) return;

  const [, bookName, numericRef] = match;
  const namespace = paragraph.namespace();
  const doc = paragraph.doc();

  onlyChild.remove();

  // Emit the book-name text run with no trailing space, then a single
  // `<text:s/>` marker run to represent the one separator space, so the
  // rendered gap matches the original unsplit run's single literal space
  // exactly (spec.md FR-008, SC-004) rather than doubling it.
  paragraph.addChild(new libxmljs2.Text(doc, bookName));
  const spaceRun = new libxmljs2.Element(doc, "s");
  if (namespace) spaceRun.namespace(namespace);
  paragraph.addChild(spaceRun);
  paragraph.addChild(new libxmljs2.Text(doc, numericRef));
}

/**
 * Re-processes a master `.odt` document: unzips it, runs
 * `splitUnsplitReferences` over its `content.xml`, and re-zips to
 * `outDocPath` atomically — via the existing `zip()` temp-file + rename
 * convention in `fsUtils` (see `mergeXml`'s use of the same helper) — so no
 * partially-written master is ever observable at `outDocPath`, even if the
 * rename step is interrupted (spec.md FR-009; plan.md Decision 3).
 */
export function splitReferencesInDocument(inDocPath: string, outDocPath: string): void {
  if (!fs.existsSync(inDocPath)) throw { status: 404 };

  // Extract beside the input document (mergeXml's `_odt` sibling-dir
  // convention) rather than under os.tmpdir(): zip() finishes with
  // fs.renameSync into outDocPath, and a tmpdir on a different filesystem
  // (e.g. the CI container's /tmp vs the workspace mount) makes that rename
  // fail with EXDEV.
  const extractDirPath = `${inDocPath}_${new Date().valueOf()}_referenceSplitter`;

  try {
    mkdirSafe(extractDirPath);
    unzip(inDocPath, extractDirPath);

    const contentXmlPath = path.join(extractDirPath, "content.xml");
    const contentXml = fs.readFileSync(contentXmlPath).toString();
    const splitContentXml = splitUnsplitReferences(contentXml);
    fs.writeFileSync(contentXmlPath, splitContentXml);

    zip(extractDirPath, outDocPath);
  } finally {
    unlinkRecursive(extractDirPath);
  }
}
