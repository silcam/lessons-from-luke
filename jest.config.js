module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/", "<rootDir>/cypress/", "<rootDir>/src/frontend/", "<rootDir>/src/desktop/"],
  watchPathIgnorePatterns: ["strings", "old", "cypress"],
  globalSetup: "<rootDir>/src/server/jestGlobalSetup.ts",
  setupFilesAfterEnv: ["<rootDir>/src/server/jestSetupAfterEnv.ts"],
  forceExit: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts",
    "!src/frontend/**",
    "!src/desktop/main*.ts",
    "!src/desktop/DesktopApp.ts",
    "!src/desktop/DesktopAPIServer.ts",
    "!src/desktop/WebAPIClientForDesktop.ts",
    "!src/desktop/LocalStorage.ts",
    "!src/desktop/controllers/**",
    "!src/desktop/localFixtures/**",
    "!src/server/tasks/**",
    "!src/server/server.ts",
    "!src/server/testHelper.ts",
    "!src/server/util/sampleSecrets.ts"
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
