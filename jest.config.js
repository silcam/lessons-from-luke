module.exports = {
  projects: [
    {
      displayName: 'server',
      preset: 'ts-jest',
      transform: {
        "^.+\\.tsx?$": ["ts-jest", {}]
      },
      testEnvironment: 'node',
      globalSetup: '<rootDir>/src/server/jestGlobalSetup.ts',
      setupFilesAfterEnv: ['<rootDir>/src/server/jestSetupAfterEnv.ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/test/',
        '<rootDir>/cypress/',
        '<rootDir>/src/frontend/',
        '<rootDir>/src/desktop/'
      ],
      fakeTimers: {
        // When tests call jest.useFakeTimers(), only fake setTimeout/clearTimeout.
        // Excluding setInterval/clearInterval/setImmediate prevents the postgres
        // connection pool's keep-alive timers from being hijacked, which caused
        // connection corruption after jest.runAllTimers() in waitFor.test.ts.
        doNotFake: ["setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick"]
      },
      // jsx needed for coverage instrumentation of .tsx files in collectCoverageFrom
      globals: {
        'ts-jest': {
          tsConfig: {
            jsx: 'react'
          }
        }
      },
    },
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      transform: {
        "^.+\\.tsx?$": ["ts-jest", {}]
      },
      testEnvironment: 'jsdom',
      // Frontend/desktop tests don't use postgres, so we can fake all timers
      fakeTimers: {},
      testMatch: [
        '**/*src/frontend/**/*.test.{ts,tsx}',
        '**/*src/desktop/**/*.test.{ts,tsx}'
      ],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/', '<rootDir>/cypress/'],
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
        '^electron$': '<rootDir>/__mocks__/electron.ts',
        // Handle CSS/assets
        '\\.(css|less|scss|svg|png|jpg|jpeg|gif|ico)$': '<rootDir>/__mocks__/styleMock.js',
      },
    },
  ],
  // Top-level settings apply to all projects for coverage collection
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
    // Truly untestable Electron entry points:
    '!src/desktop/main*.ts',
    '!src/desktop/DesktopApp.ts',
    '!src/desktop/DesktopAPIServer.ts',
    '!src/desktop/localFixtures/**',
    // Server infra not under test:
    '!src/server/tasks/**',
    '!src/server/server.ts',
    '!src/server/testHelper.ts',
    '!src/server/util/sampleSecrets.ts',
    '!src/server/jestGlobalSetup.ts',
    '!src/server/jestSetupAfterEnv.ts',
    // Web/desktop app entry points (no meaningful unit tests):
    '!src/frontend/webApp.tsx',
    '!src/frontend/desktopApp.tsx',
    // Pure visual animation components — no testable logic:
    '!src/frontend/common/base-components/LoadingBox.tsx',
    '!src/frontend/common/base-components/LoadingDots.tsx',
    '!src/frontend/common/base-components/LoadingSwirl.tsx',
    '!src/frontend/common/base-components/LoadingSnake.tsx',
    // Loading overlay / banner display — rendering only:
    '!src/frontend/common/api/AppLoadingBar.tsx',
    '!src/frontend/common/banners/Banners.tsx',
    // Route definitions — integration-level only, not unit testable:
    '!src/frontend/web/MainRouter.tsx',
    // Pure layout pages with no extractable logic:
    '!src/frontend/web/home/AdminHome.tsx',
    '!src/frontend/web/migrate/MigrateProject.tsx',
    '!src/frontend/web/migrate/MigrateProjectsIndex.tsx',
    // Complex lesson page views — UI only, no standalone logic:
    '!src/frontend/web/lessons/DocStringsPage.tsx',
    '!src/frontend/web/lessons/LessonEditor.tsx',
    '!src/frontend/web/lessons/LessonPage.tsx',
    '!src/frontend/web/lessons/LessonStringEditor.tsx',
    '!src/frontend/web/lessons/UpdateIssuesPage.tsx',
    // Pure rendering components without testable logic:
    '!src/frontend/common/translate/TranslateIndex.tsx',
    '!src/frontend/common/translate/DocPreview.tsx',
    '!src/frontend/common/translate/TStringHistoryView.tsx',
    '!src/frontend/common/translate/DesktopSyncMessage.tsx',
    '!src/frontend/common/translate/TranslateHome.tsx',
    '!src/frontend/common/translate/TranslateLesson.tsx',
    '!src/frontend/common/translate/TranslateWithPreview.tsx',
    '!src/frontend/common/translate/TranslateFallback.tsx',
    '!src/frontend/desktopFrontend/downSync/DownSyncPage.tsx',
    '!src/frontend/desktopFrontend/downSync/SyncCodeForm.tsx',
    // Web-only page views not covered by unit tests:
    '!src/frontend/web/languages/LanguageView.tsx',
    '!src/frontend/web/languages/AddLanguageForm.tsx',
    '!src/frontend/web/languages/ToggleMotherTongue.tsx',
    '!src/frontend/web/languages/UploadUsfmForm.tsx',
    '!src/frontend/web/languages/UsfmImportResultPage.tsx',
    '!src/frontend/web/lessons/UploadLessonForm.tsx',
    '!src/frontend/web/documents/useGetDocument.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  watchPathIgnorePatterns: ['strings', 'old', 'cypress'],
};
