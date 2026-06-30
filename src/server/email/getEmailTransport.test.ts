/**
 * getEmailTransport singleton tests — RED (task lessons-from-luke-5qjl.5.2.1)
 *
 * These tests are INTENTIONALLY FAILING at commit time. The selection logic in
 * getEmailTransport does not yet exist. They drive the GREEN task
 * (lessons-from-luke-5qjl.5.2.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (selection + fail-closed)
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts §GetEmailTransport
 * Plan security: Pass 2 (fail-closed selection — never LogEmailTransport when email config present)
 *
 * Test strategy: use jest.resetModules() + require() to reload the singleton fresh
 * for each selection test, so module-level state doesn't bleed between tests.
 */

import { setEmailTransport, resetEmailTransport, getEmailTransport } from "./getEmailTransport";
import { MemoryEmailTransport } from "./MemoryEmailTransport";
import { LogEmailTransport } from "./LogEmailTransport";
import { EmailTransport } from "./EmailTransport";

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  jest.resetModules();
  resetEmailTransport();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getEmailTransport() — env-selected singleton", () => {
  // -------------------------------------------------------------------------
  // 1. With production-shaped Secrets.email, returns MailgunEmailTransport
  //    (fail-closed selection — never LogEmailTransport when email config present)
  // -------------------------------------------------------------------------

  it("returns MailgunEmailTransport when production-shaped Secrets.email is present (never LogEmailTransport)", () => {
    // Load a fresh module with production-shaped secrets mocked
    jest.resetModules();
    jest.doMock("../util/secrets", () => {
      const actual = jest.requireActual("../util/secrets");
      return {
        __esModule: true,
        default: {
          cookieSecret: "a-long-enough-cookie-secret-value-for-testing",
          adminEmail: "admin@example.com",
          adminUsername: "admin",
          adminPassword: "adminpassword123",
          db: { database: "db", username: "u", password: "p" },
          testDb: { database: "testdb", username: "u", password: "p" },
          devDb: { database: "devdb", username: "u", password: "p" },
          email: {
            apiKey: "unit-test-api-key-not-a-real-credential",
            domain: "mg.real-domain.com",
            fromAddress: "noreply@mg.real-domain.com",
          },
        },
        // Real defaultSecrets — getEmailTransport derives PLACEHOLDER_EMAIL from
        // this single source of truth (task lessons-from-luke-5qjl.7).
        defaultSecrets: actual.defaultSecrets,
      };
    });

    const { getEmailTransport: freshGet } = require("./getEmailTransport");
    const { MailgunEmailTransport: FreshMailgun } = require("./MailgunEmailTransport");

    const transport = freshGet();
    expect(transport).toBeInstanceOf(FreshMailgun);
    // Explicitly assert it is NOT a LogEmailTransport (fail-closed contract)
    expect(transport).not.toBeInstanceOf(LogEmailTransport);
  });

  // -------------------------------------------------------------------------
  // 2. In NODE_ENV=test (without production-shaped email config), returns MemoryEmailTransport
  // -------------------------------------------------------------------------

  it("returns MemoryEmailTransport in NODE_ENV=test (the current test environment)", () => {
    // NODE_ENV is already 'test' (set by yarn test). The singleton should
    // return MemoryEmailTransport when running under Jest.
    const transport = getEmailTransport();
    expect(transport).toBeInstanceOf(MemoryEmailTransport);
  });

  // -------------------------------------------------------------------------
  // 3. setEmailTransport / resetEmailTransport injection and restoration
  // -------------------------------------------------------------------------

  it("setEmailTransport(fake) causes getEmailTransport() to return the fake transport", () => {
    const fake: EmailTransport = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    setEmailTransport(fake);
    expect(getEmailTransport()).toBe(fake);
  });

  it("resetEmailTransport() restores the default transport (MemoryEmailTransport in test env)", () => {
    const fake: EmailTransport = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    setEmailTransport(fake);
    expect(getEmailTransport()).toBe(fake);

    resetEmailTransport();
    const restored = getEmailTransport();
    // After reset, the default (test env) transport must be MemoryEmailTransport
    expect(restored).toBeInstanceOf(MemoryEmailTransport);
    // And the fake must no longer be returned
    expect(restored).not.toBe(fake);
  });

  it("resetEmailTransport() is idempotent — calling it twice leaves default in place", () => {
    resetEmailTransport();
    resetEmailTransport();
    expect(getEmailTransport()).toBeInstanceOf(MemoryEmailTransport);
  });
});

/**
 * Fail-closed selection — placeholder-shaped email config gap — RED (task
 * lessons-from-luke-5qjl.5.5.1)
 *
 * These tests are INTENTIONALLY FAILING at commit time. `createDefaultTransport()`
 * currently selects Mailgun whenever `secrets.email` is merely *present* (`if
 * (secrets.email)`), which is also true for `defaultSecrets.email` — the placeholder
 * object secrets.ts falls back to when no secrets.json exists on disk (apiKey
 * "your-mailgun-api-key-here", domain "mg.example.com", fromAddress
 * "noreply@mg.example.com"). So in development/test with NO real secrets.json, the
 * selector wrongly picks MailgunEmailTransport instead of Log/MemoryEmailTransport —
 * the opposite of fail-closed (Pass 2): dev/test would attempt a live Mailgun call
 * with junk credentials rather than safely logging. They drive the GREEN task
 * (lessons-from-luke-5qjl.5.5.2), which must make the selection predicate
 * config-driven (only "production-shaped" — i.e. genuinely valid, non-placeholder —
 * email config selects Mailgun).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (selection + fail-closed)
 * research.md §D3; plan.md §Security (Pass 2 fail-closed selection)
 */
describe("getEmailTransport() — fail-closed selection must ignore placeholder-shaped email config", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    jest.resetModules();
    resetEmailTransport();
  });

  /**
   * The exact placeholder shape `defaultSecrets.email` carries in secrets.ts when no
   * secrets.json is present on disk — present (truthy) but NOT real production config.
   */
  const placeholderEmailConfig = {
    apiKey: "your-mailgun-api-key-here",
    domain: "mg.example.com",
    fromAddress: "noreply@mg.example.com",
  };

  function mockSecretsWith(nodeEnv: string, email: Record<string, string>) {
    process.env.NODE_ENV = nodeEnv;
    jest.doMock("../util/secrets", () => {
      const actual = jest.requireActual("../util/secrets");
      return {
        __esModule: true,
        default: {
          cookieSecret: "a-long-enough-cookie-secret-value-for-testing",
          adminEmail: "admin@example.com",
          adminUsername: "admin",
          adminPassword: "adminpassword123",
          db: { database: "db", username: "u", password: "p" },
          testDb: { database: "testdb", username: "u", password: "p" },
          devDb: { database: "devdb", username: "u", password: "p" },
          email,
        },
        // Real defaultSecrets — getEmailTransport derives PLACEHOLDER_EMAIL from
        // this single source of truth (task lessons-from-luke-5qjl.7).
        defaultSecrets: actual.defaultSecrets,
      };
    });
  }

  it("returns MemoryEmailTransport in NODE_ENV=test when secrets.email is only the placeholder default (no real production secrets)", () => {
    jest.resetModules();
    mockSecretsWith("test", placeholderEmailConfig);

    const { getEmailTransport: freshGet } = require("./getEmailTransport");
    const { MemoryEmailTransport: FreshMemory } = require("./MemoryEmailTransport");
    const { MailgunEmailTransport: FreshMailgun } = require("./MailgunEmailTransport");

    const transport = freshGet();
    expect(transport).toBeInstanceOf(FreshMemory);
    expect(transport).not.toBeInstanceOf(FreshMailgun);
  });

  it("returns LogEmailTransport in NODE_ENV=development when secrets.email is only the placeholder default (no real production secrets)", () => {
    jest.resetModules();
    mockSecretsWith("development", placeholderEmailConfig);

    const { getEmailTransport: freshGet } = require("./getEmailTransport");
    const { LogEmailTransport: FreshLog } = require("./LogEmailTransport");
    const { MailgunEmailTransport: FreshMailgun } = require("./MailgunEmailTransport");

    const transport = freshGet();
    expect(transport).toBeInstanceOf(FreshLog);
    expect(transport).not.toBeInstanceOf(FreshMailgun);
  });

  it("returns MailgunEmailTransport for valid production-shaped secrets regardless of NODE_ENV value (e.g. NODE_ENV=development)", () => {
    jest.resetModules();
    mockSecretsWith("development", {
      apiKey: "unit-test-api-key-not-a-real-credential",
      domain: "mg.real-domain.com",
      fromAddress: "noreply@mg.real-domain.com",
    });

    const { getEmailTransport: freshGet } = require("./getEmailTransport");
    const { MailgunEmailTransport: FreshMailgun } = require("./MailgunEmailTransport");
    const { LogEmailTransport: FreshLog } = require("./LogEmailTransport");

    const transport = freshGet();
    expect(transport).toBeInstanceOf(FreshMailgun);
    expect(transport).not.toBeInstanceOf(FreshLog);
  });

  // ---------------------------------------------------------------------------
  // Single source of truth — task lessons-from-luke-5qjl.7
  //
  // getEmailTransport must derive its placeholder-detection literal from
  // secrets.ts's exported `defaultSecrets.email`, NOT an independently
  // hand-copied literal. Proof: mock secrets.ts so `defaultSecrets.email`
  // carries placeholder VALUES THAT DIFFER from the historical hardcoded
  // literal ("your-mailgun-api-key-here" / "mg.example.com" /
  // "noreply@mg.example.com"). If getEmailTransport still had its own
  // independent copy of those historical values, this mocked placeholder
  // would fail to match it and would be wrongly treated as production-shaped
  // (selecting MailgunEmailTransport). Only sourcing PLACEHOLDER_EMAIL from
  // the imported `defaultSecrets.email` makes this pass.
  // ---------------------------------------------------------------------------

  it("derives its placeholder literal from secrets.ts's exported defaultSecrets.email, not an independent copy", () => {
    jest.resetModules();

    const mockPlaceholder = {
      apiKey: "mock-placeholder-api-key-distinct-from-historical-literal",
      domain: "mock.placeholder.example",
      fromAddress: "noreply@mock.placeholder.example",
    };

    process.env.NODE_ENV = "test";
    jest.doMock("../util/secrets", () => ({
      __esModule: true,
      default: {
        cookieSecret: "a-long-enough-cookie-secret-value-for-testing",
        adminEmail: "admin@example.com",
        adminUsername: "admin",
        adminPassword: "adminpassword123",
        db: { database: "db", username: "u", password: "p" },
        testDb: { database: "testdb", username: "u", password: "p" },
        devDb: { database: "devdb", username: "u", password: "p" },
        email: mockPlaceholder,
      },
      defaultSecrets: {
        email: mockPlaceholder,
      },
    }));

    const { getEmailTransport: freshGet } = require("./getEmailTransport");
    const { MemoryEmailTransport: FreshMemory } = require("./MemoryEmailTransport");
    const { MailgunEmailTransport: FreshMailgun } = require("./MailgunEmailTransport");

    const transport = freshGet();
    // secrets.email exactly equals the (mocked) defaultSecrets.email, so it
    // must be recognized as the placeholder default — never Mailgun.
    expect(transport).toBeInstanceOf(FreshMemory);
    expect(transport).not.toBeInstanceOf(FreshMailgun);
  });
});
