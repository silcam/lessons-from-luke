module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/"],
  watchPathIgnorePatterns: ["strings", "old", "cypress"]
};
