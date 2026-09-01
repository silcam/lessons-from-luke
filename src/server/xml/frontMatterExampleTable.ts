import { Document as XmlDocument, Element } from "libxmljs2";
import { Namespaces } from "./mergeXml";
import { stylesDerivedFrom } from "./coverRepetitions";

/**
 * The two paragraph styles that only ever occur inside the TOC master's
 * bilingual-layout example table (the bordered box in the Introduction that
 * demonstrates the M.T.-line-over-English-inset layout). Union of both,
 * because depending on translation state either style's paragraphs may
 * already have been blanked or deleted by the time a reader looks.
 */
export const FRONT_MATTER_EXAMPLE_INSET_STYLES: readonly string[] = [
  "M.T._20_Text_20_-_20_Single_20_Inset",
  "English_20_Translation_20_-_20_single_20_inset",
];

/**
 * Collects the bilingual-example table(s) in the TOC front matter plus each
 * table's introducing sentence ("This curriculum is set up as a bilingual
 * document … (see example below)"). Style-driven like coverRepetitions:
 * a table qualifies when it contains a paragraph rendered in either inset
 * style, directly or through an automatic style's parent chain. The intro
 * sentence is the table's immediate preceding sibling, and only if that
 * sibling is a `text:p` — never delete by looser position heuristics.
 *
 * MUST run before any merge mutation: it is read-only against the pristine
 * tree, so it cannot corrupt the position-based xpaths the substitution and
 * clearEmptyParagraphs passes resolve later.
 */
export function collectFrontMatterExampleElements(
  doc: XmlDocument,
  namespaces: Namespaces
): Element[] {
  const collected: Element[] = [];
  const seenTablePaths = new Set<string>();
  for (const baseStyle of FRONT_MATTER_EXAMPLE_INSET_STYLES) {
    const styleNames = [baseStyle, ...stylesDerivedFrom(doc, namespaces, baseStyle)];
    for (const styleName of styleNames) {
      // libxmljs2 returns undefined (not []) when the XPath itself errors,
      // e.g. a document that never declares the text: prefix.
      const paragraphs =
        doc.find<Element>(`//text:p[@text:style-name='${styleName}']`, namespaces) ?? [];
      for (const paragraph of paragraphs) {
        const table = paragraph.get<Element>("ancestor::table:table[1]", namespaces);
        if (!table || seenTablePaths.has(table.path())) continue;
        seenTablePaths.add(table.path());
        const intro = table.get<Element>("preceding-sibling::*[1]", namespaces);
        if (intro && intro.name() === "p") collected.push(intro);
        collected.push(table);
      }
    }
  }
  return collected;
}

/**
 * Removes the previously collected elements. Removal is deferred until after
 * the merge mutations so positional xpaths stay valid; the element refs
 * survive because `removeParagraph` never removes tables and an intro
 * paragraph ref is parent-guarded here: `clearEmptyParagraphs` may already
 * have detached an untranslated intro, and removing a detached node must be
 * a no-op, not a crash.
 */
export function removeFrontMatterExampleElements(elements: Element[]): void {
  elements.forEach((element) => {
    if (element.parent()) element.remove();
  });
}
