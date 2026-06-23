const { defineConfig } = require("cypress");
const path = require("path");

let secrets = {};
try {
  secrets = require(path.resolve(__dirname, "secrets.json"));
} catch {
  // secrets.json may not exist in CI; fall back to env vars
}

// Production-mode smoke harness. Unlike cypress.config.js (the dev-mode E2E
// suite served by webpack-dev-server on :8080 with no helmet), this points at
// the Express PRODUCTION server on :8081, which serves the built SPA *with* its
// real Content-Security-Policy. It uses its own support file (no DB-reset
// beforeEach, since /api/test/reset-storage is test-only and 404s in prod) and
// its own spec directory so it never collides with the dev-mode specs.
module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8081",
    specPattern: "cypress/prod/**/*.spec.js",
    supportFile: "cypress/support/prod-e2e.js",
    defaultCommandTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    // CRITICAL: without this, Cypress strips the Content-Security-Policy header
    // from every response (its default), so the policy this whole harness exists
    // to test would never be enforced and the smoke would pass even against the
    // bug. `true` keeps the CSP intact and enforced — Cypress strips only the
    // directives that interfere with it and injects its own nonce into
    // script-src so its harness scripts still run, while leaving `style-src`
    // (the directive that blocked styled-components) fully enforced.
    experimentalCspAllowList: true,
    env: {
      adminEmail: process.env.CYPRESS_ADMIN_EMAIL ?? secrets.adminEmail ?? "admin@example.com",
      adminPassword: process.env.CYPRESS_ADMIN_PASSWORD ?? secrets.adminPassword ?? "",
    },
    setupNodeEvents() {
      // No plugin configuration needed
    },
  },
});
