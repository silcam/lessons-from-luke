const base = require('./jest.config');

module.exports = {
  ...base,
  testEnvironment: "jsdom",
  // Do NOT run DB setup for frontend tests
  globalSetup: undefined,
  setupFilesAfterEnv: undefined,
  // Only run frontend and desktop frontend tests
  testMatch: [
    "**/*src/frontend/**/*.test.{ts,tsx}",
    "**/*src/desktop/**/*.test.{ts,tsx}"
  ],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/", "<rootDir>/cypress/"],
  // ts-jest needs jsx enabled since base tsconfig.json does not set it
  globals: {
    'ts-jest': {
      tsConfig: {
        jsx: 'react'
      }
    }
  },
  moduleNameMapper: {
    // Mock electron APIs
    "^electron$": "<rootDir>/__mocks__/electron.ts",
    // Handle CSS/assets if needed
    "\\.(css|less|scss)$": "<rootDir>/__mocks__/styleMock.js",
    // Handle SVG and other image assets
    "\\.(svg|png|jpg|jpeg|gif|ico)$": "<rootDir>/__mocks__/styleMock.js"
  }
};
