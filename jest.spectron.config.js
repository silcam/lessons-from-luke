module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/desktop/**/*.test.ts"],
  watchPathIgnorePatterns: ["strings", "old", "cypress", "test/desktop"]
};
