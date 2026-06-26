/**
 * safeReturnTo.test.ts — unit tests for safeReturnTo()
 *
 * safeReturnTo(raw, baseOrigin?) returns a sanitized same-app path or '/'
 * on any rejection. It is a pure function with no window reads.
 *
 * Primary approach: new URL(raw, baseOrigin ?? 'http://localhost') then
 * assert url.origin === baseOrigin (or 'http://localhost') and return
 * url.pathname + url.search. String rules are defense-in-depth.
 */

import { safeReturnTo } from "./safeReturnTo";

// ---------------------------------------------------------------------------
// Valid paths (must pass through)
// ---------------------------------------------------------------------------
describe("safeReturnTo — valid in-app paths", () => {
  it("accepts a simple absolute path", () => {
    expect(safeReturnTo("/translate/ABC")).toBe("/translate/ABC");
  });

  it("accepts a path with query string", () => {
    expect(safeReturnTo("/lessons/1?foo=bar")).toBe("/lessons/1?foo=bar");
  });

  it("accepts root path", () => {
    expect(safeReturnTo("/")).toBe("/");
  });

  it("accepts a path with multiple segments", () => {
    expect(safeReturnTo("/languages/list/active")).toBe("/languages/list/active");
  });

  it("accepts a path with encoded chars that stay in-origin", () => {
    expect(safeReturnTo("/translate/Hello%20World")).toBe("/translate/Hello%20World");
  });

  it("strips fragment and returns clean path", () => {
    expect(safeReturnTo("/translate/ABC#section")).toBe("/translate/ABC");
  });

  it("strips fragment but preserves query string", () => {
    expect(safeReturnTo("/lessons/1?foo=bar#top")).toBe("/lessons/1?foo=bar");
  });

  it("accepts when a custom baseOrigin matches the value", () => {
    expect(safeReturnTo("/translate/ABC", "http://example.com")).toBe("/translate/ABC");
  });
});

// ---------------------------------------------------------------------------
// Fallback cases
// ---------------------------------------------------------------------------
describe("safeReturnTo — falls back to '/'", () => {
  it("returns '/' for an empty string", () => {
    expect(safeReturnTo("")).toBe("/");
  });

  it("returns '/' for a whitespace-only string", () => {
    expect(safeReturnTo("   ")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 1: Backslash variants
// ---------------------------------------------------------------------------
describe("safeReturnTo — backslash bypass vectors", () => {
  it("rejects /\\evil.com", () => {
    expect(safeReturnTo("/\\evil.com")).toBe("/");
  });

  it("rejects \\/evil.com", () => {
    expect(safeReturnTo("\\/evil.com")).toBe("/");
  });

  it("rejects /\\/evil.com", () => {
    expect(safeReturnTo("/\\/evil.com")).toBe("/");
  });

  it("rejects any value containing a backslash", () => {
    expect(safeReturnTo("/path\\with\\backslash")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 2: Protocol-relative URLs
// ---------------------------------------------------------------------------
describe("safeReturnTo — protocol-relative bypass vectors", () => {
  it("rejects //evil.com", () => {
    expect(safeReturnTo("//evil.com")).toBe("/");
  });

  it("rejects //evil.com/path", () => {
    expect(safeReturnTo("//evil.com/path")).toBe("/");
  });

  it("rejects // alone", () => {
    expect(safeReturnTo("//")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 3: Scheme injection
// ---------------------------------------------------------------------------
describe("safeReturnTo — scheme injection bypass vectors", () => {
  it("rejects javascript: URI", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
  });

  it("rejects data: URI", () => {
    expect(safeReturnTo("data:text/html,<script>alert(1)</script>")).toBe("/");
  });

  it("rejects vbscript: URI", () => {
    expect(safeReturnTo("vbscript:msgbox(1)")).toBe("/");
  });

  it("rejects http: absolute URL", () => {
    expect(safeReturnTo("http://evil.com")).toBe("/");
  });

  it("rejects https: absolute URL", () => {
    expect(safeReturnTo("https://evil.com/path")).toBe("/");
  });

  it("rejects mailto: URI", () => {
    expect(safeReturnTo("mailto:user@evil.com")).toBe("/");
  });

  it("rejects any scheme: prefix (colon before first slash)", () => {
    expect(safeReturnTo("ftp://evil.com")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 4: Control characters and leading whitespace
// ---------------------------------------------------------------------------
describe("safeReturnTo — control char / whitespace bypass vectors", () => {
  it("rejects value with leading tab", () => {
    expect(safeReturnTo("\t/translate/ABC")).toBe("/");
  });

  it("rejects value with leading newline", () => {
    expect(safeReturnTo("\n/translate/ABC")).toBe("/");
  });

  it("rejects value with leading carriage return", () => {
    expect(safeReturnTo("\r/translate/ABC")).toBe("/");
  });

  it("rejects value with NUL byte", () => {
    expect(safeReturnTo("\x00/translate/ABC")).toBe("/");
  });

  it("rejects value with leading space (does NOT trim-then-accept)", () => {
    expect(safeReturnTo(" /translate/ABC")).toBe("/");
  });

  it("rejects value containing ASCII DEL (0x7F)", () => {
    expect(safeReturnTo("/translate/\x7FABC")).toBe("/");
  });

  it("rejects value with embedded newline", () => {
    expect(safeReturnTo("/translate/ABC\nevil")).toBe("/");
  });

  it("rejects value with Unicode non-breaking space as leading char", () => {
    // U+00A0 NO-BREAK SPACE
    expect(safeReturnTo(" /translate/ABC")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 5: Encoding bypasses
// ---------------------------------------------------------------------------
describe("safeReturnTo — encoding bypass vectors", () => {
  it("rejects %2F%2Fevil.com (encoded //)", () => {
    expect(safeReturnTo("%2F%2Fevil.com")).toBe("/");
  });

  it("rejects %5Cevil.com (encoded backslash)", () => {
    expect(safeReturnTo("%5Cevil.com")).toBe("/");
  });

  it("rejects double-encoded %252F (decodes to %2F, then validates)", () => {
    expect(safeReturnTo("%252F%252Fevil.com")).toBe("/");
  });

  it("rejects malformed percent-encoding (decodeURIComponent throws)", () => {
    expect(safeReturnTo("%GG/path")).toBe("/");
  });

  it("rejects encoded javascript: scheme", () => {
    // %6A%61%76%61%73%63%72%69%70%74%3A
    expect(safeReturnTo("%6A%61%76%61%73%63%72%69%70%74%3Aalert(1)")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Bypass vector 6: Authority confusion
// ---------------------------------------------------------------------------
describe("safeReturnTo — authority confusion bypass vectors", () => {
  it("rejects /@evil.com", () => {
    expect(safeReturnTo("/@evil.com")).toBe("/");
  });

  it("rejects /.evil.com", () => {
    expect(safeReturnTo("/.evil.com")).toBe("/");
  });

  it("rejects path whose second segment looks like authority", () => {
    expect(safeReturnTo("/evil.com")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Fragment stripping
// ---------------------------------------------------------------------------
describe("safeReturnTo — fragment stripping", () => {
  it("strips bare #", () => {
    expect(safeReturnTo("/#")).toBe("/");
  });

  it("strips # in middle of path", () => {
    expect(safeReturnTo("/path#anchor")).toBe("/path");
  });
});
