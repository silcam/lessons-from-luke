/**
 * publicAllowlist.ts — default-deny public path registry for the web AuthGate.
 *
 * Any path not explicitly listed here (or matching a listed prefix) is treated
 * as a gated route and requires authentication.
 *
 * Prefix entries end with a trailing slash so that bare segment names
 * (e.g. "/invitation" without a token) are NOT treated as public.
 */

/** Exact public paths (no auth required). */
const PUBLIC_EXACT_PATHS: ReadonlyArray<string> = [] as const;

/** Prefix matches — any path starting with one of these strings is public. */
const PUBLIC_PREFIX_PATHS: ReadonlyArray<string> = ["/invitation/"] as const;

/**
 * Returns true if `path` is publicly accessible (no sign-in required).
 *
 * @param path - The pathname portion of the current URL (e.g. "/invitation/abc123").
 */
export function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(path)) return true;
  if (PUBLIC_PREFIX_PATHS.some((prefix) => path.startsWith(prefix))) return true;
  return false;
}
