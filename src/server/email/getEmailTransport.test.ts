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
        email: {
          apiKey: "unit-test-api-key-not-a-real-credential",
          domain: "mg.real-domain.com",
          fromAddress: "noreply@mg.real-domain.com",
        },
      },
    }));

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
