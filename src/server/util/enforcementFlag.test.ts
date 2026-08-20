/// <reference types="jest" />

/**
 * Tests for src/server/util/enforcementFlag.ts
 *
 * isEnforcementEnabled() reads ENFORCE_API_AUTH from process.env at call time.
 * Default is ON (absent/empty → true); only explicit "0" or "false" disables.
 * No module-level state.
 */

import { isEnforcementEnabled } from "./enforcementFlag";

describe("isEnforcementEnabled", () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.ENFORCE_API_AUTH;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.ENFORCE_API_AUTH;
    } else {
      process.env.ENFORCE_API_AUTH = originalValue;
    }
  });

  test("returns true when ENFORCE_API_AUTH is absent (default ON)", () => {
    delete process.env.ENFORCE_API_AUTH;
    expect(isEnforcementEnabled()).toBe(true);
  });

  test("returns true when ENFORCE_API_AUTH is empty string (treated as unset)", () => {
    process.env.ENFORCE_API_AUTH = "";
    expect(isEnforcementEnabled()).toBe(true);
  });

  test("returns false when ENFORCE_API_AUTH is '0' (explicit opt-out)", () => {
    process.env.ENFORCE_API_AUTH = "0";
    expect(isEnforcementEnabled()).toBe(false);
  });

  test("returns false when ENFORCE_API_AUTH is 'false' (explicit opt-out)", () => {
    process.env.ENFORCE_API_AUTH = "false";
    expect(isEnforcementEnabled()).toBe(false);
  });

  test("returns true when ENFORCE_API_AUTH is '1'", () => {
    process.env.ENFORCE_API_AUTH = "1";
    expect(isEnforcementEnabled()).toBe(true);
  });

  test("returns true when ENFORCE_API_AUTH is 'true'", () => {
    process.env.ENFORCE_API_AUTH = "true";
    expect(isEnforcementEnabled()).toBe(true);
  });

  test("reads env var at call time, not at module load time", () => {
    process.env.ENFORCE_API_AUTH = "0";
    expect(isEnforcementEnabled()).toBe(false);

    process.env.ENFORCE_API_AUTH = "1";
    expect(isEnforcementEnabled()).toBe(true);

    process.env.ENFORCE_API_AUTH = "0";
    expect(isEnforcementEnabled()).toBe(false);
  });
});
