/**
 * Integration test server launcher.
 *
 * Starts the Express server (from compiled dist/server/) on a random port
 * and writes the port to stdout so the calling process can connect.
 *
 * Must be run with NODE_ENV=test so the server uses PGTestStorage and
 * the better-auth pool connects to the test database.
 *
 * Usage: node scripts/integrationTestServer.js
 * The script writes the port number to stdout (as JSON: {"port": N}) and then
 * keeps running until it receives SIGTERM/SIGINT.
 */
"use strict";

const path = require("path");
const http = require("http");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

// Bind a fixed loopback port (overridable) so we can set BETTER_AUTH_URL to this
// server's own origin BEFORE constructing the app — and therefore before the
// cached better-auth instance is built. A defined BETTER_AUTH_URL populates
// better-auth's trustedOrigins, mirroring production's origin/CSRF enforcement
// (BETTER_AUTH_URL is required in production). Without it trustedOrigins is empty
// and cross-origin checks are inert, so the CSRF integration test can't pass.
const PORT = Number(process.env.INTEGRATION_TEST_PORT) || 8099;
process.env.BETTER_AUTH_URL = `http://127.0.0.1:${PORT}`;
// Force better-auth's origin/CSRF enforcement on (NODE_ENV=test would otherwise
// skip it), so the integration suite exercises the production trustedOrigins
// behavior. See src/server/auth/auth.ts (advanced.disableOriginCheck).
process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
// Keep rate limiting on for the integration suite's ">10 attempts → 429" test
// (auth.ts disables it under NODE_ENV=test by default so e2e isn't throttled).
process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = "1";

// Load the compiled server app (avoids ESM issues with Jest's CJS runner)
const distPath = path.join(__dirname, "..", "dist", "server");
const serverApp = require(path.join(distPath, "serverApp")).default;

const app = serverApp({ silent: true });
const server = http.createServer(app);

server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  // Signal readiness by writing port to stdout
  process.stdout.write(JSON.stringify({ port }) + "\n");
});

// Keep alive until terminated
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
