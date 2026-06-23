/**
 * publicAllowlist.test.ts — unit tests for isPublicPath()
 *
 * The allowlist follows default-deny: any path not explicitly whitelisted
 * (or matching a whitelisted prefix) is treated as gated.
 */

import { isPublicPath } from "./publicAllowlist";

describe("isPublicPath", () => {
  describe("invitation paths (prefix match)", () => {
    it("returns true for /invitation/<token>", () => {
      expect(isPublicPath("/invitation/abc123token")).toBe(true);
    });

    it("returns true for /invitation/ with any sub-path", () => {
      expect(isPublicPath("/invitation/some-very-long-token-value-here")).toBe(true);
    });

    it("returns false for /invitation (exact, no trailing slash or token)", () => {
      // The prefix match requires /invitation/ — bare /invitation is gated
      expect(isPublicPath("/invitation")).toBe(false);
    });
  });

  describe("gated content paths (blocked by default-deny)", () => {
    it("returns false for /translate/<code>", () => {
      expect(isPublicPath("/translate/ABC123")).toBe(false);
    });

    it("returns false for / (root)", () => {
      expect(isPublicPath("/")).toBe(false);
    });

    it("returns false for /lessons/1", () => {
      expect(isPublicPath("/lessons/1")).toBe(false);
    });

    it("returns false for /languages", () => {
      expect(isPublicPath("/languages")).toBe(false);
    });

    it("returns false for /admin/invitations", () => {
      expect(isPublicPath("/admin/invitations")).toBe(false);
    });

    it("returns false for an unknown arbitrary path", () => {
      expect(isPublicPath("/some/unknown/path")).toBe(false);
    });
  });
});
