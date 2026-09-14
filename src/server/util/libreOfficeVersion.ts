/**
 * libreOfficeVersion.ts — LibreOffice version floor preflight for the
 * assembleQuarter golden-reference integration suite.
 *
 * PROBLEM
 * -------
 * assembleQuarter.integration.test.ts renders assembled quarters to PDF via
 * `soffice --headless` and asserts golden values extracted with pdftotext.
 * Those golden values were settled on newer LibreOffice renders matching
 * production/staging (Ubuntu 24.04 LTS "Noble", LibreOffice 24.2 — CI's
 * integration job now runs on `ubuntu-24.04` for the same LO 24.2 build).
 * On old LibreOffice — observed on 7.3.7 — the render differs enough that
 * page-layout-dependent helpers (e.g. measureLessonOneParity.ts's
 * locateLessonOnePage) can't even locate the expected content, cascading
 * into a wall of unrelated-looking failures far from the real cause.
 * (7.4 was previously observed to pass; the floor sits at 24.2 for
 * production parity, not because 7.4 renders were seen to break.)
 *
 * This module gives the suite's `beforeAll` preflights a single, fast,
 * loud failure instead of that cascade: parse the installed LibreOffice
 * version and assert it meets the floor BEFORE any soffice work starts.
 */

/** A parsed LibreOffice (major, minor) version pair. */
export interface LibreOfficeVersion {
  major: number;
  minor: number;
}

/** The minimum LibreOffice version the golden-reference renders require. */
export const MIN_SUPPORTED_VERSION: LibreOfficeVersion = { major: 24, minor: 2 };

/**
 * Parses the raw stdout of `soffice --version`, e.g.
 * "LibreOffice 7.3.7.2 30(Build:2)" or "LibreOffice 25.8.1.2 ...".
 * Returns null if the (major.minor) version number can't be found.
 */
export function parseLibreOfficeVersion(rawVersionOutput: string): LibreOfficeVersion | null {
  const match = rawVersionOutput.match(/(\d+)\.(\d+)(?:\.\d+)*/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

/**
 * Extracts the full dotted version string (e.g. "7.3.7") from raw
 * `soffice --version` output, for use in human-facing messages only —
 * NOT for comparison (assertLibreOfficeSupported compares major.minor).
 * Falls back to "major.minor" if no patch segment is present.
 */
function fullVersionStringFor(rawVersionOutput: string, version: LibreOfficeVersion): string {
  const match = rawVersionOutput.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : `${version.major}.${version.minor}`;
}

/** True if `version` is >= `floor`, compared as a (major, minor) tuple. */
export function isVersionAtLeast(version: LibreOfficeVersion, floor: LibreOfficeVersion): boolean {
  if (version.major !== floor.major) return version.major > floor.major;
  return version.minor >= floor.minor;
}

/**
 * Asserts the LibreOffice version reported by `rawVersionOutput` meets
 * MIN_SUPPORTED_VERSION, throwing a clear, actionable Error otherwise.
 * Also throws (distinctly) if the version string is unparseable.
 */
export function assertLibreOfficeSupported(rawVersionOutput: string): void {
  const version = parseLibreOfficeVersion(rawVersionOutput);
  if (!version) {
    throw new Error(
      `Could not parse LibreOffice version from \`soffice --version\` output: ${JSON.stringify(
        rawVersionOutput
      )}`
    );
  }
  if (!isVersionAtLeast(version, MIN_SUPPORTED_VERSION)) {
    throw new Error(
      `LibreOffice >= ${MIN_SUPPORTED_VERSION.major}.${MIN_SUPPORTED_VERSION.minor} required for the ` +
        `assembleQuarter integration suite (found ${fullVersionStringFor(rawVersionOutput, version)}). ` +
        `The golden-reference values were settled on the production/staging render line ` +
        `(Ubuntu 24.04 LTS, LibreOffice 24.2); upgrade LibreOffice.`
    );
  }
}
