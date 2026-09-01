/// <reference types="jest" />

/**
 * Tests for src/server/util/webEnforcementFlag.ts
 *
 * isWebEnforcementEnabled() reads ENFORCE_WEB_AUTH from process.env at call time.
 * Default is OFF (absent/empty/falsy → false). No module-level state.
 */

import { isWebEnforcementEnabled } from "./webEnforcementFlag";

describe("isWebEnforcementEnabled", () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.ENFORCE_WEB_AUTH;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.ENFORCE_WEB_AUTH;
    } else {
      process.env.ENFORCE_WEB_AUTH = originalValue;
    }
  });

  test("returns false when ENFORCE_WEB_AUTH is absent", () => {
    delete process.env.ENFORCE_WEB_AUTH;
    expect(isWebEnforcementEnabled()).toBe(false);
  });

  test("returns false when ENFORCE_WEB_AUTH is empty string", () => {
    process.env.ENFORCE_WEB_AUTH = "";
    expect(isWebEnforcementEnabled()).toBe(false);
  });

  test("returns false when ENFORCE_WEB_AUTH is '0'", () => {
    process.env.ENFORCE_WEB_AUTH = "0";
    expect(isWebEnforcementEnabled()).toBe(false);
  });

  test("returns true when ENFORCE_WEB_AUTH is '1'", () => {
    process.env.ENFORCE_WEB_AUTH = "1";
    expect(isWebEnforcementEnabled()).toBe(true);
  });

  test("returns true when ENFORCE_WEB_AUTH is 'true'", () => {
    process.env.ENFORCE_WEB_AUTH = "true";
    expect(isWebEnforcementEnabled()).toBe(true);
  });

  test("reads env var at call time, not at module load time", () => {
    delete process.env.ENFORCE_WEB_AUTH;
    expect(isWebEnforcementEnabled()).toBe(false);

    process.env.ENFORCE_WEB_AUTH = "1";
    expect(isWebEnforcementEnabled()).toBe(true);

    delete process.env.ENFORCE_WEB_AUTH;
    expect(isWebEnforcementEnabled()).toBe(false);
  });
});
