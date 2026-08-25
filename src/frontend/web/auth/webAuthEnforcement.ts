/**
 * webAuthEnforcement — runtime read of the `ENFORCE_WEB_AUTH` feature flag.
 *
 * The server injects `<meta name="enforce-web-auth" content="0|1">` into the
 * production HTML catch-all. The value is read at call time (never cached) so a
 * fresh page load always reflects the server's current configuration.
 *
 * Semantics:
 *   - content === "0"        → gate OFF (auth not enforced)
 *   - any other content      → gate ON
 *   - tag absent entirely    → gate ON (fail closed)
 *
 * The tag is absent only outside production — webpack-dev-server serves an
 * in-memory HTML with no meta injection, and jsdom test documents start empty.
 * Failing closed there preserves the currently enforced behaviour: the flag can
 * only ever be turned off by an explicit, server-rendered `content="0"`.
 */
export function isWebAuthEnforced(): boolean {
  const tag = document.querySelector('meta[name="enforce-web-auth"]');
  if (!tag) return true; // absent = non-production → fail closed
  return tag.getAttribute("content") !== "0";
}
