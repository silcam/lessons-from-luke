const { defineConfig } = require("cypress");
const path = require("path");

let secrets = {};
try {
  secrets = require(path.resolve(__dirname, "secrets.json"));
} catch {
  // secrets.json may not exist in CI; fall back to env vars
}

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    specPattern: "cypress/integration/**/*.{spec,cy}.{js,ts}",
    defaultCommandTimeout: 10000,
    // Wide enough that the translate page's right pane (min content ~1010px)
    // never overflows the viewport — autoFocus scrolling an overflow:hidden
    // row would otherwise displace the lesson-picker column mid-click.
    viewportWidth: 1280,
    viewportHeight: 800,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    env: {
      adminEmail: process.env.CYPRESS_ADMIN_EMAIL ?? secrets.adminEmail ?? "admin@example.com",
      adminPassword: process.env.CYPRESS_ADMIN_PASSWORD ?? secrets.adminPassword ?? "",
    },
    setupNodeEvents() {
      // No plugin configuration needed
    },
  },
});
