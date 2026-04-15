/// <reference types="jest" />

/**
 * Tests for src/server/util/secrets.ts
 *
 * The module has two branches at load time:
 *   1. `fs.existsSync(secretsJson)` returns true  → parse secrets.json
 *   2. `fs.existsSync(secretsJson)` returns false → use defaultSecrets
 *
 * Branch 2 is always hit in the Docker test environment (no secrets.json in
 * the working directory), so it is already covered by every test that imports
 * a module depending on `secrets`.
 *
 * Branch 1 (line 21, the ternary's true path) is NOT covered because there is
 * no `secrets.json` in the working directory during CI.  We cover it here by:
 *   1. Writing a temporary `secrets.json` to `process.cwd()`.
 *   2. Using `jest.resetModules()` + `require()` to force a fresh evaluation
 *      of the module so the `fs.existsSync` check runs again.
 *   3. Deleting the temp file and resetting modules afterwards.
 */

import fs from "fs";
import path from "path";

const secretsJsonPath = path.join(process.cwd(), "secrets.json");

describe("secrets — file-based branch (line 21 true path)", () => {
  let originalContent: string | null = null;

  beforeAll(() => {
    // Snapshot the original file (if present) so we can restore it after each
    // test.  In Docker/CI the entrypoint generates secrets.json; the first test
    // overwrites it, and without a restore the next test suite would load our
    // fake credentials and fail to connect to the database.
    if (fs.existsSync(secretsJsonPath)) {
      originalContent = fs.readFileSync(secretsJsonPath, "utf8");
    }
  });

  afterEach(() => {
    // Restore (or remove) secrets.json to exactly its pre-test state.
    if (originalContent !== null) {
      fs.writeFileSync(secretsJsonPath, originalContent, "utf8");
    } else if (fs.existsSync(secretsJsonPath)) {
      fs.unlinkSync(secretsJsonPath);
    }
    // Clear the module cache so jest.resetModules() doesn't leak stale
    // credentials into later test suites.
    jest.resetModules();
  });

  test("reads values from secrets.json when the file exists", () => {
    const customSecrets = {
      cookieSecret: "custom-cookie-secret",
      adminUsername: "admin",
      adminPassword: "hunter2",
      db: {
        database: "my-db",
        username: "my-user",
        password: "my-pass"
      },
      testDb: {
        database: "my-test-db",
        username: "my-user",
        password: "my-pass"
      }
    };

    // Write a temporary secrets.json at cwd so the module finds it
    fs.writeFileSync(secretsJsonPath, JSON.stringify(customSecrets), "utf8");

    // Verify the file is there before resetting modules
    expect(fs.existsSync(secretsJsonPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(secretsJsonPath, "utf8"));
    expect(onDisk.cookieSecret).toBe("custom-cookie-secret");

    // Re-require the module so it re-evaluates from scratch
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const freshSecrets = require("./secrets").default;

    expect(freshSecrets.cookieSecret).toBe("custom-cookie-secret");
    expect(freshSecrets.adminUsername).toBe("admin");
    expect(freshSecrets.adminPassword).toBe("hunter2");
    expect(freshSecrets.db.database).toBe("my-db");
    expect(freshSecrets.testDb.database).toBe("my-test-db");
  });

  test("falls back to defaultSecrets when secrets.json does not exist", () => {
    // Ensure no secrets.json is present (may already be absent)
    if (fs.existsSync(secretsJsonPath)) {
      fs.unlinkSync(secretsJsonPath);
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const freshSecrets = require("./secrets").default;

    // Default values from the source
    expect(freshSecrets.cookieSecret).toBe("fuerabgui4pab5m32;tkqipn84");
    expect(freshSecrets.adminUsername).toBe("chris");
    expect(freshSecrets.db.database).toBe("lessons-from-luke");
    expect(freshSecrets.testDb.database).toBe("lessons-from-luke-test");
  });
});
