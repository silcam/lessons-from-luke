const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    specPattern: "cypress/integration/**/*.spec.js",
    defaultCommandTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    setupNodeEvents(on, config) {
      // No plugin configuration needed
    }
  }
});
