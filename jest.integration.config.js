// Opt-in integration suite. Runs tests that hit real external binaries (e.g.
// LibreOffice via `soffice`) and are excluded from the default `yarn test` run.
// Invoke with `yarn test:integration`.

module.exports = {
  displayName: "integration",
  preset: "ts-jest",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react" } }],
  },
  testEnvironment: "node",
  globalSetup: "<rootDir>/src/server/jestGlobalSetup.ts",
  setupFilesAfterEnv: ["<rootDir>/src/server/jestSetupAfterEnv.ts"],
  testMatch: ["<rootDir>/src/**/*.integration.test.{ts,tsx}"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/test/",
    "<rootDir>/cypress/",
    "<rootDir>/dist-desktop/",
    "<rootDir>/.desktop-build-stage/",
  ],
  modulePathIgnorePatterns: ["<rootDir>/dist-desktop/", "<rootDir>/.desktop-build-stage/"],
  fakeTimers: {
    doNotFake: ["setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick"],
  },
  forceExit: true,
};
