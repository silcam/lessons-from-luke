/// <reference types="jest" />

/**
 * Tests for src/server/util/secrets.ts
 *
 * The module has two branches at load time:
 *   1. `fs.existsSync(secretsJson)` returns true  → parse secrets.json
 *   2. `fs.existsSync(secretsJson)` returns false → use defaultSecrets
 *
 * Branch 2 is always hit when no secrets.json exists in the working
 * directory, so it is already covered by every test that imports a module
 * depending on `secrets`.
 *
 * Branch 1 (line 21, the ternary's true path) is NOT covered because there is
 * no `secrets.json` in the working directory during CI.  We cover it here by:
 *   1. Writing a temporary `secrets.json` to `process.cwd()`.
 *   2. Using `jest.resetModules()` + `require()` to force a fresh evaluation
 *      of the module so the `fs.existsSync` check runs again.
 *   3. Deleting the temp file and resetting modules afterwards.
 *
 * FR-011 validation tests confirm the module throws on:
 *   - cookieSecret shorter than 32 characters
 *   - adminEmail absent when NODE_ENV=production
 * and succeeds with a valid configuration.
 */

import fs from "fs";
import path from "path";

const secretsJsonPath = path.join(process.cwd(), "secrets.json");

/** A valid secrets object that satisfies all validation rules (including production). */
const validSecrets = {
  cookieSecret: "a-strong-unique-cookie-secret-for-testing!!",
  adminEmail: "admin@example.com",
  adminUsername: "admin",
  adminPassword: "hunter2-secure",
  db: {
    database: "my-db",
    username: "my-user",
    password: "my-pass",
  },
  testDb: {
    database: "my-test-db",
    username: "my-user",
    password: "my-pass",
  },
  devDb: {
    database: "my-dev-db",
    username: "my-user",
    password: "my-pass",
  },
};

describe("secrets — file-based branch (line 21 true path)", () => {
  let originalContent: string | null = null;
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    // Snapshot the original file (if present) so we can restore it after each
    // test.  In CI (and on some workstations) a secrets.json exists; the first
    // test overwrites it, and without a restore the next test suite would load
    // our fake credentials and fail to connect to the database.
    if (fs.existsSync(secretsJsonPath)) {
      originalContent = fs.readFileSync(secretsJsonPath, "utf8");
    }
  });

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore NODE_ENV
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

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
    // Write a temporary secrets.json at cwd so the module finds it
    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");

    // Verify the file is there before resetting modules
    expect(fs.existsSync(secretsJsonPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(secretsJsonPath, "utf8"));
    expect(onDisk.cookieSecret).toBe("a-strong-unique-cookie-secret-for-testing!!");

    // Re-require the module so it re-evaluates from scratch
    jest.resetModules();

    const freshSecrets = require("./secrets").default;

    expect(freshSecrets.cookieSecret).toBe("a-strong-unique-cookie-secret-for-testing!!");
    expect(freshSecrets.adminEmail).toBe("admin@example.com");
    expect(freshSecrets.adminUsername).toBe("admin");
    expect(freshSecrets.adminPassword).toBe("hunter2-secure");
    expect(freshSecrets.db.database).toBe("my-db");
    expect(freshSecrets.testDb.database).toBe("my-test-db");
    expect(freshSecrets.devDb.database).toBe("my-dev-db");
  });

  test("falls back to defaultSecrets when secrets.json does not exist", () => {
    // Ensure no secrets.json is present (may already be absent)
    if (fs.existsSync(secretsJsonPath)) {
      fs.unlinkSync(secretsJsonPath);
    }

    const freshSecrets = require("./secrets").default;

    // Default values from the source (cookieSecret must be >= 32 chars)
    expect(freshSecrets.cookieSecret.length).toBeGreaterThanOrEqual(32);
    expect(freshSecrets.adminEmail).toBeDefined();
    expect(freshSecrets.adminUsername).toBe("chris");
    expect(freshSecrets.db.database).toBe("lessons-from-luke");
    expect(freshSecrets.testDb.database).toBe("lessons-from-luke-test");
    expect(freshSecrets.devDb.database).toBe("lessons-from-luke-dev");
  });
});

describe("secrets — FR-011 fail-fast validation", () => {
  let originalContent: string | null = null;
  let originalNodeEnv: string | undefined;
  let originalBetterAuthUrl: string | undefined;

  beforeAll(() => {
    if (fs.existsSync(secretsJsonPath)) {
      originalContent = fs.readFileSync(secretsJsonPath, "utf8");
    }
  });

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
  });

  afterEach(() => {
    // Restore NODE_ENV
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    // Restore BETTER_AUTH_URL
    if (originalBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
    }

    if (originalContent !== null) {
      fs.writeFileSync(secretsJsonPath, originalContent, "utf8");
    } else if (fs.existsSync(secretsJsonPath)) {
      fs.unlinkSync(secretsJsonPath);
    }
    jest.resetModules();
  });

  test("throws when cookieSecret is shorter than 32 characters", () => {
    process.env.NODE_ENV = "test";

    const shortSecrets = {
      ...validSecrets,
      cookieSecret: "short", // 5 chars — too short
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(shortSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/cookieSecret/i);
  });

  test("error message for short cookieSecret does not contain the secret value", () => {
    process.env.NODE_ENV = "test";

    const shortSecrets = {
      ...validSecrets,
      cookieSecret: "short-secret-value", // 18 chars — too short
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(shortSecrets), "utf8");

    jest.resetModules();

    let errorMessage = "";
    try {
      require("./secrets");
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).not.toContain("short-secret-value");
  });

  test("throws when NODE_ENV=production and adminEmail is absent", () => {
    process.env.NODE_ENV = "production";

    const noEmailSecrets = { ...validSecrets };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (noEmailSecrets as any).adminEmail;

    fs.writeFileSync(secretsJsonPath, JSON.stringify(noEmailSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/adminEmail/i);
  });

  test("does not throw when adminEmail is absent outside production", () => {
    process.env.NODE_ENV = "test";

    const noEmailSecrets = { ...validSecrets };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (noEmailSecrets as any).adminEmail;

    fs.writeFileSync(secretsJsonPath, JSON.stringify(noEmailSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });

  test("succeeds with a valid configuration (cookieSecret >= 32 chars, adminEmail present, BETTER_AUTH_URL https)", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    // Include a valid email block so the FR-002 production email guard does not fire.
    const prodSecrets = {
      ...validSecrets,
      email: {
        apiKey: "real-mg-api-key-00000000000000000000000000000000-00000000-0000",
        domain: "mg.real-domain.com",
        fromAddress: "noreply@mg.real-domain.com",
      },
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(prodSecrets), "utf8");

    jest.resetModules();

    let freshSecrets: ReturnType<typeof require> | null = null;
    expect(() => {
      freshSecrets = require("./secrets").default;
    }).not.toThrow();

    expect(freshSecrets).not.toBeNull();
    expect(freshSecrets.adminEmail).toBe("admin@example.com");
  });

  test("throws when NODE_ENV=production and BETTER_AUTH_URL is not set", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BETTER_AUTH_URL;

    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/BETTER_AUTH_URL/i);
  });

  test("throws when NODE_ENV=production and BETTER_AUTH_URL does not start with https://", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "http://example.com";

    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/BETTER_AUTH_URL/i);
  });

  test("error message for invalid BETTER_AUTH_URL does not contain the URL value", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "http://my-secret-internal-host.corp";

    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");

    jest.resetModules();

    let errorMessage = "";
    try {
      require("./secrets");
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).not.toContain("http://my-secret-internal-host.corp");
    expect(errorMessage).toMatch(/BETTER_AUTH_URL/i);
  });

  test("does not throw when BETTER_AUTH_URL is unset outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.BETTER_AUTH_URL;

    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });

  test("throws when NODE_ENV=production and cookieSecret is the built-in default", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const defaultCookieSecretSecrets = {
      ...validSecrets,
      cookieSecret: "dev-only-secret-replace-in-production-xx",
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultCookieSecretSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/cookieSecret/i);
  });

  test("throws when adminPassword is shorter than 12 characters", () => {
    process.env.NODE_ENV = "test";

    const shortPasswordSecrets = {
      ...validSecrets,
      adminPassword: "short", // 5 chars — below 12-char NIST/OWASP minimum
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(shortPasswordSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/adminPassword/i);
  });

  test("throws when adminPassword is exactly 11 characters (one below minimum)", () => {
    process.env.NODE_ENV = "test";

    const elevenCharSecrets = {
      ...validSecrets,
      adminPassword: "eleven-char", // exactly 11 chars
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(elevenCharSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/adminPassword/i);
  });

  test("does not throw when adminPassword is exactly 12 characters (the minimum)", () => {
    process.env.NODE_ENV = "test";

    const twelveCharSecrets = {
      ...validSecrets,
      adminPassword: "twelve-chars!", // exactly 13 chars — use 12
    };
    // Use precisely 12 chars
    twelveCharSecrets.adminPassword = "TwelveChars!";
    fs.writeFileSync(secretsJsonPath, JSON.stringify(twelveCharSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });

  test("error message for short adminPassword does not expose the password value", () => {
    process.env.NODE_ENV = "test";

    const shortPasswordSecrets = {
      ...validSecrets,
      adminPassword: "my-short-pw", // 11 chars — one below minimum
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(shortPasswordSecrets), "utf8");

    jest.resetModules();

    let errorMessage = "";
    try {
      require("./secrets");
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).not.toContain("my-short-pw");
    expect(errorMessage).toMatch(/adminPassword/i);
  });

  test("throws when NODE_ENV=production and adminPassword is the built-in default", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const defaultPasswordSecrets = {
      ...validSecrets,
      adminPassword: "dev-password-1", // the defaultSecrets value from secrets.ts
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultPasswordSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/adminPassword/i);
  });

  test("error message for default adminPassword in production does not expose the password value", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const defaultPasswordSecrets = {
      ...validSecrets,
      adminPassword: "dev-password-1",
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultPasswordSecrets), "utf8");

    jest.resetModules();

    let errorMessage = "";
    try {
      require("./secrets");
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).not.toContain("dev-password-1");
    expect(errorMessage).toMatch(/adminPassword/i);
  });

  test("does not throw when adminPassword is the built-in default outside production", () => {
    process.env.NODE_ENV = "test";

    const defaultPasswordSecrets = {
      ...validSecrets,
      adminPassword: "dev-password-1",
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultPasswordSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });

  test("does not throw when cookieSecret is the built-in default outside production", () => {
    process.env.NODE_ENV = "test";

    const defaultCookieSecretSecrets = {
      ...validSecrets,
      cookieSecret: "dev-only-secret-replace-in-production-xx",
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultCookieSecretSecrets), "utf8");

    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });

  test("error message for default cookieSecret in production does not contain the secret value", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const defaultCookieSecretSecrets = {
      ...validSecrets,
      cookieSecret: "dev-only-secret-replace-in-production-xx",
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(defaultCookieSecretSecrets), "utf8");

    jest.resetModules();

    let errorMessage = "";
    try {
      require("./secrets");
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    expect(errorMessage).not.toContain("dev-only-secret-replace-in-production-xx");
    expect(errorMessage).toMatch(/cookieSecret/i);
  });
});

/**
 * EmailConfig validation tests.
 *
 * Design contract: specs/005-transactional-email-reset/data-model.md §EmailConfig;
 * contracts/email-transport.contract.ts §EmailConfig; plan.md §Security (Pass 7 cross-field).
 *
 * Placeholder default values used by defaultSecrets.email:
 *   apiKey      "your-mailgun-api-key-here"
 *   domain      "mg.example.com"
 *   fromAddress "noreply@mg.example.com"
 */
describe("secrets — FR-002 EmailConfig production fail-fast validation", () => {
  let originalContent: string | null = null;
  let originalNodeEnv: string | undefined;
  let originalBetterAuthUrl: string | undefined;

  /** A valid non-placeholder email config that satisfies all cross-field rules. */
  const validEmailConfig = {
    apiKey: "real-mg-api-key-00000000000000000000000000000000-00000000-0000",
    domain: "mg.real-domain.com",
    fromAddress: "noreply@mg.real-domain.com",
  };

  /** Full secrets object (all production fields present) including a valid email block. */
  const validSecretsWithEmail = {
    ...validSecrets,
    email: validEmailConfig,
  };

  beforeAll(() => {
    if (fs.existsSync(secretsJsonPath)) {
      originalContent = fs.readFileSync(secretsJsonPath, "utf8");
    }
  });

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
    }

    if (originalContent !== null) {
      fs.writeFileSync(secretsJsonPath, originalContent, "utf8");
    } else if (fs.existsSync(secretsJsonPath)) {
      fs.unlinkSync(secretsJsonPath);
    }
    jest.resetModules();
  });

  // --- Failing (RED) tests: validation not yet implemented ---------------------

  test("throws when NODE_ENV=production and email block is absent", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    // validSecrets has no email block — production must reject it
    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecrets), "utf8");
    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/email/i);
  });

  test("throws when email.apiKey is empty, error names email.apiKey", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const badSecrets = {
      ...validSecretsWithEmail,
      email: { ...validEmailConfig, apiKey: "" },
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(badSecrets), "utf8");
    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/email\.apiKey/i);
  });

  test("throws when email.domain is the placeholder default, error names email.domain", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const badSecrets = {
      ...validSecretsWithEmail,
      email: { ...validEmailConfig, domain: "mg.example.com" },
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(badSecrets), "utf8");
    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/email\.domain/i);
  });

  test("throws when email.fromAddress is the placeholder default, error names email.fromAddress", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    const badSecrets = {
      ...validSecretsWithEmail,
      email: { ...validEmailConfig, fromAddress: "noreply@mg.example.com" },
    };
    fs.writeFileSync(secretsJsonPath, JSON.stringify(badSecrets), "utf8");
    jest.resetModules();

    expect(() => require("./secrets")).toThrow(/email\.fromAddress/i);
  });

  test(
    "throws when email.fromAddress domain does not align with email.domain (DKIM/DMARC cross-field), " +
      "error names both fields but never values",
    () => {
      process.env.NODE_ENV = "production";
      process.env.BETTER_AUTH_URL = "https://example.com";

      const mismatchedSecrets = {
        ...validSecretsWithEmail,
        email: {
          ...validEmailConfig,
          domain: "mg.real-domain.com",
          fromAddress: "noreply@other-domain.com", // domain part does not align
        },
      };
      fs.writeFileSync(secretsJsonPath, JSON.stringify(mismatchedSecrets), "utf8");
      jest.resetModules();

      let caughtError: Error | null = null;
      try {
        require("./secrets");
      } catch (e) {
        caughtError = e as Error;
      }

      // Must throw
      expect(caughtError).not.toBeNull();
      // Error message must name both fields
      expect(caughtError!.message).toMatch(/email\.fromAddress/i);
      expect(caughtError!.message).toMatch(/email\.domain/i);
      // Error message must NOT contain the actual domain values (FR-004)
      expect(caughtError!.message).not.toContain("mg.real-domain.com");
      expect(caughtError!.message).not.toContain("other-domain.com");
    }
  );

  // --- Passing (GREEN-today) tests: happy-path that implementation must not break -----

  test(
    "does not throw when fromAddress domain is a subdomain of email.domain " +
      "(DKIM/DMARC alignment — subdomain case)",
    () => {
      process.env.NODE_ENV = "production";
      process.env.BETTER_AUTH_URL = "https://example.com";

      const subdomainSecrets = {
        ...validSecretsWithEmail,
        email: {
          ...validEmailConfig,
          domain: "mg.example.org",
          fromAddress: "noreply@mail.mg.example.org", // mail.mg.example.org is a subdomain of mg.example.org
        },
      };
      fs.writeFileSync(secretsJsonPath, JSON.stringify(subdomainSecrets), "utf8");
      jest.resetModules();

      expect(() => require("./secrets")).not.toThrow();
    }
  );

  test("does not throw when email config is fully valid in production", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://example.com";

    fs.writeFileSync(secretsJsonPath, JSON.stringify(validSecretsWithEmail), "utf8");
    jest.resetModules();

    expect(() => require("./secrets")).not.toThrow();
  });
});
