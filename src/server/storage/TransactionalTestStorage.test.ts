/// <reference types="jest" />

import { TransactionalTestStorage } from "./TransactionalTestStorage";

// The global testStorage is set up by jestSetupAfterEnv.ts and wraps each
// test in a transaction that gets rolled back. These tests exercise the
// TransactionalTestStorage overrides themselves.

const storage = (): TransactionalTestStorage =>
  (global as any).testStorage as TransactionalTestStorage;

test("transaction isolation: data created in a transaction is not visible after rollback", async () => {
  // The jestSetupAfterEnv has already called beginTransaction() for us.
  // Create a language inside the current transaction.
  const lang = await storage().createLanguage({ name: "TestIsolation", defaultSrcLang: 1 });
  expect(lang.languageId).toBeGreaterThan(3);

  // Manually rollback and then begin a new transaction to check isolation.
  await storage().rollbackTransaction();
  await storage().beginTransaction();

  // The language we just created should not be visible anymore.
  const found = await storage().language({ languageId: lang.languageId });
  expect(found).toBeNull();
});

test("updateProgress is a no-op outside a transaction", async () => {
  // Rollback the transaction begun by beforeEach so we are outside one.
  await storage().rollbackTransaction();
  // Should not throw even though there is no active transaction.
  await expect(storage().updateProgress()).resolves.toBeUndefined();
  // Re-enter a transaction so afterEach can roll it back cleanly.
  await storage().beginTransaction();
});

test("saveTStrings returns empty array outside a transaction", async () => {
  // Rollback the transaction begun by beforeEach.
  await storage().rollbackTransaction();
  const result = await storage().saveTStrings([
    {
      masterId: 1,
      languageId: 3,
      text: "something",
      history: [],
      sourceLanguageId: 2,
      source: "source"
    }
  ]);
  expect(result).toEqual([]);
  // Re-enter a transaction so afterEach can roll it back cleanly.
  await storage().beginTransaction();
});

test("reset reloads fixtures: exactly 3 languages after reset", async () => {
  // Create an extra language to dirty state.
  await storage().createLanguage({ name: "Klingon", defaultSrcLang: 1 });
  const beforeReset = await storage().languages();
  expect(beforeReset.length).toBeGreaterThan(3);

  await storage().rollbackTransaction();
  // reset() uses rootSql, outside any transaction.
  await storage().reset();
  await storage().beginTransaction();

  const afterReset = await storage().languages();
  expect(afterReset.length).toBe(3);
});

test("withProgressUpdate awaits the progress update inside a transaction", async () => {
  // Call withProgressUpdate with a no-op callback; it should not throw.
  const result = await storage().withProgressUpdate(async () => 42);
  expect(result).toBe(42);
});
