import fs from "fs";
import libxmljs2, { Element } from "libxmljs2";
import { mkdirSafe, unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces } from "../xml/mergeXml";
import { rezipWithMimetypeFirst } from "../xml/rezipWithMimetypeFirst";

/**
 * renameMasterPageStyles — suffix every `style:master-page` / `style:page-layout`
 * NAME (and every in-document reference to those names, in both `styles.xml`
 * and `content.xml`) with a per-constituent-unique tag, then re-pack the
 * archive with the ODF-required mimetype-stored-first ordering.
 *
 * Why this exists (real end-to-end soffice-merge defect, distinct from and
 * NOT caught by `flattenFooterFields.test.ts`/`assembleQuarter.test.ts`,
 * which both mock the merge): all 14 quarter constituents are authored from
 * one shared Word/LibreOffice template, so they all use the SAME
 * `style:master-page` NAMES (`Standard`, `Lesson_20_Content`,
 * `Front_20_matter`, `Body_20_Pages`, …) — each with its OWN footer (already
 * correctly flattened to a literal Quarter/Lesson value by
 * `flattenFooterFields`, per-copy). `sofficeAssemble`'s macro
 * (`Module1.xba`, `insertDocumentFromURL`) imports constituents into a
 * shared base document one at a time; when an imported document's
 * page-style NAME already exists in the target (true for every constituent
 * after the first, since all 14 share the same names), LibreOffice's import
 * KEEPS the target's already-registered style definition and DISCARDS the
 * incoming one — even though the incoming document's body content still
 * references that style BY NAME. Because the TOC (`00.odt`) is inserted
 * first, its footer (whose own `meta.xml` has no `Lesson` property, so
 * `flattenFooterFields` falls back to the TOC's sentinel lesson number, 99)
 * becomes the ONE master-page footer definition used across the ENTIRE
 * merged book — every lesson's footer shows the TOC's own fallback value
 * instead of its own.
 *
 * Fix: give each constituent's page-styles a per-constituent-unique name
 * BEFORE the merge, so the name collision LibreOffice's import resolves
 * "first import wins" against never occurs, and each of the 14 footers
 * survives independently. Must run in the same generate-once, copy-before-
 * flatten pipeline as `flattenFooterFields` (`assembleQuarter.ts`) — never
 * against a `makeLessonFile`-returned raw source path (see that module's
 * doc comment for why an in-place mutation there would be catastrophic).
 *
 * Contract:
 * - Every `style:master-page` element's `style:name` gets `_<suffix>`
 *   appended. Its `style:display-name` (when present) ALSO gets ` <suffix>`
 *   appended — confirmed empirically that LibreOffice's `insertDocumentFromURL`
 *   de-duplicates imported master-pages against the target's already-registered
 *   ones by DISPLAY NAME, not the internal `style:name` alone, so leaving the
 *   display name untouched makes the `style:name` rename a no-op for every
 *   master-page a real lesson document actually uses (see the loop below).
 * - Every `style:master-page`'s `style:page-layout-name` attribute is
 *   rewritten to reference the correspondingly-renamed `style:page-layout`
 *   (whose own `style:name` also gets `_<suffix>` appended).
 * - Every `style:master-page`'s `style:next-style-name` attribute — used to
 *   chain e.g. `Left_20_Page` -> `Right_20_Page` — is rewritten IF it names
 *   another master-page in this same document (never touches unrelated
 *   paragraph/list `style:next-style-name` references elsewhere in the doc).
 * - Every `content.xml` `style:style` element's `style:master-page-name`
 *   attribute (paragraph styles that force a page break onto a named master
 *   page) is rewritten to the corresponding renamed name.
 * - Re-zips with the `mimetype` entry stored FIRST and UNCOMPRESSED (ODF
 *   requirement), mirroring `flattenFooterFields`'s re-pack recipe.
 * - Mutates `odtPath` IN PLACE. This function is provenance-agnostic — it is
 *   the CALLER's responsibility to pass the path to a disposable COPY, never
 *   the canonical source ODT.
 */
export interface RenameMasterPageStylesOptions {
  /** Path to the ODT to rewrite IN PLACE. MUST be a disposable copy. */
  odtPath: string;
  /**
   * Per-constituent-unique suffix appended to every master-page/page-layout
   * name (e.g. the same zero-padded index used for the constituent's own
   * filename stem, `"00"`..`"13"`).
   */
  suffix: string;
}

/**
 * Suffix every `style:master-page`/`style:page-layout` name in `odtPath`
 * (and every reference to those names in `styles.xml` and `content.xml`)
 * with `options.suffix`, then re-pack with the ODF-safe mimetype ordering.
 * See the module doc comment for the full contract.
 */
export function renameMasterPageStyles(options: RenameMasterPageStylesOptions): void {
  const { odtPath, suffix } = options;
  const extractDirPath = `${odtPath}_renamepagestyles`;

  try {
    mkdirSafe(extractDirPath);
    unzip(odtPath, extractDirPath);

    const stylesXmlPath = `${extractDirPath}/styles.xml`;
    const contentXmlPath = `${extractDirPath}/content.xml`;

    const stylesDoc = libxmljs2.parseXml(fs.readFileSync(stylesXmlPath, "utf8"));
    const namespaces = extractNamespaces(stylesDoc);

    const masterPageNameMap = renameMasterPagesAndLayouts(stylesDoc, namespaces, suffix);
    fs.writeFileSync(stylesXmlPath, stylesDoc.toString(false));

    if (masterPageNameMap.size > 0 && fs.existsSync(contentXmlPath)) {
      const contentDoc = libxmljs2.parseXml(fs.readFileSync(contentXmlPath, "utf8"));
      const contentNamespaces = extractNamespaces(contentDoc);
      rewriteMasterPageNameRefs(contentDoc, contentNamespaces, masterPageNameMap);
      fs.writeFileSync(contentXmlPath, contentDoc.toString(false));
    }

    rezipWithMimetypeFirst(extractDirPath, odtPath);
  } finally {
    unlinkRecursive(extractDirPath);
  }
}

/**
 * Renames every `style:master-page` and `style:page-layout` element's
 * `style:name` (suffixing each with `_<suffix>`), rewrites each
 * master-page's `style:page-layout-name` to the renamed layout, and
 * rewrites `style:next-style-name` chains between renamed master-pages.
 *
 * @returns a map of every original master-page name to its renamed form, for
 * `rewriteMasterPageNameRefs` to apply to `content.xml`.
 */
function renameMasterPagesAndLayouts(
  stylesDoc: ReturnType<typeof libxmljs2.parseXml>,
  namespaces: Record<string, string>,
  suffix: string
): Map<string, string> {
  const masterPageNameMap = new Map<string, string>();
  const pageLayoutNameMap = new Map<string, string>();

  const masterPages = stylesDoc.find<Element>("//style:master-page", namespaces);
  masterPages.forEach((masterPage) => {
    const nameAttr = masterPage.attr("name");
    if (!nameAttr) return;
    const oldName = nameAttr.value();
    const newName = `${oldName}_${suffix}`;
    masterPageNameMap.set(oldName, newName);

    const layoutAttr = masterPage.attr("page-layout-name");
    if (layoutAttr) {
      const oldLayoutName = layoutAttr.value();
      const newLayoutName = `${oldLayoutName}_${suffix}`;
      pageLayoutNameMap.set(oldLayoutName, newLayoutName);
    }
  });

  masterPages.forEach((masterPage) => {
    const nameAttr = masterPage.attr("name")!;
    nameAttr.value(masterPageNameMap.get(nameAttr.value())!);

    const layoutAttr = masterPage.attr("page-layout-name");
    if (layoutAttr) {
      const renamedLayout = pageLayoutNameMap.get(layoutAttr.value());
      if (renamedLayout) layoutAttr.value(renamedLayout);
    }

    const nextStyleAttr = masterPage.attr("next-style-name");
    if (nextStyleAttr) {
      const renamedNext = masterPageNameMap.get(nextStyleAttr.value());
      if (renamedNext) nextStyleAttr.value(renamedNext);
    }

    // LibreOffice's `insertDocumentFromURL` style-import de-duplicates
    // imported master-pages against the target document's already-registered
    // ones by DISPLAY NAME when one is present — NOT by the internal
    // `style:name` alone (confirmed empirically: renaming only `style:name`
    // left every human-named master-page, e.g. `Lesson_20_Content`/"Lesson
    // Content", collapsed back onto one shared definition across all 14
    // constituents, exactly reproducing the bug, while the few master-pages
    // that lack a `style:display-name` — `Standard`, `HTML`, `Index`, etc. —
    // rename-collision-free correctly). So `style:display-name` MUST be
    // suffixed too, or this whole rename is a no-op for every master-page a
    // real lesson document actually uses.
    const displayNameAttr = masterPage.attr("display-name");
    if (displayNameAttr) {
      displayNameAttr.value(`${displayNameAttr.value()} ${suffix}`);
    }
  });

  const pageLayouts = stylesDoc.find<Element>("//style:page-layout", namespaces);
  pageLayouts.forEach((pageLayout) => {
    const nameAttr = pageLayout.attr("name");
    if (!nameAttr) return;
    const renamed = pageLayoutNameMap.get(nameAttr.value());
    if (renamed) nameAttr.value(renamed);
  });

  return masterPageNameMap;
}

/**
 * Rewrites every `content.xml` `style:style` element's
 * `style:master-page-name` attribute (present on paragraph styles that force
 * a page break onto a specific named master page) to the renamed name.
 * Leaves any reference to a name NOT in `masterPageNameMap` untouched.
 */
function rewriteMasterPageNameRefs(
  contentDoc: ReturnType<typeof libxmljs2.parseXml>,
  namespaces: Record<string, string>,
  masterPageNameMap: Map<string, string>
): void {
  const referencingElements = contentDoc.find<Element>("//*[@style:master-page-name]", namespaces);
  referencingElements.forEach((element) => {
    const attr = element.attr("master-page-name");
    if (!attr) return;
    const renamed = masterPageNameMap.get(attr.value());
    if (renamed) attr.value(renamed);
  });
}
