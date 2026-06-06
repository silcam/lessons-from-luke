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

// Load the compiled server app (avoids ESM issues with Jest's CJS runner)
const distPath = path.join(__dirname, "..", "dist", "server");
const serverApp = require(path.join(distPath, "serverApp")).default;

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const app = serverApp({ silent: true });
const server = http.createServer(app);

server.listen(0, "127.0.0.1", () => {
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
