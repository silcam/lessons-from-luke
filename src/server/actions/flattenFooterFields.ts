/**
 * flattenFooterFields — replace an ODT's footer `text:user-defined`
 * Quarter/Lesson field references with literal, XML-escaped text, then
 * re-pack the archive with the ODF-required mimetype-stored-first ordering.
 *
 * See specs/007-assembled-quarter-download/research.md §R4 and
 * data-model.md "Validation rules summary" (flattened footer row).
 *
 * Why this exists: `insertDocumentFromURL` (the merge macro) copies body
 * content but NOT each constituent's own `meta.xml` custom properties, so a
 * merged document's `text:user-defined` Quarter/Lesson footer fields all
 * resolve blank. Flattening each constituent to literal text BEFORE merge
 * is the only fix that tolerates 13 distinct per-lesson values under one
 * merged property namespace (FR-004).
 *
 * Contract:
 * - Reads `meta.xml`'s `Quarter`/`Lesson` custom properties from the ODT at
 *   `odtPath`. Falls back to `options.series`/`options.lesson` when a
 *   property is absent or empty (never emits a blank field).
 * - Every substituted value is XML-escaped (`&`, `<`, `>`) — a raw
 *   metacharacter would otherwise produce a malformed `styles.xml`.
 * - Replaces each `<text:user-defined text:name="Quarter|Lesson">…</text:user-defined>`
 *   element in `styles.xml` (where the footer lives) with a plain text node
 *   carrying the resolved literal value — the field becomes ordinary text,
 *   not a live field reference.
 * - Re-zips the ODT with the `mimetype` entry stored FIRST and UNCOMPRESSED
 *   (ODF requirement). `fsUtils.zip` (`zip -r`) does NOT guarantee this
 *   ordering and must not be reused blindly here (research.md R4 sharp edge).
 * - Mutates `odtPath` IN PLACE. This function is provenance-agnostic — it is
 *   the CALLER's responsibility to pass the path to a disposable COPY, never
 *   the canonical source ODT (see the assembleQuarter task for why: an
 *   in-place mutation of the admin-uploaded source would destroy
 *   non-recoverable data).
 */
export interface FlattenFooterFieldsOptions {
  /** Path to the ODT to flatten IN PLACE. MUST be a disposable copy. */
  odtPath: string;
  /** Fallback series number, used when the ODT's own `Quarter` custom property is absent/empty. */
  series: number;
  /** Fallback lesson number, used when the ODT's own `Lesson` custom property is absent/empty. */
  lesson: number;
}

/**
 * Flatten `odtPath`'s footer Quarter/Lesson `text:user-defined` fields to
 * literal, XML-escaped text and re-pack it with the ODF-safe mimetype
 * ordering. See the module doc comment for the full contract.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.5; real
 * implementation lands in lessons-from-luke-koog.6.1.6.
 */
export function flattenFooterFields(_options: FlattenFooterFieldsOptions): void {
  throw new Error("not implemented");
}
