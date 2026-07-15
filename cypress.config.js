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
    specPattern: "cypress/integration/**/*.spec.{js,ts}",
    defaultCommandTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    env: {
      adminEmail: process.env.CYPRESS_ADMIN_EMAIL ?? secrets.adminEmail ?? "admin@example.com",
      adminPassword: process.env.CYPRESS_ADMIN_PASSWORD ?? secrets.adminPassword ?? "",
    },
    setupNodeEvents() {
      // No plugin configuration needed
    },
  },
});
