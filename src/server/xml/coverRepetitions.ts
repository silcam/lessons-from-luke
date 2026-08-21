import { Document as XmlDocument, Element } from "libxmljs2";
import { Namespaces } from "./mergeXml";
import { removeParagraph } from "./removeParagraph";

/**
 * The source-language "repetition" paragraph styles that distinguish the
 * curriculum owner's BILINGUAL cover masters from their monolingual saves —
 * per the owner: "The monolingual version is the bilingual version saved
 * without the repetitions." The title style's trailing `_20_` is real: the
 * style name ends with a space ("English translation - Cover Title ").
 */
export const COVER_REPETITION_PARAGRAPH_STYLES: readonly string[] = [
  "English_20_translation_20_-_20_Cover_20_Title_20_",
  "English_20_translation_20_-_20_Cover_20_subtitle",
];

/**
 * Removes every `text:p` that renders in a cover repetition style — whether
 * it references the named style directly (the A3 master's title repetition)
 * or through an automatic style whose `style:parent-style-name` chain
 * resolves to it (both A4 repetitions). Style-driven rather than text-driven:
 * `singleLanguageize`'s masterId suppress-queue depends on exact-text dedup
 * at upload time, which the masters defeat (e.g. "Teacher's Guide" M.T. vs
 * "Teacher's guide" repetition), and a surviving repetition clips inside the
 * covers' fixed-height table cells. Exact-match XPath predicates (precedent:
 * monolingualRestyle.ts) and paragraph blanking + `removeParagraph`'s
 * table-cell guard make the pass idempotent and geometry-safe.
 */
export function removeCoverRepetitionParagraphs(doc: XmlDocument, namespaces: Namespaces): void {
  for (const baseStyle of COVER_REPETITION_PARAGRAPH_STYLES) {
    const styleNames = [baseStyle, ...stylesDerivedFrom(doc, namespaces, baseStyle)];
    for (const styleName of styleNames) {
      // libxmljs2 returns undefined (not []) when the XPath itself errors,
      // e.g. a document that never declares the text: prefix.
      const paragraphs =
        doc.find<Element>(`//text:p[@text:style-name='${styleName}']`, namespaces) ?? [];
      paragraphs.forEach((p) => {
        p.text("");
        removeParagraph(p);
      });
    }
  }
}

/**
 * All (automatic) style names whose `style:parent-style-name` chain resolves
 * to `base`, breadth-first over the whole document.
 */
function stylesDerivedFrom(doc: XmlDocument, namespaces: Namespaces, base: string): string[] {
  const derived: string[] = [];
  const queue = [base];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const styles =
      doc.find<Element>(`//style:style[@style:parent-style-name='${parent}']`, namespaces) ?? [];
    styles.forEach((style) => {
      const name = style.attr("name")?.value();
      if (name && !derived.includes(name)) {
        derived.push(name);
        queue.push(name);
      }
    });
  }
  return derived;
}
