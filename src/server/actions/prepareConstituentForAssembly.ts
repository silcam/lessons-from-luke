import fs from "fs";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { mkdirSafe, unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces, Namespaces } from "../xml/mergeXml";
import { rezipWithMimetypeFirst } from "../xml/rezipWithMimetypeFirst";

/**
 * prepareConstituentForAssembly — make a quarter constituent's page styles
 * MERGE-SAFE without renaming them, so LibreOffice's
 * `insertDocumentFromURL` display-name dedupe collapses all 14 constituents'
 * master pages into ONE clean, template-compatible set (the fix for the
 * "Coloring Page 00".."13" duplicated-page-styles defect).
 *
 * Replaces BOTH `flattenFooterFields` (literal per-lesson footer values) and
 * `renameMasterPageStyles` (per-constituent name suffixing). Those two
 * modules together kept per-lesson footers correct by making every
 * constituent's page-style set DISTINCT — which is exactly what multiplied
 * every page style 14x in the assembled book and broke applying the client's
 * quarter styles template (template application maps styles BY NAME).
 *
 * This module instead makes every constituent's page-style set IDENTICAL and
 * resolves per-lesson footer values POSITIONALLY, the way the client's own
 * hand-assembled quarter masters do
 * (`test/docs/references/English_Luke-Q2-Master-bilingual.odt`):
 *
 * **styles.xml (all 14 constituents):**
 * - Every footer `<text:user-defined text:name="Lesson">` field becomes a
 *   live `<text:chapter text:display="number" text:outline-level="1">`
 *   field. Chapter fields resolve per PAGE from the most recent level-1
 *   outline heading, so one shared footer definition serves all 13 lessons.
 *   The cached field text (what shows before a field refresh) is the
 *   meta.xml `Lesson` value, falling back to the domain lesson number —
 *   except for the TOC, whose cache stays empty so its sentinel lesson
 *   number (99) can never surface in a rendered footer.
 * - The `<text:user-defined text:name="Quarter">` field stays LIVE (one
 *   quarter per book — `finalizeAssembledQuarter` writes the merged
 *   `meta.xml` `Quarter` property it resolves against, SOP §16.2); only its
 *   cached text is normalized. `<text:title>`/`<text:subject>` fields also
 *   stay live, resolving against the merged doc's `dc:title`/`dc:subject`
 *   (also written by `finalizeAssembledQuarter`) — matching the reference,
 *   whose front-matter footers show the book-level "Teacher's Guide"
 *   subject, not a per-lesson value.
 * - NO master-page/page-layout renaming. All 14 sets become identical
 *   except cached field text, which is harmless: the merge dedupes by
 *   display name, first definition wins, regardless of content.
 *
 * **content.xml (lessons only, never the TOC):**
 * - Chapter fields need exactly one level-1 outline heading per lesson.
 *   Newer masters already carry one (a hidden heading paragraph). Legacy
 *   masters (e.g. `Luke-1-01v03.odt`) have none — for those, inject a
 *   hidden heading (self-contained automatic style,
 *   `text:display="none"`, zero-height, NO `style:master-page-name` and no
 *   break so it cannot add a page) right after `text:sequence-decls`,
 *   carrying the lesson title from `meta.xml` `dc:subject` (fallback: the
 *   domain lesson name). Required for the correctness of SUBSEQUENT lessons
 *   too — a missing heading would shift every later lesson's footer number.
 * - Validate exactly one EFFECTIVE outline participant per lesson (zero for
 *   the TOC) after the pass. "Effective" counts only LEVEL-1 participants:
 *   `text:h` elements whose effective outline level is 1 (their
 *   `text:outline-level` attribute, else their style chain's
 *   `style:default-outline-level`, else 1 — the ODF default for a bare
 *   heading) AND `text:p` elements whose paragraph-style chain inherits
 *   `style:default-outline-level="1"` — LibreOffice counts both toward
 *   chapter numbering (verified empirically: a stray outline-level-1
 *   paragraph shifted every later lesson's footer off by one). Level-2+
 *   subheadings (e.g. Acts lessons' "Homework"/"Prayer" `text:h
 *   text:outline-level="2"` elements) never affect a level-1 chapter field
 *   and are benign — they must NOT count.
 *
 * **content.xml (memory-verse coloring-page paragraphs, all constituents):**
 * - Each coloring page carries two memory-verse paragraphs, asymmetric in how
 *   they reach their style: the first names the memory-verse style directly
 *   (`text:style-name` on the `text:p`); the second reaches it indirectly
 *   through a content.xml automatic style (e.g. `P5`, `P27`) whose
 *   `style:parent-style-name` is the memory-verse style. Automatic-style
 *   names are only LOCALLY unique — they collide across constituents with
 *   incompatible meanings (`P5` means "memory verse" in one lesson,
 *   "coloring-page graphic anchor" in another), and a first-definition-wins
 *   merge dedupe can make the second copy silently inherit the wrong
 *   constituent's formatting (017 US2, FR-011..FR-014; spike FINDINGS.md
 *   Gate 1's "modified direction (a)"). Fixed here by flattening: every
 *   `text:p` whose `text:style-name` is a content.xml automatic paragraph
 *   style parenting a `styles.xml`-defined *memory-verse* named style
 *   (either style-naming family — plain or `M.T.`-prefixed) is rewritten to
 *   name that memory-verse style DIRECTLY, matching how the first copy
 *   already does. Neither paragraph is removed or deduplicated (FR-014).
 *
 * **content.xml (sacrificial terminal paragraph, all constituents — 018):**
 * - `insertDocumentFromURL` MUTATES the last body paragraph of every
 *   document it inserts: that paragraph loses its own named style and takes
 *   the PRECEDING paragraph's. Pinned empirically — it reproduces on a lone
 *   constituent inserted into the blank base with nothing following it, so
 *   the assembly macro's boundary page break is not implicated, and no
 *   change to the macro can avoid it. In the real masters the last body
 *   paragraph is the second coloring-page memory verse and its predecessor
 *   is the empty graphic-number spacer, so the verse renders centered, bold
 *   and italic instead of in its highlighted memory-verse column.
 * - Defused by appending a THROWAWAY paragraph as the last child of
 *   `office:text`, for the merge to victimize instead of the verse. It
 *   carries fixed marker TEXT ({@link QUARTER_ASSEMBLY_SACRIFICIAL_MARKER})
 *   and a self-contained hidden automatic style — spike-verified that an
 *   EMPTY sacrificial paragraph is not merely restyled but has its style
 *   annihilated, leaving a visible highlighted band. The merge destroys the
 *   hidden style either way, so the paragraph cannot be relied on to STAY
 *   hidden; `finalizeAssembledQuarter` strips it from the merged book by its
 *   marker text (never by style, which post-merge is arbitrary).
 *
 * Re-zips with the `mimetype` entry stored FIRST and UNCOMPRESSED (ODF
 * requirement). Mutates `odtPath` IN PLACE — the CALLER must pass a
 * disposable COPY, never the canonical source ODT (see `assembleQuarter`'s
 * copy-before-transform contract).
 */
export interface PrepareConstituentForAssemblyOptions {
  /** Path to the ODT to rewrite IN PLACE. MUST be a disposable copy. */
  odtPath: string;
  /** Fallback quarter value when the ODT's own `Quarter` custom property is absent/empty. */
  series: number;
  /** Fallback lesson number for the chapter field's cached text (ignored for the TOC). */
  lesson: number;
  /** TOC constituent: no heading injection, zero-participant validation, empty cached chapter text. */
  isTOC: boolean;
  /** Fallback injected-heading title when `meta.xml` has no `dc:subject`. */
  fallbackTitle: string;
}

/** The constituent's own decoded `dc:title`/`dc:subject`, for `finalizeAssembledQuarter`'s metadata patch. */
export interface ConstituentMeta {
  title: string;
  subject: string;
}

const STYLE_NS = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";

/** The injected hidden heading's automatic-style name (collision-checked against real masters' `P<n>`/`M.T. *` names). */
const INJECTED_HEADING_STYLE = "QuarterAssemblyHiddenHeading";

/**
 * The sacrificial terminal paragraph's marker TEXT — the ONLY handle
 * `finalizeAssembledQuarter` has for stripping these paragraphs back out of
 * the merged book, because the merge annihilates their automatic style (see
 * the module doc comment's 018 section). Must never appear in real content.
 */
export const QUARTER_ASSEMBLY_SACRIFICIAL_MARKER = "QuarterAssemblySacrificialTail";

/** The sacrificial terminal paragraph's automatic-style name (same literal as the marker text — one name to grep for). */
const SACRIFICIAL_TAIL_STYLE = "QuarterAssemblySacrificialTail";

/**
 * Chapterize `odtPath`'s footer Lesson fields, ensure its level-1 outline
 * heading (lessons only), validate its effective outline participants, and
 * re-pack with the ODF-safe mimetype ordering. See the module doc comment
 * for the full contract.
 *
 * @returns the constituent's own decoded `dc:title`/`dc:subject`.
 */
export function prepareConstituentForAssembly(
  options: PrepareConstituentForAssemblyOptions
): ConstituentMeta {
  const { odtPath, series, lesson, isTOC, fallbackTitle } = options;
  const extractDirPath = `${odtPath}_prepare`;

  try {
    mkdirSafe(extractDirPath);
    unzip(odtPath, extractDirPath);

    const meta = readMeta(`${extractDirPath}/meta.xml`);
    const cachedLessonText = meta.lesson ?? (isTOC ? "" : String(lesson));
    const cachedQuarterText = meta.quarter ?? String(series);

    const stylesXmlPath = `${extractDirPath}/styles.xml`;
    const stylesDoc = libxmljs2.parseXml(fs.readFileSync(stylesXmlPath, "utf8"));
    const stylesNamespaces = extractNamespaces(stylesDoc);
    chapterizeLessonFields(stylesDoc, stylesNamespaces, cachedLessonText);
    normalizeQuarterFieldCache(stylesDoc, stylesNamespaces, cachedQuarterText);
    fs.writeFileSync(stylesXmlPath, stylesDoc.toString(false));

    const contentXmlPath = `${extractDirPath}/content.xml`;
    const contentDoc = libxmljs2.parseXml(fs.readFileSync(contentXmlPath, "utf8"));
    const contentNamespaces = extractNamespaces(contentDoc);
    flattenMemoryVerseAutomaticStyles(contentDoc, stylesDoc, contentNamespaces);
    if (isTOC) relaxTocTableRowBreaks(contentDoc, contentNamespaces);
    // Appended BEFORE the outline-participant count below, deliberately: the
    // sacrificial paragraph must be inside everything the validation sees, so
    // a future shape that did participate in the outline would fail loudly
    // here rather than silently shift every later lesson's footer number.
    appendSacrificialTerminalParagraph(contentDoc, contentNamespaces);
    if (!isTOC && countOutlineParticipants(contentDoc, stylesDoc, contentNamespaces) === 0) {
      injectHiddenHeading(contentDoc, contentNamespaces, meta.subject ?? fallbackTitle);
    }
    const participants = countOutlineParticipants(contentDoc, stylesDoc, contentNamespaces);
    const expected = isTOC ? 0 : 1;
    if (participants !== expected) {
      throw new Error(
        `constituent has ${participants} effective outline participants, expected ${expected}`
      );
    }
    fs.writeFileSync(contentXmlPath, contentDoc.toString(false));

    rezipWithMimetypeFirst(extractDirPath, odtPath);

    return { title: meta.title ?? "", subject: meta.subject ?? "" };
  } finally {
    unlinkRecursive(extractDirPath);
  }
}

interface ParsedMeta {
  quarter?: string;
  lesson?: string;
  title?: string;
  subject?: string;
}

/**
 * Reads `meta.xml`'s Quarter/Lesson custom properties and
 * `dc:title`/`dc:subject`, decoding XML entities (LibreOffice-authored
 * `meta.xml` is well-formed; `dc:subject` routinely carries `&apos;`, which
 * would double-escape if re-inserted raw). Absent/empty values come back
 * `undefined` so callers apply their fallbacks.
 */
function readMeta(metaXmlPath: string): ParsedMeta {
  const metaDoc = libxmljs2.parseXml(fs.readFileSync(metaXmlPath, "utf8"));
  const namespaces = extractNamespaces(metaDoc);
  const value = (xpath: string): string | undefined => {
    const text = metaDoc.get<Element>(xpath, namespaces)?.text().trim();
    return text ? text : undefined;
  };
  return {
    quarter: value("//meta:user-defined[@meta:name='Quarter']"),
    lesson: value("//meta:user-defined[@meta:name='Lesson']"),
    title: value("//dc:title"),
    subject: value("//dc:subject"),
  };
}

/**
 * Replaces every `<text:user-defined text:name="Lesson">` field with a live
 * `<text:chapter text:display="number" text:outline-level="1">` field whose
 * cached text is `cachedText`.
 */
function chapterizeLessonFields(
  stylesDoc: XmlDocument,
  namespaces: Namespaces,
  cachedText: string
): void {
  const fields = stylesDoc.find<Element>("//text:user-defined[@text:name='Lesson']", namespaces);
  fields.forEach((field) => {
    const chapter = new Element(stylesDoc, "chapter");
    field.addPrevSibling(chapter);
    const textNs = field.namespace();
    if (textNs) chapter.namespace(textNs);
    chapter.attr({ "text:display": "number", "text:outline-level": "1" });
    chapter.text(cachedText);
    field.remove();
  });
}

/** Normalizes each live Quarter field's cached text (the field itself stays a field). */
function normalizeQuarterFieldCache(
  stylesDoc: XmlDocument,
  namespaces: Namespaces,
  cachedText: string
): void {
  const fields = stylesDoc.find<Element>("//text:user-defined[@text:name='Quarter']", namespaces);
  fields.forEach((field) => field.text(cachedText));
}

/**
 * Counts the document's EFFECTIVE level-1 outline participants: `text:h`
 * elements whose effective outline level is 1 (`text:outline-level`
 * attribute, else the style chain's `style:default-outline-level`, else 1 —
 * the ODF default for a bare heading) plus `text:p` elements whose
 * paragraph-style chain (content.xml automatic styles -> styles.xml common
 * styles) inherits `style:default-outline-level="1"`. LibreOffice counts
 * both toward chapter numbering; level-2+ headings never affect a level-1
 * chapter field and are excluded.
 */
function countOutlineParticipants(
  contentDoc: XmlDocument,
  stylesDoc: XmlDocument,
  namespaces: Namespaces
): number {
  const styleGraph = new Map<string, { parent?: string; outlineLevel?: string }>();
  [stylesDoc, contentDoc].forEach((doc) => {
    doc.find<Element>("//style:style", namespaces).forEach((style) => {
      const name = style.attr("name")?.value();
      if (!name) return;
      styleGraph.set(name, {
        parent: style.attr("parent-style-name")?.value() ?? undefined,
        outlineLevel: style.attr("default-outline-level")?.value() ?? undefined,
      });
    });
  });
  const effectiveOutlineLevel = (styleName: string): string | undefined => {
    const seen = new Set<string>();
    let current: string | undefined = styleName;
    while (current && !seen.has(current)) {
      seen.add(current);
      const entry = styleGraph.get(current);
      if (!entry) return undefined;
      if (entry.outlineLevel !== undefined) {
        return entry.outlineLevel === "" ? undefined : entry.outlineLevel;
      }
      current = entry.parent;
    }
    return undefined;
  };

  const headings = contentDoc.find<Element>("//office:body//text:h", namespaces).filter((h) => {
    const attrLevel = h.attr("outline-level")?.value();
    if (attrLevel !== undefined) return attrLevel === "1";
    const styleName = h.attr("style-name")?.value();
    const styleLevel = styleName ? effectiveOutlineLevel(styleName) : undefined;
    return styleLevel === undefined ? true : styleLevel === "1";
  }).length;

  const outlineParagraphs = contentDoc
    .find<Element>("//office:body//text:p[@text:style-name]", namespaces)
    .filter((p) => effectiveOutlineLevel(p.attr("style-name")!.value()) === "1").length;

  return headings + outlineParagraphs;
}

/**
 * 018 Q4 fix — TOC constituents only: make the TOC table splittable across
 * pages. The Acts TOC masters ship their TOC table's automatic table style
 * with `style:may-break-between-rows="false"` (Luke's omits it, so Luke
 * splits fine); once anything costs the front-matter body a little height —
 * e.g. the quarter styles template's footer geometry — the unsplittable
 * 13-row table no longer fits under the "Quarter N Table of Contents"
 * header and jumps WHOLE to the next page, leaving the header orphaned.
 *
 * Strictly scoped to the ONE table that follows the TOC header paragraph:
 * the first `table:table` in document order after the first paragraph whose
 * automatic style carries `fo:break-before="page"` + a `Front_20_matter`
 * master-page switch. The anchor is the STYLE, never the header's text —
 * single-language assembly can legitimately blank the text. Only an
 * explicit `"false"` is flipped; an absent attribute (Luke) stays absent,
 * and no other table (copyright, bilingual example tables) is touched.
 */
function relaxTocTableRowBreaks(contentDoc: XmlDocument, namespaces: Namespaces): void {
  const headerStyle = contentDoc
    .find<Element>(
      "//office:automatic-styles/style:style[@style:family='paragraph'][@style:master-page-name='Front_20_matter']",
      namespaces
    )
    .find(
      (style) =>
        style
          .get<Element>("./style:paragraph-properties", namespaces)
          ?.attr("break-before")
          ?.value() === "page"
    );
  const headerStyleName = headerStyle?.attr("name")?.value();
  if (!headerStyleName) return;

  const headerParagraph = contentDoc.get<Element>(
    `//office:body//text:p[@text:style-name='${headerStyleName}']` +
      ` | //office:body//text:h[@text:style-name='${headerStyleName}']`,
    namespaces
  );
  const tocTable = headerParagraph?.get<Element>("following::table:table[1]", namespaces);
  const tableStyleName = tocTable?.attr("style-name")?.value();
  if (!tableStyleName) return;

  const tableProperties = contentDoc.get<Element>(
    `//office:automatic-styles/style:style[@style:name='${tableStyleName}'][@style:family='table']/style:table-properties`,
    namespaces
  );
  if (tableProperties?.attr("may-break-between-rows")?.value() === "false") {
    tableProperties.attr({ "style:may-break-between-rows": "true" });
  }
}

/** Matches both style-naming families: `Coloring Page - Memory Verse` and `M.T. Coloring Page - Memory Verse`. */
const MEMORY_VERSE_STYLE_NAME_PATTERN = /Memory_20_Verse$/;

/**
 * Rewrites every `text:p` whose `text:style-name` is a content.xml automatic
 * paragraph style parenting a `styles.xml`-defined memory-verse named style,
 * to name that memory-verse style DIRECTLY — sidestepping the automatic
 * style's only-locally-unique name (see the module doc comment's
 * memory-verse section, 017 US2 FR-011..FR-014).
 */
function flattenMemoryVerseAutomaticStyles(
  contentDoc: XmlDocument,
  stylesDoc: XmlDocument,
  namespaces: Namespaces
): void {
  const namedMemoryVerseStyles = new Set(
    stylesDoc
      .find<Element>("//office:styles/style:style[@style:family='paragraph']", namespaces)
      .map((style) => style.attr("name")?.value())
      .filter((name): name is string => !!name && MEMORY_VERSE_STYLE_NAME_PATTERN.test(name))
  );
  if (namedMemoryVerseStyles.size === 0) return;

  const automaticStyleParents = new Map<string, string | undefined>();
  contentDoc
    .find<Element>("//office:automatic-styles/style:style[@style:family='paragraph']", namespaces)
    .forEach((style) => {
      const name = style.attr("name")?.value();
      if (!name) return;
      automaticStyleParents.set(name, style.attr("parent-style-name")?.value() ?? undefined);
    });

  /** Resolves an automatic style's ultimate memory-verse named-style parent, if any. */
  const resolveMemoryVerseTarget = (automaticStyleName: string): string | undefined => {
    const seen = new Set<string>();
    let current: string | undefined = automaticStyleName;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (namedMemoryVerseStyles.has(current)) return current;
      current = automaticStyleParents.get(current);
    }
    return undefined;
  };

  contentDoc.find<Element>("//office:body//text:p[@text:style-name]", namespaces).forEach((p) => {
    const styleName = p.attr("style-name")!.value();
    if (namedMemoryVerseStyles.has(styleName)) return; // already direct
    if (!automaticStyleParents.has(styleName)) return; // not a content.xml automatic style
    const target = resolveMemoryVerseTarget(styleName);
    if (target) p.attr("text:style-name", target);
  });
}

/**
 * Appends the sacrificial terminal paragraph (018) as the LAST child of
 * `office:text`, so `insertDocumentFromURL`'s "last body paragraph inherits
 * the PRECEDING paragraph's style" mutation lands on a throwaway instead of
 * the real coloring-page memory verse. See the module doc comment's 018
 * section for the pinned mechanism and why the marker TEXT is load-bearing.
 *
 * Its automatic style mirrors {@link injectHiddenHeading}'s already-validated
 * hidden shape — zero-height and invisible, with NO `style:master-page-name`,
 * no break properties and no outline level, so it can neither add a page nor
 * disturb chapter numbering. Idempotent: a constituent already carrying the
 * marker as its final paragraph is left alone.
 */
function appendSacrificialTerminalParagraph(contentDoc: XmlDocument, namespaces: Namespaces): void {
  const officeText = contentDoc.get<Element>("//office:body/office:text", namespaces);
  if (!officeText) {
    throw new Error("constituent content.xml has no office:text to append the tail to");
  }

  const bodyChildren = officeText.childNodes().filter((node) => node.type() === "element");
  const lastChild = bodyChildren[bodyChildren.length - 1] as Element | undefined;
  if (lastChild?.text().trim() === QUARTER_ASSEMBLY_SACRIFICIAL_MARKER) return;

  const automaticStyles = contentDoc.get<Element>("//office:automatic-styles", namespaces);
  if (!automaticStyles) {
    throw new Error("constituent content.xml has no office:automatic-styles");
  }
  const styleNs = automaticStyles
    .doc()
    .root()!
    .namespaces()
    .find((ns) => ns.href() === STYLE_NS);

  if (
    !contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${SACRIFICIAL_TAIL_STYLE}']`,
      namespaces
    )
  ) {
    const style = new Element(contentDoc, "style");
    automaticStyles.addChild(style);
    if (styleNs) style.namespace(styleNs);
    style.attr({ "style:name": SACRIFICIAL_TAIL_STYLE, "style:family": "paragraph" });
    const paragraphProps = new Element(contentDoc, "paragraph-properties");
    style.addChild(paragraphProps);
    if (styleNs) paragraphProps.namespace(styleNs);
    paragraphProps.attr({
      "fo:margin-top": "0cm",
      "fo:margin-bottom": "0cm",
      "fo:line-height": "0.05cm",
      "text:number-lines": "false",
      "text:line-number": "0",
    });
    const textProps = new Element(contentDoc, "text-properties");
    style.addChild(textProps);
    if (styleNs) textProps.namespace(styleNs);
    textProps.attr({ "text:display": "none", "fo:font-size": "2pt" });
  }

  const textNs = contentDoc
    .root()!
    .namespaces()
    .find((ns) => ns.href() === TEXT_NS);
  const paragraph = new Element(contentDoc, "p");
  officeText.addChild(paragraph);
  if (textNs) paragraph.namespace(textNs);
  paragraph.attr({ "text:style-name": SACRIFICIAL_TAIL_STYLE });
  paragraph.text(QUARTER_ASSEMBLY_SACRIFICIAL_MARKER);
}

/**
 * Injects a hidden level-1 heading (wrapped in the template's `Outline`
 * list, mirroring the newer masters' own heading markup) right after
 * `text:sequence-decls`, plus its self-contained hidden automatic style:
 * `text:display="none"`, zero margins/height, NO `style:master-page-name`
 * and no break properties so it cannot add a page (spike-verified: pagination
 * unshifted, invisible in the rendered PDF, chapter numbers correct
 * downstream).
 */
function injectHiddenHeading(contentDoc: XmlDocument, namespaces: Namespaces, title: string): void {
  const sequenceDecls = contentDoc.get<Element>("//text:sequence-decls", namespaces);
  if (!sequenceDecls) {
    throw new Error("constituent content.xml has no text:sequence-decls to anchor the heading");
  }
  const textNs = sequenceDecls.namespace();

  const automaticStyles = contentDoc.get<Element>("//office:automatic-styles", namespaces);
  if (!automaticStyles) {
    throw new Error("constituent content.xml has no office:automatic-styles");
  }
  const styleNs = automaticStyles
    .doc()
    .root()!
    .namespaces()
    .find((ns) => ns.href() === STYLE_NS);

  const style = new Element(contentDoc, "style");
  automaticStyles.addChild(style);
  if (styleNs) style.namespace(styleNs);
  style.attr({ "style:name": INJECTED_HEADING_STYLE, "style:family": "paragraph" });
  const paragraphProps = new Element(contentDoc, "paragraph-properties");
  style.addChild(paragraphProps);
  if (styleNs) paragraphProps.namespace(styleNs);
  paragraphProps.attr({
    "fo:margin-top": "0cm",
    "fo:margin-bottom": "0cm",
    "fo:line-height": "0.05cm",
    "text:number-lines": "false",
    "text:line-number": "0",
  });
  const textProps = new Element(contentDoc, "text-properties");
  style.addChild(textProps);
  if (styleNs) textProps.namespace(styleNs);
  textProps.attr({ "text:display": "none", "fo:font-size": "2pt" });

  const list = new Element(contentDoc, "list");
  sequenceDecls.addNextSibling(list);
  if (textNs) list.namespace(textNs);
  list.attr({ "text:style-name": "Outline" });
  const listItem = new Element(contentDoc, "list-item");
  list.addChild(listItem);
  if (textNs) listItem.namespace(textNs);
  const heading = new Element(contentDoc, "h");
  listItem.addChild(heading);
  if (textNs) heading.namespace(textNs);
  heading.attr({
    "text:style-name": INJECTED_HEADING_STYLE,
    "text:outline-level": "1",
  });
  heading.text(title);
}
