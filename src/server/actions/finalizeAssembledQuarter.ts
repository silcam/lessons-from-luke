import fs from "fs";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { mkdirSafe, unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces, Namespaces } from "../xml/mergeXml";
import {
  assertRestyleTargetsDefined,
  restyleMonolingualParagraphs,
} from "../xml/monolingualRestyle";
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
 * - **Leading blank page (content.xml)**: strip empty leading paragraph(s)
 *   from the start of `office:text` — the Luke book-1 (Q1) TOC constituent
 *   opens with an EMPTY paragraph pinned to a `page-usage="left"` (verso)
 *   master, which as the document's first element makes LibreOffice insert
 *   a blank recto filler page (see `removeLeadingBlankParagraphs`).
 * - **Front-matter anchor (content.xml, FR-016)**: sets an explicit
 *   `style:page-number="1"` on `office:text`'s own first body element's
 *   automatic style — settled EMPIRICALLY (017 US1-T5's Gate 7 test): with
 *   no explicit anchor the front matter's own roman-numeral sequence does
 *   not resolve absolutely either (see `applyFrontMatterAnchor`).
 * - **Body restart (content.xml, FR-005/INV-3)**: sets an explicit
 *   `style:page-number="1"` on the FIRST visible level-1 opening's automatic
 *   style — the merge otherwise carries no absolute page-number anchor, so
 *   the book renders continuing whatever page count the merge's blank base
 *   happened to accumulate (see `applyBodyRestart`). Runs BEFORE lesson-
 *   opening master-page normalization (below) — see that call site's
 *   comment for why the order matters.
 * - **Lesson-opening master pages (content.xml)**: pin every visible
 *   level-1 heading's automatic style to the `First_20_Page` master when it
 *   carries none — the production Luke-1-09 constituent opens with only
 *   `fo:break-before="page"`, which makes the whole lesson inherit the
 *   previous page's master and its margins (see
 *   `normalizeLessonOpeningMasterPages`).
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
  /**
   * True when the book was styled from the MONOLINGUAL template: also
   * restyles M.T. paragraph-style references to their plain equivalents
   * (see `monolingualRestyle`). Defaults to false — bilingual output is
   * byte-for-byte untouched by the restyle.
   */
  singleLanguage?: boolean;
}

/**
 * Patch the assembled book's outline numbering and book-level metadata and
 * re-pack it with the ODF-safe mimetype ordering. See the module doc
 * comment for the full contract.
 */
export function finalizeAssembledQuarter(options: FinalizeAssembledQuarterOptions): void {
  const { odtPath, series, firstLessonNumber, title, subject, singleLanguage = false } = options;
  const extractDirPath = `${odtPath}_finalize`;

  try {
    mkdirSafe(extractDirPath);
    unzip(odtPath, extractDirPath);

    const contentXmlPath = `${extractDirPath}/content.xml`;
    const contentDoc = libxmljs2.parseXml(fs.readFileSync(contentXmlPath, "utf8"));
    const contentNamespaces = extractNamespaces(contentDoc);
    removeLeadingBlankParagraphs(contentDoc, contentNamespaces);
    if (singleLanguage) {
      restyleMonolingualParagraphs(contentDoc, contentNamespaces);
    }
    // Front-matter anchor runs first — office:text's own first body element
    // (see `applyFrontMatterAnchor`'s doc comment) is always earlier in
    // document order than the first lesson opening `applyBodyRestart`
    // targets, and the two never share an automatic style, so the ordering
    // between them is purely for readability (one front-to-back sweep).
    applyFrontMatterAnchor(contentDoc, contentNamespaces);
    // Body restart runs BEFORE lesson-opening master-page normalization,
    // deliberately: it isolates the FIRST visible opening's automatic style
    // under its own deterministic name (see `applyBodyRestart`'s doc
    // comment), and normalization's own "already pinned" skip then leaves
    // that isolated style alone — so the restart's clone is never re-cloned
    // under normalization's separate `_QA` naming scheme.
    applyBodyRestart(contentDoc, contentNamespaces);
    normalizeLessonOpeningMasterPages(contentDoc, contentNamespaces);
    fs.writeFileSync(contentXmlPath, contentDoc.toString(false));

    const stylesXmlPath = `${extractDirPath}/styles.xml`;
    const stylesDoc = libxmljs2.parseXml(fs.readFileSync(stylesXmlPath, "utf8"));
    const stylesNamespaces = extractNamespaces(stylesDoc);
    patchOutlineNumbering(stylesDoc, stylesNamespaces, firstLessonNumber);
    if (singleLanguage) {
      assertRestyleTargetsDefined(stylesDoc, stylesNamespaces);
      restyleMonolingualParagraphs(stylesDoc, stylesNamespaces);
    }
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

/**
 * Local names of ODF elements that may legitimately precede body content
 * inside `office:text` (declarations, change-tracking, forms). These are
 * skipped — never removed — while scanning for the document's first real
 * paragraph.
 */
const OFFICE_TEXT_DECLARATIONS = new Set([
  "tracked-changes",
  "variable-decls",
  "sequence-decls",
  "user-field-decls",
  "dde-connection-decls",
  "alphabetical-index-auto-mark-file",
  "forms",
]);

/**
 * Removes empty leading paragraph(s) from the start of `office:text`.
 *
 * The Luke book-1 (Q1) TOC constituent begins with an EMPTY `<text:p>`
 * pinned — via its `Inside_20_cover` master page — to a
 * `style:page-usage="left"` (verso) page layout. As the assembled
 * document's very first element, that empty paragraph makes LibreOffice
 * insert a blank recto filler page so the verso content lands on a left
 * page: an unwanted blank page 1. Other quarters' TOC masters open
 * directly on a content paragraph and are unaffected. Deleting the leading
 * empty paragraph makes the cover page 1 with no filler (verified via a
 * soffice round-trip on the real Q1 output: 100 → 99 pages, cover on page 1).
 *
 * Only *empty* leading `<text:p>` are removed, and only up to the first
 * body-content element (a non-empty paragraph, heading, table, list, …);
 * a non-empty first paragraph — e.g. every other quarter's cover — stops
 * the scan and is left untouched.
 */
function removeLeadingBlankParagraphs(contentDoc: XmlDocument, namespaces: Namespaces): void {
  const officeText = contentDoc.get<Element>("//office:body/office:text", namespaces);
  if (!officeText) return;

  for (const child of officeText.childNodes()) {
    if (child.type() !== "element") continue;
    const element = child as Element;
    const name = element.name();
    if (OFFICE_TEXT_DECLARATIONS.has(name)) continue;
    // First body-content element: strip it only when it's an empty
    // paragraph, then re-examine the next; stop at the first non-empty or
    // non-paragraph block so real content is never touched.
    if (name === "p" && element.text().trim() === "") {
      element.remove();
      continue;
    }
    break;
  }
}

/** The master page every lesson opens on in the client's quarter masters. */
const FIRST_PAGE_MASTER_NAME = "First_20_Page";

/**
 * Pins every lesson-opening heading's automatic style to the
 * `First_20_Page` master when it carries no `style:master-page-name`.
 *
 * Under the assembly pipeline's exactly-one-participant contract, every
 * visible level-1 `text:h` in the merged document is a lesson opening, and
 * the canonical opening shape drives pagination purely through
 * `style:master-page-name="First_20_Page"` on the heading's content.xml
 * automatic style. The production Luke-1-09 constituent instead ships only
 * `fo:break-before="page"` — the lesson still breaks onto a new page but
 * inherits the PREVIOUS page's master (Coloring Page margins) for its whole
 * run. Deliberately not gated on `fo:break-before`, so a variant lacking
 * both attributes is normalized too.
 *
 * Skipped: the injected hidden heading (auto style with
 * `text:display="none"`), level-2+ headings, headings on common NAMED
 * styles (patching those would restyle every user of the style), and auto
 * styles that already carry any master (existing values are trusted). An
 * auto style shared with non-heading content is never patched in place —
 * it is cloned under a fresh name, the clone patched, and only the
 * heading(s) repointed.
 */
function normalizeLessonOpeningMasterPages(contentDoc: XmlDocument, namespaces: Namespaces): void {
  const isOpeningHeading = (el: Element): boolean => {
    if (el.name() !== "h") return false;
    const level = el.attr("outline-level");
    return !level || level.value() === "1";
  };

  for (const heading of contentDoc.find<Element>("//office:body//text:h", namespaces)) {
    if (!isOpeningHeading(heading)) continue;
    const styleName = heading.attr("style-name")?.value();
    if (!styleName) continue;
    const autoStyle = contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${styleName}']`,
      namespaces
    );
    if (!autoStyle) continue; // common named style — out of the defect class
    const display = autoStyle
      .get<Element>("style:text-properties", namespaces)
      ?.attr("display")
      ?.value();
    if (display === "none") continue; // the injected hidden heading
    if (autoStyle.attr("master-page-name")) continue; // already pinned

    const referencers = contentDoc.find<Element>(
      `//*[@text:style-name='${styleName}']`,
      namespaces
    );
    if (referencers.every(isOpeningHeading)) {
      autoStyle.attr({ "style:master-page-name": FIRST_PAGE_MASTER_NAME });
      continue;
    }
    // Shared with non-heading content: patch a clone, repoint only headings.
    let cloneName = styleName;
    do {
      cloneName = `${cloneName}_QA`;
    } while (
      contentDoc.get<Element>(
        `//office:automatic-styles/style:style[@style:name='${cloneName}']`,
        namespaces
      )
    );
    const clone = autoStyle.clone() as Element;
    autoStyle.addNextSibling(clone);
    clone.attr({
      "style:name": cloneName,
      "style:master-page-name": FIRST_PAGE_MASTER_NAME,
    });
    referencers.filter(isOpeningHeading).forEach((el) => el.attr({ "text:style-name": cloneName }));
  }
}

/** Deterministic suffix appended to a style name to name its restart clone. */
const RESTART_CLONE_SUFFIX = "_Restart";

/** True for a visible (non-outline-level-2+) level-1 heading. */
function isOpeningHeadingElement(el: Element): boolean {
  if (el.name() !== "h") return false;
  const level = el.attr("outline-level");
  return !level || level.value() === "1";
}

/** Looks up a content.xml automatic style by name, or `undefined` if it is a common named style. */
function findAutomaticStyle(
  contentDoc: XmlDocument,
  namespaces: Namespaces,
  styleName: string
): Element | undefined {
  return (
    contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${styleName}']`,
      namespaces
    ) ?? undefined
  );
}

/** True when the auto style is the injected hidden heading's style (`text:display="none"`). */
function isHiddenAutoStyle(autoStyle: Element, namespaces: Namespaces): boolean {
  return (
    autoStyle.get<Element>("style:text-properties", namespaces)?.attr("display")?.value() === "none"
  );
}

/**
 * Restarts absolute page numbering at the FIRST visible level-1 opening
 * (017 US1-T3/T4, FR-005, INV-3, contract §2.2/§2.5): sets
 * `style:page-number="1"` on its automatic style's
 * `style:paragraph-properties`, alongside `style:master-page-name`. Unlike
 * `normalizeLessonOpeningMasterPages`, this pass does not trust — and is not
 * gated by — an auto style that already carries a master or a heading that
 * shares its auto style with other content: the restart's target style must
 * be exclusively referenced by the first opening, cloning-and-repointing
 * where it is not, REGARDLESS of any existing `style:master-page-name`.
 *
 * The clone name is a deterministic function of the original style name
 * (`<name>_Restart`), never a probed suffix, so repeat finalize passes over
 * an already-restarted document detect and reuse the existing clone instead
 * of minting a new one — required for the mixed-mode fixed point later
 * tasks depend on.
 *
 * A no-op (never a throw) when the document has no level-1 heading at all —
 * a merged book always has at least one lesson opening in production, and
 * treating "no heading anywhere" as a hard failure would wrongly reject
 * fixtures/constituents exercising unrelated finalize behavior. Throws the
 * curated, path-free "assembly failed to finalize the merged book" reason
 * (matching `assembleQuarter`'s own wrapping) ONLY when a visible level-1
 * heading exists but rides a common NAMED style with no automatic style to
 * isolate.
 */
function applyBodyRestart(contentDoc: XmlDocument, namespaces: Namespaces): void {
  let target: Element | undefined;
  for (const heading of contentDoc.find<Element>("//office:body//text:h", namespaces)) {
    if (!isOpeningHeadingElement(heading)) continue;
    const styleName = heading.attr("style-name")?.value();
    if (!styleName) continue;
    const autoStyle = findAutomaticStyle(contentDoc, namespaces, styleName);
    if (autoStyle && isHiddenAutoStyle(autoStyle, namespaces)) continue; // injected hidden heading
    target = heading;
    break;
  }
  if (!target) return; // no visible level-1 heading in this document — nothing to restart

  isolatePageNumberRestart(contentDoc, namespaces, target, { setMaster: true, required: true });
}

/**
 * Local names of ODF elements that may legitimately precede real body
 * content at the very start of `office:text` — the same declaration set
 * `removeLeadingBlankParagraphs` skips over — reused here so the
 * front-matter anchor targets the document's first true content element,
 * never a declaration.
 */
function firstBodyContentElement(
  officeText: Element,
  contentDoc: XmlDocument,
  namespaces: Namespaces
): Element | undefined {
  for (const child of officeText.childNodes()) {
    if (child.type() !== "element") continue;
    const element = child as Element;
    if (OFFICE_TEXT_DECLARATIONS.has(element.name())) continue;
    // Skip the injected hidden heading (auto style with text:display="none")
    // — the same discipline `applyBodyRestart` applies to its own visible-
    // opening scan, so a hidden heading merged in ahead of front matter's
    // own real content is never mistaken for it.
    const styleName = element.attr("style-name")?.value();
    const autoStyle = styleName ? findAutomaticStyle(contentDoc, namespaces, styleName) : undefined;
    if (autoStyle && isHiddenAutoStyle(autoStyle, namespaces)) continue;
    return element;
  }
  return undefined;
}

/**
 * Front-matter anchor (017 US1-T6, FR-016, contract §2.2): sets
 * `style:page-number="1"` on the automatic style of `office:text`'s own
 * first body element — settled EMPIRICALLY (this session's real render, see
 * US1-T5's Gate 7 test): with no explicit anchor, the front matter's own
 * second physical page does not print "ii" per FR-016's absolute check, so
 * the anchor is required, not redundant (F1's spike had deferred this as
 * NEEDS OPERATOR).
 *
 * Runs BEFORE `applyBodyRestart` under the SAME clone-and-repoint isolation
 * discipline (`isolatePageNumberRestart`) — front matter's own opening and
 * the first lesson opening are disjoint content, so the two passes never
 * touch the same automatic style, but running front matter first keeps both
 * restarts reading as one front-to-back sweep over `office:text`. Unlike
 * the body restart, this pass does NOT set `style:master-page-name` — front
 * matter keeps whatever master its own constituent already pins.
 *
 * A no-op (never a throw) when `office:text` has no body-content element at
 * all, or that element carries no style at all, or that style is a common
 * NAMED style with no automatic style to isolate (unlike `applyBodyRestart`,
 * this is NOT a hard failure here — a lesson's own visible opening is
 * production-guaranteed to carry an automatic style, but `office:text`'s
 * first body element carries no such guarantee across every fixture this
 * finalize path runs over, e.g. a single-lesson book with no front-matter/
 * TOC constituent, where that first element simply IS the lesson's own
 * opening and already gets its restart from `applyBodyRestart`) — matching
 * `applyBodyRestart`'s own defensive stance for fixtures unrelated to this
 * behavior otherwise.
 */
function applyFrontMatterAnchor(contentDoc: XmlDocument, namespaces: Namespaces): void {
  const officeText = contentDoc.get<Element>("//office:body/office:text", namespaces);
  if (!officeText) return;
  const target = firstBodyContentElement(officeText, contentDoc, namespaces);
  if (!target) return;
  if (!target.attr("style-name")) return; // no style to anchor — nothing to restart

  isolatePageNumberRestart(contentDoc, namespaces, target, { setMaster: false, required: false });
}

/**
 * Shared clone-and-repoint isolation core for both page-number restart
 * passes (`applyBodyRestart`, `applyFrontMatterAnchor`): looks up
 * `target`'s automatic style, isolates it (patching in place when already
 * exclusively referenced by `target`, cloning-and-repointing under the
 * deterministic `<name>_Restart` suffix otherwise — reused, never
 * re-minted, on repeat finalize passes), then sets
 * `style:page-number="1"` on the isolated style's
 * `style:paragraph-properties`, plus `style:master-page-name` when
 * `setMaster` is true.
 *
 * When `target` rides a common NAMED style with no automatic style to
 * isolate (patching a shared named style in place would restyle every user
 * of it): throws the curated, path-free "assembly failed to finalize the
 * merged book" reason (matching `assembleQuarter`'s own wrapping) when
 * `options.required` is true (`applyBodyRestart`'s own production
 * invariant); otherwise a silent no-op (`applyFrontMatterAnchor`'s softer
 * contract — see its own doc comment).
 */
function isolatePageNumberRestart(
  contentDoc: XmlDocument,
  namespaces: Namespaces,
  target: Element,
  options: { setMaster: boolean; required: boolean }
): void {
  const styleName = target.attr("style-name")!.value();
  const autoStyle = findAutomaticStyle(contentDoc, namespaces, styleName);
  if (!autoStyle) {
    if (options.required) {
      throw new Error("assembly failed to finalize the merged book");
    }
    return;
  }

  const referencers = contentDoc.find<Element>(`//*[@text:style-name='${styleName}']`, namespaces);
  let restartStyle: Element;
  if (referencers.length === 1) {
    // Already exclusively referenced by the target — patch in place.
    restartStyle = autoStyle;
  } else {
    const cloneName = `${styleName}${RESTART_CLONE_SUFFIX}`;
    restartStyle =
      findAutomaticStyle(contentDoc, namespaces, cloneName) ?? cloneAutoStyle(autoStyle, cloneName);
    target.attr({ "text:style-name": cloneName });
  }

  if (options.setMaster) {
    restartStyle.attr({ "style:master-page-name": FIRST_PAGE_MASTER_NAME });
  }
  const props =
    restartStyle.get<Element>("style:paragraph-properties", namespaces) ??
    addParagraphProperties(restartStyle);
  props.attr({ "style:page-number": "1" });
}

/** Clones an automatic style under a new name, inserted right after the original. */
function cloneAutoStyle(autoStyle: Element, cloneName: string): Element {
  const clone = autoStyle.clone() as Element;
  autoStyle.addNextSibling(clone);
  clone.attr({ "style:name": cloneName });
  return clone;
}

/** Adds an empty `style:paragraph-properties` child to an automatic style, correctly namespaced. */
function addParagraphProperties(autoStyle: Element): Element {
  const styleNs = autoStyle.namespace();
  const props = new Element(autoStyle.doc(), "paragraph-properties");
  autoStyle.addChild(props);
  if (styleNs) props.namespace(styleNs);
  return props;
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
