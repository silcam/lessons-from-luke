import libxmljs2, { Document as XmlDocument, Element, Text } from "libxmljs2";
import { AllBooks } from "../../core/models/Lesson";
import { Namespaces, extractNamespaces } from "../xml/mergeXml";

/**
 * footerVocabulary — the pure (no I/O, no storage) half of the assembled
 * book's footer translation.
 *
 * The quarter styles template assets (`assets/quarter-styles-template*.odt`)
 * are loaded verbatim by `sofficeAssemble`'s StarBasic macro
 * (`loadStylesFromURL`, `OverwriteStyles=True`), so their `<style:footer>`
 * blocks land in the assembled book exactly as authored — with literal
 * ENGLISH text ("Quarter", "Lesson", "Page", "Teacher's Guide", "Lessons
 * from Luke") that never passes through the per-lesson translation
 * pipeline. This module knows which of those literals are translatable and
 * how to walk them; `resolveFooterTranslations` supplies the translations
 * and `finalizeAssembledQuarter` performs the substitution.
 *
 * Two things are deliberately NOT touched by the walk:
 *
 * - **Live field caches.** `text:chapter`, `text:page-number` and
 *   `text:user-defined` carry a STALE cached rendering of a live field
 *   (e.g. `<text:chapter>Review Lesson</text:chapter>`). Rewriting them
 *   would be pointless at best (the reader re-resolves the field) and
 *   misleading at worst, so their text is skipped entirely.
 * - **Letter-free text.** Separators (`": "`, `" – "`), digits and pure
 *   whitespace carry nothing to translate, and matching them would make the
 *   vocabulary noisy for no gain.
 *
 * `text:title` and `text:subject` ARE visited — they too are live fields,
 * but their cached text is what a non-refreshing reader shows, so
 * `finalizeAssembledQuarter` updates it cosmetically to match the
 * `meta.xml` values it writes. The visitor is told the parent's local name
 * so it can tell those two apart from ordinary spans.
 */

/** Local names of the field elements whose cached text must never be rewritten. */
const FIELD_CACHE_PARENTS: ReadonlySet<string> = new Set([
  "chapter",
  "page-number",
  "user-defined",
]);

/** Local names of the live fields whose cached text tracks the book's `meta.xml`. */
export const TITLE_PARENT = "title";
export const SUBJECT_PARENT = "subject";

/** The `Teacher's Guide` subtitle, typographic (curly) apostrophe — the bilingual template's spelling. */
export const TEACHERS_GUIDE_CURLY = "Teacher’s Guide";
/** The `Teacher's Guide` subtitle, straight apostrophe — the `text:subject` cache's spelling. */
export const TEACHERS_GUIDE_STRAIGHT = "Teacher's Guide";

/** The book-title literal for a given book, as the templates spell it. */
export function bookTitleLiteral(book: string): string {
  return `Lessons from ${book}`;
}

/**
 * Every translatable literal the committed template assets' footers may
 * contain. `footerVocabulary.test.ts` guards the two assets against this
 * list, so a future template edit that introduces a new untranslated
 * English word fails the build rather than shipping silently.
 */
export const QUARTER_FOOTER_LITERALS: readonly string[] = [
  "Quarter",
  "Lesson",
  "Page",
  TEACHERS_GUIDE_CURLY,
  TEACHERS_GUIDE_STRAIGHT,
  ...AllBooks.map(bookTitleLiteral),
];

/** True when `text` carries at least one Latin letter — i.e. something worth translating. */
function hasLetters(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

/**
 * Calls `visit` for every translatable text node under the document's
 * `office:master-styles` footers, in document order, passing the node's
 * parent element's LOCAL name (`"p"`, `"span"`, `"title"`, `"subject"`).
 * Field caches and letter-free text are skipped — see the module doc
 * comment.
 */
export function forEachFooterTextNode(
  stylesDoc: XmlDocument,
  namespaces: Namespaces,
  visit: (node: Text, parentLocalName: string) => void
): void {
  // libxmljs2 yields a non-array (undefined) rather than an empty list when
  // the xpath resolves against no declared prefix at all — a document with
  // no master styles has no `style:` namespace to bind.
  const nodes = stylesDoc.find<Text>("//office:master-styles//style:footer//text()", namespaces);
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    // Always an element: the xpath only yields text nodes inside a footer.
    const parentLocalName = (node.parent() as Element).name();
    if (FIELD_CACHE_PARENTS.has(parentLocalName)) continue;
    if (!hasLetters(node.text())) continue;
    visit(node, parentLocalName);
  }
}

/**
 * The trimmed, deduped set of translatable literals in a `styles.xml`'s
 * footers, in first-seen order. Used by the committed-template guard test.
 */
export function collectFooterVocabulary(stylesXml: string): string[] {
  const stylesDoc = libxmljs2.parseXml(stylesXml);
  const literals: string[] = [];
  forEachFooterTextNode(stylesDoc, extractNamespaces(stylesDoc), (node) => {
    const literal = node.text().trim();
    if (literal && !literals.includes(literal)) literals.push(literal);
  });
  return literals;
}
