/**
 * safeReturnTo — open-redirect sanitizer for the ?returnTo= deep-link parameter.
 *
 * Returns a validated same-app path (pathname + search), or '/' if the input
 * is rejected. Pure function: no window reads, no side-effects.
 *
 * Primary authority: URL constructor relative-resolution + origin check.
 * If new URL(raw, base).origin !== base.origin we know a redirect escape was
 * attempted and we fall back to '/'.
 *
 * String rules below are defense-in-depth applied BEFORE URL parsing:
 *  - Backslash: any '\' in the raw value → reject
 *  - Control chars / leading whitespace: any char in 0x00–0x1F or 0x7F,
 *    or leading ASCII space — reject; do NOT trim-then-accept
 *  - Scheme injection: ':' appearing before the first '/' → reject
 *  - Protocol-relative: raw starts with '//' → reject
 *  - Encoding bypass: decode at most once via decodeURIComponent, re-validate;
 *    if decodeURIComponent throws → reject
 *  - Authority confusion: path segment containing a dot that could be a
 *    hostname (e.g. /evil.com, /@evil.com) → reject
 *
 * Fragment (#…) is stripped before validation/return.
 */
export function safeReturnTo(raw: string, baseOrigin?: string): string {
  const base = baseOrigin ?? "http://localhost";

  // ── 1. Strip fragment (# and everything after) ─────────────────────────
  const hashIdx = raw.indexOf("#");
  const withoutFragment = hashIdx === -1 ? raw : raw.slice(0, hashIdx);

  // ── 2. String defense-in-depth checks ──────────────────────────────────

  // 2a. Control characters (0x00–0x1F, 0x7F) or leading ASCII space/whitespace
  // We do NOT trim-then-accept: leading whitespace itself is a rejection condition.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(withoutFragment)) return "/";
  // Leading ASCII space (U+0020) or Unicode non-breaking space (U+00A0)
  if (withoutFragment.startsWith("\u0020") || withoutFragment.startsWith("\u00A0")) return "/";

  // 2b. Backslash (covers /\evil.com, \/evil.com, /\/evil.com)
  if (withoutFragment.includes("\\")) return "/";

  // 2c. Protocol-relative (first two chars are //)
  if (withoutFragment.startsWith("//")) return "/";

  // 2d. Scheme injection: colon before first slash (javascript:, data:, etc.)
  const firstSlash = withoutFragment.indexOf("/");
  const firstColon = withoutFragment.indexOf(":");
  if (firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash)) return "/";

  // ── 3. Encoding bypass: decode at most once, then re-validate ──────────
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    return "/";
  }

  // Re-check string rules on the decoded value
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(decoded)) return "/";
  // Leading ASCII space (U+0020) or Unicode non-breaking space (U+00A0)
  if (decoded.startsWith("\u0020") || decoded.startsWith("\u00A0")) return "/";
  if (decoded.includes("\\")) return "/";
  if (decoded.startsWith("//")) return "/";
  const decodedFirstSlash = decoded.indexOf("/");
  const decodedFirstColon = decoded.indexOf(":");
  if (
    decodedFirstColon !== -1 &&
    (decodedFirstSlash === -1 || decodedFirstColon < decodedFirstSlash)
  )
    return "/";

  // ── 4. URL constructor: primary authority check ────────────────────────
  let url: URL;
  try {
    url = new URL(withoutFragment, base);
  } catch {
    return "/";
  }

  // The relative base resolve must stay within our origin
  const baseUrl = new URL(base);
  if (url.origin !== baseUrl.origin) return "/";

  // ── 5. Authority confusion: reject path segments that look like hostnames ─
  // A segment like /evil.com or /@evil.com would misdirect users even if the
  // URL origin check passes (relative resolution makes the origin match).
  const pathname = url.pathname;
  const segments = pathname.split("/").filter(Boolean);
  for (const seg of segments) {
    // Reject if any segment contains a dot (hostname-like) or starts with @
    if (seg.startsWith("@") || seg.includes(".")) return "/";
  }

  // ── 6. Return validated path (pathname + search) ───────────────────────
  const search = url.search; // '' if none
  return pathname + search;
}
