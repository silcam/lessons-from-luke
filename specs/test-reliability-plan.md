# Test Reliability & Isolation Plan

## Executive Summary

This plan addresses three goals:
1. **Proper test isolation** - Eliminate intermittent failures from shared database state
2. **Reliability verification** - Prove the test suite is deterministic
3. **Coverage expansion** - Achieve >90% test coverage

## Current State Analysis

### Infrastructure
- **Jest**: 21 test files, uses `ts-jest`, global setup resets fixtures once
- **Cypress**: 5 E2E spec files, has `/api/test/reset-storage` endpoint (unused)
- **Database**: PostgreSQL with `PGTestStorage` class, `postgres` library
- **Migrations**: `node-migrate` v1.6.2 with global `.migrate` file (problematic)

### Root Causes of Intermittent Failures
1. **No per-test isolation**: Fixtures load once via `jestGlobalSetup.ts`, tests share state
2. **Migration state mismatch**: `.migrate` file is global, test DB schema can drift
3. **Cypress state pollution**: E2E tests don't reset between runs

---

## Phase 1: Fix Migration System

### Problem
`node-migrate` stores state in `./.migrate` regardless of target database. Running migrations against dev marks them complete, preventing them from running against test.

### Solution
Configure environment-specific migration state files.

### Implementation

**1.1 Create migration wrapper script**

```javascript
// scripts/migrate.js
const { execSync } = require('child_process');
const env = process.env.TEST_DB ? 'test' : 'dev';
const stateFile = `.migrate-${env}`;

execSync(`npx migrate --state-file=${stateFile} up`, {
  stdio: 'inherit',
  env: { ...process.env }
});
```

**1.2 Update package.json scripts**

```json
{
  "scripts": {
    "migrate": "node scripts/migrate.js",
    "migrate:dev": "node scripts/migrate.js",
    "migrate:test": "TEST_DB=true node scripts/migrate.js"
  }
}
```

**1.3 Add `.migrate-*` to .gitignore**

```
.migrate-dev
.migrate-test
```

**1.4 Update Jest global setup to run migrations**

```typescript
// src/server/jestGlobalSetup.ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Ensure test DB schema is current
  execSync('yarn migrate:test', { stdio: 'inherit' });

  // Then load fixtures
  await pgLoadFixtures();
  console.log("✓ Test database reset to fixtures");
}
```

### Acceptance Criteria
- [ ] `yarn migrate` affects only dev DB, uses `.migrate-dev`
- [ ] `yarn migrate:test` affects only test DB, uses `.migrate-test`
- [ ] Jest global setup runs migrations before fixtures
- [ ] Fresh clone can run tests without manual migration steps

---

## Phase 2: Transaction-Based Test Isolation (Jest)

### Strategy
Wrap each test in a database transaction that rolls back after the test completes. This provides ~5ms isolation overhead per test.

### Implementation

**2.1 Create transaction-aware test storage**

```typescript
// src/server/storage/TransactionalTestStorage.ts
import postgres, { Sql } from 'postgres';
import { PGTestStorage } from './PGStorage';
import { getSecrets } from '../util/secrets';

export class TransactionalTestStorage extends PGTestStorage {
  private transactionSql: Sql | null = null;
  private rootSql: Sql;

  constructor() {
    super();
    this.rootSql = this.sql;
  }

  async beginTransaction(): Promise<void> {
    // Create a new connection for this transaction
    const secrets = getSecrets();
    this.transactionSql = postgres(secrets.testDb);

    // Start transaction - all queries will use this connection
    await this.transactionSql`BEGIN`;

    // Replace the sql instance used by all queries
    (this as any).sql = this.transactionSql;
  }

  async rollbackTransaction(): Promise<void> {
    if (this.transactionSql) {
      await this.transactionSql`ROLLBACK`;
      await this.transactionSql.end();
      this.transactionSql = null;

      // Restore root connection
      (this as any).sql = this.rootSql;
    }
  }

  async close(): Promise<void> {
    if (this.transactionSql) {
      await this.rollbackTransaction();
    }
    await this.rootSql.end();
  }
}
```

**2.2 Create Jest setup file for transaction management**

```typescript
// src/server/jestSetupAfterEnv.ts
import { TransactionalTestStorage } from './storage/TransactionalTestStorage';

declare global {
  var testStorage: TransactionalTestStorage;
}

// Create single storage instance for all tests
let storage: TransactionalTestStorage;

beforeAll(async () => {
  storage = new TransactionalTestStorage();
  global.testStorage = storage;
});

beforeEach(async () => {
  await storage.beginTransaction();
});

afterEach(async () => {
  await storage.rollbackTransaction();
});

afterAll(async () => {
  await storage.close();
});
```

**2.3 Update jest.config.js**

```javascript
module.exports = {
  // ... existing config
  globalSetup: '<rootDir>/src/server/jestGlobalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/src/server/jestSetupAfterEnv.ts'],
};
```

**2.4 Update test files to use global storage**

Tests that currently create their own storage instance should use the global transactional storage:

```typescript
// Before (in each test file)
let storage: TestPersistence;
beforeAll(async () => {
  storage = new PGTestStorage();
});

// After
let storage: TestPersistence;
beforeAll(() => {
  storage = global.testStorage;
});
```

**2.5 Update controller tests**

Controller tests using `supertest` need the app to use the transactional storage:

```typescript
// src/server/testHelper.ts
import { TransactionalTestStorage } from './storage/TransactionalTestStorage';
import express from 'express';
import { createApp } from './serverApp';

export function createTestApp(): express.Express {
  return createApp(global.testStorage);
}
```

### Files to Modify
- `src/server/storage/storage.test.ts`
- `src/server/controllers/languagesController.test.ts`
- `src/server/controllers/lessonsController.test.ts`
- `src/server/controllers/tStringsController.test.ts`
- `src/server/controllers/documentsController.test.ts`
- `src/server/controllers/syncController.test.ts`
- `src/server/controllers/migrationController.test.ts`

### Acceptance Criteria
- [ ] Each Jest test runs in its own transaction
- [ ] Database state resets automatically after each test
- [ ] Tests can run in any order with same results
- [ ] No manual `storage.reset()` calls needed in tests

---

## Phase 3: Cypress Test Isolation

### Strategy
Reset database to fixtures before each test using the existing `/api/test/reset-storage` endpoint.

### Implementation

**3.1 Create Cypress command for database reset**

```javascript
// cypress/support/commands.js
Cypress.Commands.add('resetDatabase', () => {
  return cy.request({
    method: 'POST',
    url: '/api/test/reset-storage',
    timeout: 30000  // Fixture loading can be slow
  });
});
```

**3.2 Update Cypress support file**

```javascript
// cypress/support/index.js
import './commands';

beforeEach(() => {
  cy.resetDatabase();
});
```

**3.3 Ensure server runs in test mode for Cypress**

The server must use `PGTestStorage` when Cypress runs. This is already handled by `NODE_ENV=test` in dev scripts.

### Acceptance Criteria
- [ ] Database resets before each Cypress test
- [ ] Cypress tests can run in any order
- [ ] Cypress tests don't affect Jest test state

---

## Phase 4: Verify Test Reliability

### Strategy
Run the test suite multiple times in different orders to prove determinism.

### Implementation

**4.1 Add randomized test order script**

```json
{
  "scripts": {
    "test:verify": "for i in {1..10}; do NODE_ENV=test jest --runInBand --randomize && echo \"Run $i passed\"; done"
  }
}
```

**4.2 Add CI verification job**

```yaml
# .github/workflows/test.yml (or equivalent)
test-reliability:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Run tests 5 times
      run: |
        for i in {1..5}; do
          yarn test --runInBand --randomize --ci
        done
```

**4.3 Manual verification checklist**

Run these commands and verify all pass:

```bash
# Run tests in default order
yarn test --runInBand --watchAll=false

# Run tests in reverse order
yarn test --runInBand --watchAll=false --testSequencer=./reverseSequencer.js

# Run tests in random order (5 times)
for i in {1..5}; do yarn test --runInBand --randomize; done

# Run Cypress tests twice
yarn cypress run && yarn cypress run
```

### Acceptance Criteria
- [ ] Tests pass 10 consecutive runs with `--randomize`
- [ ] Tests pass when run in reverse order
- [ ] Cypress tests pass on repeated runs
- [ ] No "flaky test" failures in CI for 1 week

---

## Phase 5: Expand Test Coverage to >90%

### Current Coverage Gaps

Based on test file inventory, these areas likely need coverage:

| Area | Current Tests | Gaps |
|------|---------------|------|
| Core models | None | Lesson, TString, Language, LessonString |
| Core API | None | All API client code |
| Server storage | storage.test.ts | Individual method coverage |
| Server controllers | 6 test files | Error paths, edge cases |
| Server XML | 2 test files | Error handling |
| Frontend components | None | React components |
| Desktop | 1 test file | LocalStorage, sync logic |

### Implementation

**5.1 Add coverage tracking**

```json
{
  "scripts": {
    "test:coverage": "NODE_ENV=test jest --coverage --runInBand"
  }
}
```

**5.2 Configure coverage thresholds**

```javascript
// jest.config.js
module.exports = {
  // ... existing config
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

**5.3 Priority test additions**

High priority (core business logic):
1. `src/core/models/` - Unit tests for all model classes
2. `src/server/storage/PGStorage.ts` - Method-level coverage
3. `src/server/controllers/` - Error path coverage

Medium priority (integration):
4. `src/core/api/` - API client tests with mocked responses
5. `src/server/xml/` - XML parsing edge cases
6. `src/server/usfm/` - USFM parsing edge cases

Lower priority (UI - consider React Testing Library):
7. `src/frontend/common/` - Component unit tests
8. `src/frontend/web/` - Page component tests

**5.4 Coverage improvement workflow**

```bash
# Generate coverage report
yarn test:coverage

# Open HTML report
open coverage/lcov-report/index.html

# Identify files below 90%
# Add tests for uncovered branches/functions
```

### Acceptance Criteria
- [ ] Coverage report generates successfully
- [ ] Global coverage >90% for lines, branches, functions, statements
- [ ] All core models have unit tests
- [ ] All controller error paths tested
- [ ] Coverage thresholds enforced in CI

---

## Implementation Order

### Week 1: Foundation
1. [ ] Phase 1: Fix migration system (1 day)
2. [ ] Phase 2: Transaction isolation for Jest (2-3 days)
3. [ ] Phase 3: Cypress reset per test (0.5 day)

### Week 2: Verification
4. [ ] Phase 4: Run verification suite (1 day)
5. [ ] Fix any remaining flaky tests discovered
6. [ ] Set up CI verification job

### Week 3-4: Coverage
7. [ ] Phase 5: Add coverage tracking
8. [ ] Write tests for core models
9. [ ] Write tests for storage methods
10. [ ] Write tests for controller error paths
11. [ ] Achieve >90% coverage

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Transaction isolation doesn't work with `postgres` library | Fall back to savepoint-based isolation or truncate-reload |
| Some tests implicitly depend on shared state | Identify and fix during Phase 4 verification |
| Coverage goal too aggressive | Start with 80%, incrementally increase |
| Cypress reset too slow | Consider per-spec reset as fallback |

---

## Success Metrics

1. **Zero flaky tests** for 2 consecutive weeks in CI
2. **All tests pass** in any execution order
3. **>90% code coverage** with enforced thresholds
4. **<5 second** average test isolation overhead per test file
