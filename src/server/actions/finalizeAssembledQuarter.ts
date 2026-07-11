import fs from "fs";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { mkdirSafe, unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces, Namespaces } from "../xml/mergeXml";
import { rezipWithMimetypeFirst } from "../xml/rezipWithMimetypeFirst";

/**
 * finalizeAssembledQuarter — post-merge patches that make the assembled
 * book's live footer fields resolve. `sofficeAssemble`'s macro merges the
 * constituents into a BLANK base Writer document, so the merged output
 * inherits the blank base's document-level state; two pieces of it must be
 * patched for the chapterized footers `prepareConstituentForAssembly`
 * produced (see that module's doc comment for the whole design):
 *
 * - **Outline numbering (required)**: the blank base's `text:outline-style`
 *   level-1 entry has an EMPTY `style:num-format`, against which every
 *   footer `<text:chapter text:display="number">` field renders BLANK.
 *   Patch it to `style:num-format="1"` / `loext:num-list-format="%1%"` and
 *   set `text:start-value` to the quarter's first absolute lesson number
 *   ((series-1)*13+1, e.g. 14 for series 2) — matching the client's own
 *   quarter masters, whose headings then auto-increment with no
 *   per-heading start values.
 * - **Metadata (SOP §16.2)**: write the `Quarter` custom property (= the
 *   series) and `dc:title`/`dc:subject` (from the first constituent, the
 *   TOC) into `meta.xml`, so the footers' live
 *   `text:user-defined[Quarter]`/`text:title`/`text:subject` fields — one
 *   shared value per book — resolve on open/render, and the client's
 *   quarter styles template drops in cleanly.
 *
 * Re-zips with the `mimetype` entry stored FIRST and UNCOMPRESSED (ODF
 * requirement). Mutates `odtPath` (the merge output inside the per-job
 * working dir) IN PLACE.
 */
export interface FinalizeAssembledQuarterOptions {
  /** Path to the assembled `.odt` (the `sofficeAssemble` output) to patch IN PLACE. */
  odtPath: string;
  /** The quarter's series number — becomes the `Quarter` custom property. */
  series: number;
  /** The quarter's first absolute lesson number ((series-1)*13+1) — the outline level-1 start value. */
  firstLessonNumber: number;
  /** Book title for `dc:title` (from the first constituent's own meta). Empty = leave untouched. */
  title: string;
  /** Book subject for `dc:subject` (from the first constituent's own meta). Empty = leave untouched. */
  subject: string;
}

/**
 * Patch the assembled book's outline numbering and book-level metadata and
 * re-pack it with the ODF-safe mimetype ordering. See the module doc
 * comment for the full contract.
 */
export function finalizeAssembledQuarter(options: FinalizeAssembledQuarterOptions): void {
  const { odtPath, series, firstLessonNumber, title, subject } = options;
  const extractDirPath = `${odtPath}_finalize`;

  try {
    mkdirSafe(extractDirPath);
    unzip(odtPath, extractDirPath);

    const stylesXmlPath = `${extractDirPath}/styles.xml`;
    const stylesDoc = libxmljs2.parseXml(fs.readFileSync(stylesXmlPath, "utf8"));
    patchOutlineNumbering(stylesDoc, extractNamespaces(stylesDoc), firstLessonNumber);
    fs.writeFileSync(stylesXmlPath, stylesDoc.toString(false));

    const metaXmlPath = `${extractDirPath}/meta.xml`;
    const metaDoc = libxmljs2.parseXml(fs.readFileSync(metaXmlPath, "utf8"));
    patchBookMetadata(metaDoc, extractNamespaces(metaDoc), { series, title, subject });
    fs.writeFileSync(metaXmlPath, metaDoc.toString(false));

    rezipWithMimetypeFirst(extractDirPath, odtPath);
  } finally {
    unlinkRecursive(extractDirPath);
  }
}

/** Sets num-format/num-list-format/start-value on the level-1 outline style ONLY. */
function patchOutlineNumbering(
  stylesDoc: XmlDocument,
  namespaces: Namespaces,
  firstLessonNumber: number
): void {
  const level1 = stylesDoc.get<Element>(
    "//text:outline-style/text:outline-level-style[@text:level='1']",
    namespaces
  );
  if (!level1) {
    throw new Error("assembled document has no level-1 outline style to patch");
  }
  level1.attr({
    "style:num-format": "1",
    "loext:num-list-format": "%1%",
    "text:start-value": String(firstLessonNumber),
  });
}

/**
 * Upserts the `Quarter` custom property and `dc:title`/`dc:subject` (the
 * stale merged values are removed first so exactly one of each remains).
 * An empty title/subject is skipped, never written as a blank element.
 */
function patchBookMetadata(
  metaDoc: XmlDocument,
  namespaces: Namespaces,
  values: { series: number; title: string; subject: string }
): void {
  const officeMeta = metaDoc.get<Element>("//office:meta", namespaces);
  if (!officeMeta) {
    throw new Error("assembled document meta.xml has no office:meta element");
  }

  const upsert = (
    xpath: string,
    nsHref: string,
    elementName: string,
    text: string,
    attrs?: Record<string, string>
  ): void => {
    metaDoc.find<Element>(xpath, namespaces).forEach((el) => el.remove());
    const element = new Element(metaDoc, elementName);
    officeMeta.addChild(element);
    const ns = metaDoc
      .root()!
      .namespaces()
      .find((candidate) => candidate.href() === nsHref);
    if (ns) element.namespace(ns);
    if (attrs) element.attr(attrs);
    element.text(text);
  };

  upsert(
    "//meta:user-defined[@meta:name='Quarter']",
    "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "user-defined",
    String(values.series),
    { "meta:name": "Quarter", "meta:value-type": "float" }
  );
  if (values.title) {
    upsert("//dc:title", "http://purl.org/dc/elements/1.1/", "title", values.title);
  }
  if (values.subject) {
    upsert("//dc:subject", "http://purl.org/dc/elements/1.1/", "subject", values.subject);
  }
}
