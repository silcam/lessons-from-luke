import { existsSync, statSync } from "fs";
import { basename, join } from "path";

/**
 * Curated, path-free error message thrown by `validateTemplateAsset` when
 * the shipped quarter-styles template asset is missing or unreadable.
 */
export const TEMPLATE_ASSET_MISSING_MESSAGE =
  "quarter styles template asset is missing or unreadable";

/** Bilingual (default) quarter-styles template asset filename. */
export const BILINGUAL_TEMPLATE_FILENAME = "quarter-styles-template.odt";

/** Monolingual (single-language) quarter-styles template asset filename. */
export const MONOLINGUAL_TEMPLATE_FILENAME = "quarter-styles-template-monolingual.odt";

/**
 * Returns the absolute path to the shipped quarter-styles template asset,
 * keyed by assembly mode. `singleLanguage === true` (majority language id 0)
 * resolves the monolingual master; otherwise the bilingual master. The
 * default keeps bilingual mode and every existing caller/test valid.
 * Pure/deterministic; performs no I/O.
 */
export function resolveTemplatePath(singleLanguage: boolean = false): string {
  const filename = singleLanguage ? MONOLINGUAL_TEMPLATE_FILENAME : BILINGUAL_TEMPLATE_FILENAME;
  return join(process.cwd(), "assets", filename);
}

/**
 * True when `templatePath` is the MONOLINGUAL quarter-styles template asset
 * (by basename). The monolingual M.T. restyle is gated on this predicate —
 * not on the majority-language id — so the restyle decision stays consistent
 * by construction with whichever template actually styled the book.
 */
export function isMonolingualTemplatePath(templatePath: string): boolean {
  return basename(templatePath) === MONOLINGUAL_TEMPLATE_FILENAME;
}

/**
 * Validates that the template asset at `templatePath` exists and is
 * non-empty. Throws a curated, path-free Error otherwise.
 */
export function validateTemplateAsset(templatePath: string): void {
  if (!existsSync(templatePath) || statSync(templatePath).size === 0) {
    throw new Error(TEMPLATE_ASSET_MISSING_MESSAGE);
  }
}
