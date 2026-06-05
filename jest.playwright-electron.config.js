module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/desktop/**/*.test.ts"],
  watchPathIgnorePatterns: ["strings", "old", "cypress", "test/desktop"],
  // Electron processes spawned by `electron.launch` can leak when a test times
  // out before `app.close()` runs. Without forceExit, jest then prints "Jest
  // did not exit one second after the test run has completed" and waits
  // forever for the leaked handles — which in CI burns the full job timeout.
  forceExit: true,
};
