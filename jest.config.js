module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/", "<rootDir>/cypress/"],
  watchPathIgnorePatterns: ["strings", "old", "cypress"],
  globalSetup: "<rootDir>/src/server/jestGlobalSetup.ts",
  setupFilesAfterEnv: ["<rootDir>/src/server/jestSetupAfterEnv.ts"],
  forceExit: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/frontend/**",
    "!src/desktop/main*.ts",
    "!src/desktop/DesktopApp.ts"
  ]
};
