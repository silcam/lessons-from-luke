/**
 * Returns the absolute path to the shipped quarter-styles template asset.
 * Pure/deterministic; performs no I/O.
 */
export function resolveTemplatePath(): string {
  throw new Error("not implemented");
}

/**
 * Validates that the template asset at `templatePath` exists and is
 * non-empty. Throws a curated, path-free Error otherwise.
 */
export function validateTemplateAsset(_templatePath: string): void {
  throw new Error("not implemented");
}
