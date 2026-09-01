/**
 * webAuthEnforcement.test.ts — unit tests for the ENFORCE_WEB_AUTH meta-tag read.
 *
 * Matrix:
 *   no tag             → true  (fail closed)
 *   content="0"        → false (gate disabled)
 *   content="1"        → true
 *   tag, no content    → true
 */
import { isWebAuthEnforced } from "./webAuthEnforcement";

describe("isWebAuthEnforced", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("returns true when the meta tag is absent (fail closed)", () => {
    document.head.innerHTML = "";
    expect(isWebAuthEnforced()).toBe(true);
  });

  it('returns false when content="0"', () => {
    document.head.innerHTML = '<meta name="enforce-web-auth" content="0">';
    expect(isWebAuthEnforced()).toBe(false);
  });

  it('returns true when content="1"', () => {
    document.head.innerHTML = '<meta name="enforce-web-auth" content="1">';
    expect(isWebAuthEnforced()).toBe(true);
  });

  it("returns true when the tag has no content attribute", () => {
    document.head.innerHTML = '<meta name="enforce-web-auth">';
    expect(isWebAuthEnforced()).toBe(true);
  });
});
