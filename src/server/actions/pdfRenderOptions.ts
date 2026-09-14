/**
 * pdfRenderOptions — the shared render-oracle primitives every PDF-backed
 * page-inventory measurement depends on (contracts/pagination-and-assembly.md
 * §3, "measureLessonOneParity"). Colocated with `measureLessonOneParity`
 * (US3) once that lands; today this module is the single place production
 * code AND the integration-test oracle both pull from, so an edit to either
 * cannot silently diverge from the other (F2a/F2b).
 *
 * Three responsibilities:
 *
 * 1. {@link PDF_CONVERT_TO_TARGET} — the `--convert-to` filter target every
 *    headless `soffice` PDF export must use, pinning `IsSkipEmptyPages` to
 *    `false` so LibreOffice's automatically-inserted blank pages are
 *    INCLUDED in the rendered page count (the option's polarity is inverted
 *    relative to its name — `true` would SKIP them).
 * 2. {@link reconcilePdfPages} — reconciles `pdftotext`'s `\f`-delimited page
 *    split against `pdfinfo`'s authoritative page count before anything is
 *    classified, per contract §3 "Page splitting is reconciled".
 * 3. {@link classifyPage} — the page-class signature table (contract §3).
 */

/**
 * The `--convert-to` filter target for headless PDF export via `soffice`,
 * e.g. `soffice --headless --convert-to <PDF_CONVERT_TO_TARGET> --outdir ...`.
 *
 * MUST always encode `IsSkipEmptyPages` = `false` — this INCLUDES
 * LibreOffice's automatically-inserted blank pages (`true` would SKIP them
 * and silently produce a short PDF on books carrying an implicit
 * `style:page-usage="left"` blank, e.g. via `Inside_20_cover`).
 *
 * Requires LibreOffice >= 7.4 (per F1's spike finding).
 */
export const PDF_CONVERT_TO_TARGET =
  'pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}';

/** Thrown by {@link reconcilePdfPages} when the extraction and the
 * authoritative page count describe different documents. Never carries an
 * absolute path (contract §3 "curated, path-free reason"). */
export class PdfPageReconciliationError extends Error {}

/**
 * Reconciles `pdftotext -layout`'s full-text extraction against `pdfinfo`'s
 * authoritative `renderedPageCount` before any page is classified (contract
 * §3 "Page splitting is reconciled against the authoritative page count").
 *
 * `pdftotext` emits a trailing form feed after the LAST page too, so
 * `fullText.split("\f")` yields exactly `renderedPageCount + 1` entries with
 * an empty tail. This asserts that shape, drops exactly the one trailing
 * entry, and returns exactly `renderedPageCount` classifiable entries. A
 * mismatch (wrong entry count, or a non-empty tail) throws
 * {@link PdfPageReconciliationError} with a curated, path-free reason rather
 * than being silently absorbed.
 */
export function reconcilePdfPages(fullText: string, renderedPageCount: number): string[] {
  const parts = fullText.split("\f");
  const expectedLength = renderedPageCount + 1;
  const tail = parts[parts.length - 1];
  if (parts.length !== expectedLength || tail !== "") {
    throw new PdfPageReconciliationError(
      `PDF text extraction did not reconcile against the authoritative page count: ` +
        `expected ${renderedPageCount} page(s) (${expectedLength} pdftotext entr${
          expectedLength === 1 ? "y" : "ies"
        } including the trailing empty tail), got ${parts.length} entr${
          parts.length === 1 ? "y" : "ies"
        }${tail !== "" ? " with a non-empty trailing entry" : ""}.`
    );
  }
  return parts.slice(0, -1);
}

/**
 * The page classes the render oracle distinguishes (contract §3's
 * page-class signature table).
 */
export type PageClass =
  "lesson-title" | "blank" | "coloring" | "lesson-content" | "front-matter" | "table-of-contents";

/** `Quarter <Q>` immediately followed by `Lesson <N>`, on whole-token boundaries. */
const LESSON_MARKER = /\bQuarter\s+\d+\s+Lesson\s+\d+\b/g;
/** `Quarter <Q>` alone, on whole-token boundaries. */
const QUARTER_TOKEN = /\bQuarter\s+\d+\b/;
/** A printed page-number footer token, e.g. `Page 5` or `Page iii`. */
const PAGE_TOKEN = /\bPage\s+\S+/;

/**
 * Classifies a single rendered page's extracted text by its footer
 * signature (contract §3). Blank-class membership is checked FIRST — "no
 * extractable text after whitespace trim" — since under `-layout` an empty
 * page commonly yields whitespace rather than the empty string, and an
 * exact-empty test would misclassify it as lesson-title class.
 *
 * The lesson marker requires BOTH `Quarter <Q>` and `Lesson <N>` tokens, on
 * whole-token boundaries — `Front_20_matter`'s footer alone carries
 * `Quarter <Q>`, so a discriminator keyed on either token alone
 * misclassifies every front-matter page as coloring-page class.
 */
export function classifyPage(pageText: string): PageClass {
  if (pageText.trim() === "") return "blank";

  const markerOccurrences = pageText.match(LESSON_MARKER)?.length ?? 0;
  const hasPageNumber = PAGE_TOKEN.test(pageText);

  // The master's footer literally carries the Quarter/Lesson run twice on a
  // coloring page (once per printed half-sheet), and coloring pages never
  // print a page number.
  if (markerOccurrences >= 2 && !hasPageNumber) return "coloring";

  // Ordinary lesson content: the marker once, plus a page number.
  if (markerOccurrences === 1 && hasPageNumber) return "lesson-content";

  // Front matter / TOC pages never carry the Quarter+Lesson marker, but do
  // print a page number — distinguished from each other by whether the lone
  // `Quarter <Q>` token (without `Lesson <N>`) is present.
  if (markerOccurrences === 0 && hasPageNumber) {
    return QUARTER_TOKEN.test(pageText) ? "front-matter" : "table-of-contents";
  }

  // No footer at all (no marker, no page number), but real body text — a
  // lesson's own suppressed-footer title page.
  return "lesson-title";
}
