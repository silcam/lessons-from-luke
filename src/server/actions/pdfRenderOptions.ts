/**
 * pdfRenderOptions — the shared render-oracle primitives every PDF-backed
 * page-inventory measurement depends on (contracts/pagination-and-assembly.md
 * §3, "measureLessonOneParity"). Colocated with `measureLessonOneParity`
 * (US3) once that lands; today this module is the single place production
 * code AND the integration-test oracle both pull from, so an edit to either
 * cannot silently diverge from the other (F2a/F2b).
 *
 * Three responsibilities, none implemented yet (this is the RED half — F2a):
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
 * STUB (F2a RED): not yet the real filter target — F2b (GREEN) implements
 * the pinned value. Deliberately NOT the bare `"pdf"` target the
 * pre-F2b `convertToPdf` test helper hardcodes, so a stub-vs-stub
 * coincidence can't paper over either RED assertion.
 */
export const PDF_CONVERT_TO_TARGET = "pdf-STUB-not-yet-implemented";

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
 *
 * STUB (F2a RED): returns the naive, unreconciled split — F2b (GREEN)
 * implements the real reconciliation.
 */
export function reconcilePdfPages(fullText: string, _renderedPageCount: number): string[] {
  return fullText.split("\f");
}

/**
 * The page classes the render oracle distinguishes (contract §3's
 * page-class signature table).
 */
export type PageClass =
  "lesson-title" | "blank" | "coloring" | "lesson-content" | "front-matter" | "table-of-contents";

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
 *
 * STUB (F2a RED): always returns `"lesson-title"` — F2b (GREEN) implements
 * the real classifier.
 */
export function classifyPage(_pageText: string): PageClass {
  return "lesson-title";
}
