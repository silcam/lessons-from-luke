# Node 12 → 24 Migration Plan

## Summary

Upgrade Lessons from Luke from Node 12 to Node 24, including Webpack 4→5, Electron 7→33, TypeScript 3.7→5.x, Jest 24→29, and Cypress 4→13. Uses **Node 20 LTS as stepping stone** before final Node 24 jump.

**Estimated Duration**: 4-5 weeks

---

## Current State

| Component | Current | Target | Risk |
|-----------|---------|--------|------|
| Node | 12 | 24 | HIGH |
| TypeScript | 3.7.2 | 5.x | MED |
| Webpack | 4.41.2 | 5.x | MED |
| Jest | 24.9.0 | 29.x | MED |
| Cypress | 4.1.0 | 13.x | MED |
| Electron | 7.2.4 | 33.x | HIGH |
| libxmljs2 | 0.22.0 | 0.37+ | HIGH |

---

## Phase 0: Preparation

**Goal**: Establish baseline, set up dual-version CI

### Tasks
1. Verify tests pass on Node 12: `yarn test --watchAll=false`
2. Create migration branch: `git checkout -b feature/node-24-migration`
3. Update CI to matrix build (Node 12 + 20, allow 20 to fail initially)

### Files to Modify
- `.github/workflows/build.yml` - Add test job with matrix strategy

---

## Phase 1: Pure Tooling

**Goal**: Upgrade tools with minimal breaking changes

### Dependencies
| Package | From | To |
|---------|------|-----|
| nodemon | 1.19.4 | 3.x |
| concurrently | 5.0.0 | 9.x |

### Validation
- `yarn dev-web` starts successfully
- Hot reload works

---

## Phase 2: TypeScript Upgrade

**Goal**: Foundation for type safety

### Dependencies
| Package | From | To |
|---------|------|-----|
| typescript | 3.7.2 | 5.7.x |
| ts-loader | 6.2.1 | 9.x |
| @types/node | (old) | 20.x |

### Breaking Changes to Address
- `useUnknownInCatchVariables` - may require type narrowing in catch blocks
- Update `target` from `es2017` to `es2022`
- Update various `@types/*` packages for TS 5 compatibility

### Files to Modify
- `package.json`
- `tsconfig.json` - base config
- `src/core/tsconfig.json`
- `src/server/tsconfig.json`
- `src/frontend/tsconfig.json`
- `src/desktop/tsconfig.json`

### Validation
- `tsc -b` completes without errors

---

## Phase 3: Jest Migration

**Goal**: Get unit tests green on Node 20

### Dependencies
| Package | From | To |
|---------|------|-----|
| jest | 24.9.0 | 29.x |
| ts-jest | 24.1.0 | 29.x |
| @types/jest | 24.0.22 | 29.x |

### Config Migration
```javascript
// Old format (jest.config.js)
{ preset: "ts-jest", ... }

// New format - add transform block
{
  preset: "ts-jest",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { /* options */ }]
  },
  ...
}
```

### Files to Modify
- `package.json`
- `jest.config.js`
- `src/server/jestGlobalSetup.ts` (if needed)

### Validation
- `yarn test --watchAll=false` passes all tests

---

## Phase 4: Webpack 5 Migration

**Goal**: Dev and production builds work

### Dependencies
| Package | From | To |
|---------|------|-----|
| webpack | 4.41.2 | 5.x |
| webpack-cli | 3.3.10 | 5.x |
| webpack-dev-server | 3.9.0 | 5.x |
| webpack-dev-middleware | 3.7.2 | 7.x |
| html-webpack-plugin | 3.2.0 | 5.x |
| file-loader | 5.1.0 | REMOVE |

### Breaking Changes

**1. devServer config** (`webpack/web.development.config.js:9`):
```javascript
// Old
devServer: { contentBase: false, ... }

// New
devServer: { static: false, ... }
```

**2. Hash placeholders** (`webpack/web.production.config.js:8`):
```javascript
// Old
filename: "web.[hash].bundle.js"

// New
filename: "web.[contenthash].bundle.js"
```

**3. Asset modules** replace file-loader (`webpack/base.config.js`):
```javascript
// Old
{ test: /\.(jpg|png|svg)$/, use: "file-loader" }

// New
{ test: /\.(jpg|png|svg)$/, type: "asset/resource" }
```

### Files to Modify
- `package.json`
- `webpack/base.config.js`
- `webpack/web.base.config.js`
- `webpack/web.development.config.js`
- `webpack/web.production.config.js`
- `webpack/desktop.base.config.js`
- `webpack/desktop.development.config.js`
- `webpack/desktop.production.config.js`

### Validation
- `yarn dev-web` starts with hot reload
- `yarn build-server` produces valid bundle

---

## Phase 5: Cypress Upgrade

**Goal**: E2E tests pass

### Dependencies
| Package | From | To |
|---------|------|-----|
| cypress | 4.1.0 | 13.x |
| cypress-file-upload | 3.5.3 | REMOVE (built-in now) |

### Config Migration
```javascript
// Old: cypress.json
{ "baseUrl": "http://localhost:8080" }

// New: cypress.config.js
const { defineConfig } = require('cypress')
module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
    specPattern: 'cypress/integration/**/*.spec.js'
  }
})
```

### Files to Modify
- `package.json`
- `cypress.json` → `cypress.config.js`
- `cypress/plugins/index.js` (migrate to setupNodeEvents)
- `cypress/support/commands.js` (update file upload usage)

### Validation
- All 5 E2E test specs pass

---

## Phase 6: libxmljs2 Native Module

**Goal**: ODT processing works on Node 20/24

### Strategy
1. **Try upgrade first**: `yarn add libxmljs2@^0.37.0`
2. Verify prebuilt binary installs (no compile)
3. Run XML tests: `yarn test src/server/xml`

### Fallback Plan (if upgrade fails)
Replace with `fast-xml-parser` (pure JS, no native deps)
- Rewrite `src/server/xml/parse.ts`
- Rewrite `src/server/xml/mergeXml.ts`
- Estimated: +2-3 days

### Files Potentially Affected
- `package.json`
- `src/server/xml/parse.ts`
- `src/server/xml/mergeXml.ts`

---

## Phase 7: Node Version Flip to 20

**Goal**: Primary development on Node 20

### Tasks
1. Update `.nvmrc` to `20`
2. Update CI primary version to 20
3. Clean install: `rm -rf node_modules yarn.lock && yarn install`
4. Full test suite validation

### Files to Modify
- `.nvmrc`
- `.github/workflows/build.yml`
- `CLAUDE.md` (update instructions)

---

## Phase 8: Electron Upgrade (Sub-project)

**Goal**: Desktop app on modern Electron

### 8A: Electron 7 → 14 (Security Boundary)

| Package | From | To |
|---------|------|-----|
| electron | 7.2.4 | 14.x |
| @electron/remote | N/A | 2.x (NEW) |

**Key Change** (`src/desktop/DesktopApp.ts:142-144`):
```javascript
// Current
webPreferences: { nodeIntegration: true }

// Add explicit settings + remote module
webPreferences: {
  nodeIntegration: true,
  contextIsolation: false,  // explicit
  enableRemoteModule: true
}

// Main process: initialize @electron/remote
require('@electron/remote/main').initialize();
require('@electron/remote/main').enable(mainWindow.webContents);
```

### 8B: Electron 14 → 23
- Update electron helper packages
- Handle sandbox changes

### 8C: Electron 23 → 33
- Update electron-builder to 25.x
- Final security hardening

### 8D: Replace Spectron with Playwright

```javascript
// Old (Spectron) - test/desktop/desktopApp.test.ts
const app = new Application({ path: electronPath, args: [...] });
await app.start();
await app.client.waitForVisible("h1=Online");

// New (Playwright)
import { _electron as electron } from 'playwright';
const app = await electron.launch({ args: [...] });
const window = await app.firstWindow();
await window.locator('h1:text("Online")').waitFor();
```

### Files to Modify
- `package.json`
- `src/desktop/DesktopApp.ts`
- `src/desktop/main.ts`
- `test/desktop/desktopApp.test.ts` → migrate to Playwright
- `jest.spectron.config.js` → REMOVE
- `build-desktop.js` (if electron-builder changes needed)

---

## Phase 9: Final Node 24 Upgrade

**Goal**: Production on Node 24

### Tasks
1. Update `.nvmrc` to `24`
2. Update CI to Node 24
3. Full validation: tests, dev, build
4. Update documentation

---

## CI Configuration (Target State)

```yaml
name: Build and Test

on:
  push:
    branches: [master, feature/*]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node-version: [20, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'yarn'
      - run: yarn install --frozen-lockfile
      - run: yarn tsc -b --noEmit
      - run: yarn test --watchAll=false
      - run: yarn build-server

  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: yarn install
      - uses: cypress-io/github-action@v6
        with:
          start: yarn dev-web
          wait-on: 'http://localhost:8080'

  build-desktop:
    runs-on: macos-latest
    needs: test
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: yarn install
      - run: yarn build-desktop
      - uses: actions/upload-artifact@v4
        with:
          name: desktop-build
          path: dist-desktop/
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| libxmljs2 compile fails | fast-xml-parser fallback ready |
| Electron upgrade breaks | Incremental path (7→14→23→33) |
| Webpack 5 issues | Keep webpack 4 branch |
| Test failures | CI on both Node versions |

---

## Critical Files Summary

| File | Phase | Change |
|------|-------|--------|
| `.nvmrc` | 7, 9 | 12 → 20 → 24 |
| `package.json` | All | Dependency updates |
| `.github/workflows/build.yml` | 0, 7, 9 | Matrix CI |
| `jest.config.js` | 3 | Jest 29 format |
| `cypress.json` → `cypress.config.js` | 5 | New config format |
| `tsconfig.json` | 2 | TS 5 settings |
| `webpack/*.config.js` | 4 | Webpack 5 syntax |
| `src/desktop/DesktopApp.ts` | 8 | Security model |
| `src/server/xml/*.ts` | 6 | libxmljs2 upgrade |
| `test/desktop/desktopApp.test.ts` | 8D | Playwright migration |
