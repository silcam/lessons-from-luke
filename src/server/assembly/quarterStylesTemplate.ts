import { existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Returns the absolute path to the shipped quarter-styles template asset.
 * Pure/deterministic; performs no I/O.
 */
export function resolveTemplatePath(): string {
  return join(process.cwd(), "assets", "quarter-styles-template.odt");
}

/**
 * Validates that the template asset at `templatePath` exists and is
 * non-empty. Throws a curated, path-free Error otherwise.
 */
export function validateTemplateAsset(templatePath: string): void {
  if (!existsSync(templatePath) || statSync(templatePath).size === 0) {
    throw new Error("quarter styles template asset is missing or unreadable");
  }
}
