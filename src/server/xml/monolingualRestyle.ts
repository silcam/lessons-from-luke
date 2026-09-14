import { Document as XmlDocument, Element } from "libxmljs2";
import { Namespaces } from "./mergeXml";

/**
 * Curated, path-free error message thrown by `assertRestyleTargetsDefined`
 * when the assembled styles.xml lacks one of the plain restyle targets —
 * those styles are defined only by the quarter-styles template assets, so
 * absence means a template-asset regression.
 */
export const RESTYLE_TARGET_MISSING_MESSAGE =
  "assembled document is missing a plain restyle target paragraph style";

/**
 * The M.T. ("Mother Tongue") paragraph styles the MONOLINGUAL quarter-styles
 * template deliberately omits, mapped to the plain styles it defines instead.
 * The curriculum owner's single-language masters restyle away exactly these
 * (verified by style-usage analysis of the English mono master); leaving them
 * in place lets the constituents' stale formatting (e.g. a 0.3 cm title
 * margin instead of the intended 0.9 cm) survive assembly. Cover styles are
 * deliberately NOT in this map.
 */
export const MONOLINGUAL_PARAGRAPH_STYLE_RENAMES: readonly { from: string; to: string }[] = [
  { from: "M.T._20_Lesson_20_Title", to: "Lesson_20_Title" },
  { from: "M.T._20_Lesson_20_title_20_-_20_invisible", to: "Lesson_20_title_20_-_20_invisible" },
  {
    from: "M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse",
    to: "Coloring_20_Page_20_-_20_Memory_20_Verse",
  },
  { from: "M.T._20_Coloring_20_Page_20_-_20_Truth", to: "Coloring_20_Page_20_-_20_Truth" },
];

/**
 * Rewrites every REFERENCE to a mapped M.T. style — direct `text:style-name`
 * attributes and `style:parent-style-name` on (automatic) style definitions —
 * to the plain equivalent. Style DEFINITIONS (`style:name`) are never
 * touched: stale unreferenced M.T. definitions are harmless and deleting
 * them is a non-goal. Exact-match XPath predicates avoid the
 * `Lesson_20_Title` ⊂ `M.T._20_Lesson_20_Title` substring hazard, and make
 * the pass idempotent (a second run finds nothing to rewrite).
 */
export function restyleMonolingualParagraphs(doc: XmlDocument, namespaces: Namespaces): void {
  for (const { from, to } of MONOLINGUAL_PARAGRAPH_STYLE_RENAMES) {
    doc.find<Element>(`//*[@text:style-name='${from}']`, namespaces).forEach((element) => {
      element.attr({ "text:style-name": to });
    });
    doc
      .find<Element>(`//style:style[@style:parent-style-name='${from}']`, namespaces)
      .forEach((element) => {
        element.attr({ "style:parent-style-name": to });
      });
  }
}

/**
 * Asserts every plain restyle target exists as a paragraph style in
 * `office:styles` before the restyle runs. The targets come only from the
 * template assets (constituents never define them), so a missing one is a
 * template regression — fail loud with a curated, path-free message
 * (precedent: `patchOutlineNumbering`'s missing-outline-style throw).
 */
export function assertRestyleTargetsDefined(stylesDoc: XmlDocument, namespaces: Namespaces): void {
  for (const { to } of MONOLINGUAL_PARAGRAPH_STYLE_RENAMES) {
    const definition = stylesDoc.get<Element>(
      `//office:styles/style:style[@style:name='${to}'][@style:family='paragraph']`,
      namespaces
    );
    if (!definition) {
      throw new Error(RESTYLE_TARGET_MISSING_MESSAGE);
    }
  }
}
