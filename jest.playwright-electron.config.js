module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/desktop/**/*.test.ts"],
  watchPathIgnorePatterns: ["strings", "old", "cypress", "test/desktop"],
  // Keep jest's haste/snapshot scan out of build-output dirs. electron-builder
  // emits `dist-desktop/*.snap` (a Snapcraft package, not a jest snapshot);
  // without this, a local `build-desktop` before the e2e run makes jest report
  // it as an "obsolete snapshot" and exit non-zero even though every test
  // passes. These dirs never exist in the CI desktop-e2e job (which only runs
  // `tsc -b` → dist/), so this is purely local-robustness.
  modulePathIgnorePatterns: ["<rootDir>/dist-desktop/", "<rootDir>/dist/"],
  // Electron processes spawned by `electron.launch` can leak when a test times
  // out before `app.close()` runs. Without forceExit, jest then prints "Jest
  // did not exit one second after the test run has completed" and waits
  // forever for the leaked handles — which in CI burns the full job timeout.
  forceExit: true,
};
