const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    specPattern: "cypress/integration/**/*.spec.js",
    setupNodeEvents(on, config) {
      // No plugin configuration needed
    }
  }
});
