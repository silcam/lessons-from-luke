module.exports = {
  // The server project's tests all share one test database and reset its
  // sequences via process-global `ALTER SEQUENCE ... RESTART` DDL (see
  // TransactionalTestStorage), so they MUST run serially — parallel workers
  // exhaust connections and corrupt each other's sequence/row state. Every
  // test:* script already passes --runInBand; pinning maxWorkers here makes a
  // bare `npx jest` or IDE test runner safe too.
  maxWorkers: 1,
  projects: [
    {
      displayName: "server",
      preset: "ts-jest",
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react" } }],
      },
      // Redirect ESM-only better-auth packages to CJS shims so Jest's CommonJS
      // runner can load them without hitting the "Cannot use import statement
      // outside a module" ESM parse error.
      // - better-auth: stub betterAuth() factory (unit tests mock getAuth() directly)
      // - better-auth/node: real CJS wrapper around better-call/node (which IS CJS)
      // Integration tests use real better-auth via a compiled child-process server
      // (jestIntegrationGlobalSetup.ts) and have their own config without these shims.
      moduleNameMapper: {
        "^better-auth$": "<rootDir>/src/server/__mocks__/better-auth.cjs",
        "^better-auth/node$": "<rootDir>/src/server/__mocks__/better-auth-node.cjs",
      },
      testEnvironment: "node",
      globalSetup: "<rootDir>/src/server/jestGlobalSetup.ts",
      setupFilesAfterEnv: ["<rootDir>/src/server/jestSetupAfterEnv.ts"],
      testPathIgnorePatterns: [
        "/node_modules/",
        "<rootDir>/test/",
        "<rootDir>/cypress/",
        "<rootDir>/src/frontend/",
        "<rootDir>/src/desktop/",
        "<rootDir>/dist/",
        "<rootDir>/dist-desktop/",
        "<rootDir>/.desktop-build-stage/",
        "<rootDir>/.claude/",
        "\\.integration\\.test\\.tsx?$",
      ],
      modulePathIgnorePatterns: ["<rootDir>/dist-desktop/", "<rootDir>/.desktop-build-stage/"],
      fakeTimers: {
        // When tests call jest.useFakeTimers(), only fake setTimeout/clearTimeout.
        // Excluding setInterval/clearInterval/setImmediate prevents the postgres
        // connection pool's keep-alive timers from being hijacked, which caused
        // connection corruption after jest.runAllTimers() in waitFor.test.ts.
        doNotFake: ["setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick"],
      },
    },
    {
      displayName: "frontend",
      preset: "ts-jest",
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react" } }],
      },
      testEnvironment: "jsdom",
      setupFilesAfterEnv: ["<rootDir>/src/frontend/jestSetupAfterEnv.ts"],
      // Frontend/desktop tests don't use postgres, so we can fake all timers
      fakeTimers: {},
      testMatch: ["**/*src/frontend/**/*.test.{ts,tsx}", "**/*src/desktop/**/*.test.{ts,tsx}"],
      testPathIgnorePatterns: [
        "/node_modules/",
        "<rootDir>/test/",
        "<rootDir>/cypress/",
        "<rootDir>/dist-desktop/",
        "<rootDir>/.desktop-build-stage/",
        "\\.integration\\.test\\.tsx?$",
      ],
      modulePathIgnorePatterns: ["<rootDir>/dist-desktop/", "<rootDir>/.desktop-build-stage/"],
      moduleNameMapper: {
        // Mock electron APIs
        "^electron$": "<rootDir>/__mocks__/electron.ts",
        // Handle CSS/assets
        "\\.(css|less|scss|svg|png|jpg|jpeg|gif|ico)$": "<rootDir>/__mocks__/styleMock.js",
        // Redirect ESM-only better-auth/react to a CJS shim so Jest's CommonJS
        // runner can load it. Unit tests mock authClient directly via jest.mock()
        // with { virtual: true }; this shim only needs to satisfy the static import
        // in currentUserSlice.ts.
        "^better-auth/react$": "<rootDir>/src/frontend/__mocks__/better-auth-react.cjs",
        // Redirect authClient imports to a jest.fn()-based manual mock so that
        // unit tests can call mockResolvedValue() without the virtual-mock
        // keying mismatch (virtual mocks key on the raw path, not the resolved
        // absolute path, so the slice's import and the test's require end up
        // consulting different registry entries).
        ".*/web/auth/authClient": "<rootDir>/src/frontend/__mocks__/authClient.ts",
      },
    },
  ],
  // Top-level settings apply to all projects for coverage collection
  forceExit: true,
  modulePathIgnorePatterns: ["<rootDir>/dist-desktop/", "<rootDir>/.desktop-build-stage/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.d.ts",
    // Truly untestable Electron entry points:
    "!src/desktop/main*.ts",
    "!src/desktop/DesktopApp.ts",
    "!src/desktop/DesktopAPIServer.ts",
    "!src/desktop/localFixtures/**",
    // Server infra not under test:
    "!src/server/tasks/**",
    "!src/server/server.ts",
    "!src/server/testHelper.ts",
    "!src/server/util/sampleSecrets.ts",
    "!src/server/jestGlobalSetup.ts",
    "!src/server/jestSetupAfterEnv.ts",
    // Web/desktop app entry points (no meaningful unit tests):
    "!src/frontend/webApp.tsx",
    "!src/frontend/desktopApp.tsx",
    // Pure visual animation components — no testable logic:
    "!src/frontend/common/base-components/LoadingBox.tsx",
    "!src/frontend/common/base-components/LoadingDots.tsx",
    "!src/frontend/common/base-components/LoadingSwirl.tsx",
    "!src/frontend/common/base-components/LoadingSnake.tsx",
    // Loading overlay / banner display — rendering only:
    "!src/frontend/common/api/AppLoadingBar.tsx",
    "!src/frontend/common/banners/Banners.tsx",
    // Route definitions — integration-level only, not unit testable:
    "!src/frontend/web/MainRouter.tsx",
    // Pure layout pages with no extractable logic:
    "!src/frontend/web/home/AdminHome.tsx",
    // Complex lesson page views — UI only, no standalone logic:
    "!src/frontend/web/lessons/DocStringsPage.tsx",
    "!src/frontend/web/lessons/LessonEditor.tsx",
    "!src/frontend/web/lessons/LessonPage.tsx",
    "!src/frontend/web/lessons/LessonStringEditor.tsx",
    "!src/frontend/web/lessons/UpdateIssuesPage.tsx",
    // Pure rendering components without testable logic:
    "!src/frontend/common/translate/TranslateIndex.tsx",
    "!src/frontend/common/translate/DocPreview.tsx",
    "!src/frontend/common/translate/TStringHistoryView.tsx",
    "!src/frontend/common/translate/DesktopSyncMessage.tsx",
    "!src/frontend/common/translate/TranslateHome.tsx",
    "!src/frontend/common/translate/TranslateLesson.tsx",
    "!src/frontend/common/translate/TranslateWithPreview.tsx",
    "!src/frontend/common/translate/TranslateFallback.tsx",
    "!src/frontend/desktopFrontend/downSync/DownSyncPage.tsx",
    "!src/frontend/desktopFrontend/downSync/SyncCodeForm.tsx",
    // Web-only page views not covered by unit tests:
    "!src/frontend/web/languages/LanguageView.tsx",
    "!src/frontend/web/languages/AddLanguageForm.tsx",
    "!src/frontend/web/languages/ToggleMotherTongue.tsx",
    "!src/frontend/web/languages/UploadUsfmForm.tsx",
    "!src/frontend/web/languages/UsfmImportResultPage.tsx",
    "!src/frontend/web/lessons/UploadLessonForm.tsx",
    "!src/frontend/web/documents/useGetDocument.tsx",
    // Auth config glue — getAuth() factory around the better-auth constructor + env switch;
    // sign-in/guard behavior is covered by auth.integration.test.ts, not the unit coverage report:
    "!src/server/auth/auth.ts",
    // Auth client glue — better-auth React client construction; behavior covered by
    // currentUserSlice.test.ts mocks and Cypress e2e, not unit tests:
    "!src/frontend/web/auth/authClient.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  watchPathIgnorePatterns: ["strings", "old", "cypress"],
};
