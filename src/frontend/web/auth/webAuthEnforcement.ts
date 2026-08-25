/**
 * webAuthEnforcement — runtime read of the `ENFORCE_WEB_AUTH` feature flag.
 *
 * The `<meta name="enforce-web-auth" content="0|1">` tag reaches the page two
 * ways: in production the Express catch-all injects it per request; in dev,
 * webpack-dev-server bakes it into the HtmlWebpackPlugin HTML at server start
 * (webpack/web.development.config.js), mirroring the same env semantics. The
 * value is read at call time (never cached) so a fresh page load always
 * reflects the serving process's configuration.
 *
 * Semantics:
 *   - content === "0"        → gate OFF (auth not enforced)
 *   - any other content      → gate ON
 *   - tag absent entirely    → gate ON (fail closed)
 *
 * The tag is absent only where no server computed it — jsdom test documents
 * start empty. Failing closed there preserves enforced behaviour in tests: the
 * flag can only ever be turned off by an explicit, rendered `content="0"`.
 */
export function isWebAuthEnforced(): boolean {
  const tag = document.querySelector('meta[name="enforce-web-auth"]');
  if (!tag) return true; // absent = non-production → fail closed
  return tag.getAttribute("content") !== "0";
}
