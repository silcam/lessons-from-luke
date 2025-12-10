module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/", "<rootDir>/cypress/"],
  watchPathIgnorePatterns: ["strings", "old", "cypress"],
  globalSetup: "<rootDir>/src/server/jestGlobalSetup.ts",
  forceExit: true
};
