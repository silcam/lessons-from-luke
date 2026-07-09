import fs from "fs";
import libxmljs2, { Element, Text } from "libxmljs2";
import { mkdirSafe, unzip, unlinkRecursive } from "../../core/util/fsUtils";
import { extractNamespaces } from "../xml/mergeXml";
import { rezipWithMimetypeFirst } from "../xml/rezipWithMimetypeFirst";

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

const FIELD_NAMES = ["Quarter", "Lesson"] as const;
type FieldName = (typeof FIELD_NAMES)[number];
type ResolvedFieldValues = Record<FieldName, string>;

/**
 * Flatten `odtPath`'s footer Quarter/Lesson `text:user-defined` fields to
 * literal, XML-escaped text and re-pack it with the ODF-safe mimetype
 * ordering. See the module doc comment for the full contract.
 */
export function flattenFooterFields(options: FlattenFooterFieldsOptions): void {
  const { odtPath, series, lesson } = options;
  const extractDirPath = `${odtPath}_flatten`;

  try {
    mkdirSafe(extractDirPath);
    unzip(odtPath, extractDirPath);

    const resolvedValues = resolveFieldValues(`${extractDirPath}/meta.xml`, { series, lesson });
    flattenStylesXml(`${extractDirPath}/styles.xml`, resolvedValues);

    rezipWithMimetypeFirst(extractDirPath, odtPath);
  } finally {
    unlinkRecursive(extractDirPath);
  }
}

function resolveFieldValues(
  metaXmlPath: string,
  fallback: { series: number; lesson: number }
): ResolvedFieldValues {
  const xml = fs.readFileSync(metaXmlPath, "utf8");

  const fallbackValues: ResolvedFieldValues = {
    Quarter: String(fallback.series),
    Lesson: String(fallback.lesson),
  };

  return FIELD_NAMES.reduce((resolved, name) => {
    const value = extractMetaUserDefinedValue(xml, name)?.trim();
    resolved[name] = value ? value : fallbackValues[name];
    return resolved;
  }, fallbackValues);
}

/**
 * Extracts the raw literal text content of a `meta:user-defined` custom
 * property by name, via regex rather than a strict XML parser.
 *
 * `meta.xml` custom property VALUES are not always well-formed XML on their
 * own (e.g. a user-entered Quarter/Lesson value containing `&`/`<` literally,
 * unescaped) — a strict parse would either throw or (in recovery mode) drop
 * the offending content. Since these values are treated as opaque literal
 * text destined for a `text:user-defined` field replacement (see
 * `flattenStylesXml`), extracting the raw substring preserves it exactly.
 */
function extractMetaUserDefinedValue(metaXml: string, name: FieldName): string | undefined {
  const pattern = new RegExp(
    `<meta:user-defined\\b[^>]*\\bmeta:name="${name}"[^>]*>([\\s\\S]*?)<\\/meta:user-defined>`
  );
  return pattern.exec(metaXml)?.[1];
}

function flattenStylesXml(stylesXmlPath: string, resolvedValues: ResolvedFieldValues): void {
  const xml = fs.readFileSync(stylesXmlPath, "utf8");
  const xmlDoc = libxmljs2.parseXml(xml);
  const namespaces = extractNamespaces(xmlDoc);

  FIELD_NAMES.forEach((name) => {
    const elements = xmlDoc.find<Element>(`//text:user-defined[@text:name='${name}']`, namespaces);
    elements.forEach((element) => {
      element.replace(new Text(xmlDoc, resolvedValues[name]));
    });
  });

  fs.writeFileSync(stylesXmlPath, xmlDoc.toString(false));
}
