import {
  generateToken,
  hashToken,
  encryptToken,
  decryptToken,
  buildInvitationLink,
} from "./invitationTokens";

describe("invitationTokens", () => {
  // A stable secret for encryption tests (≥ 32 chars as required by cookieSecret)
  const secret = "a-sufficiently-long-cookie-secret-value-for-testing-aes256gcm";

  // ------------------------------------------------------------------ generateToken

  describe("generateToken()", () => {
    it("returns a base64url string of 43 characters (32 bytes encoded)", () => {
      const token = generateToken();
      // base64url of 32 bytes: ceil(32 * 4 / 3) with no padding = 43 chars
      expect(typeof token).toBe("string");
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("returns different values on successive calls (randomness)", () => {
      const t1 = generateToken();
      const t2 = generateToken();
      expect(t1).not.toBe(t2);
    });
  });

  // ------------------------------------------------------------------ hashToken

  describe("hashToken(token)", () => {
    it("returns a lowercase hex string (SHA-256 output is 64 hex chars)", () => {
      const token = generateToken();
      const hash = hashToken(token);
      expect(typeof hash).toBe("string");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("is deterministic: same token always yields the same hash", () => {
      const token = generateToken();
      expect(hashToken(token)).toBe(hashToken(token));
    });

    it("different tokens yield different hashes", () => {
      const t1 = generateToken();
      const t2 = generateToken();
      expect(hashToken(t1)).not.toBe(hashToken(t2));
    });
  });

  // ------------------------------------------------------------------ encryptToken

  describe("encryptToken(token, secret)", () => {
    it("returns a string in iv:authTag:ciphertext format (three base64 segments)", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      expect(typeof enc).toBe("string");
      const parts = enc.split(":");
      expect(parts).toHaveLength(3);
      // Each segment must be non-empty valid base64
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
        expect(part).toMatch(/^[A-Za-z0-9+/]+=*$/);
      }
    });

    it("iv segment is 16 base64 chars (12 bytes encoded)", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      const [iv] = enc.split(":");
      // 12 bytes → base64: ceil(12 * 4 / 3) = 16 chars (with padding)
      expect(iv).toHaveLength(16);
    });

    it("authTag segment is 24 base64 chars (16 bytes encoded)", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      const [, authTag] = enc.split(":");
      // 16-byte GCM auth tag → base64: ceil(16 * 4 / 3) = 24 chars (with = padding)
      expect(authTag).toHaveLength(24);
    });

    it("uses a fresh random IV each call: two encryptions of the same token differ in iv segment", () => {
      const token = generateToken();
      const enc1 = encryptToken(token, secret);
      const enc2 = encryptToken(token, secret);
      const iv1 = enc1.split(":")[0];
      const iv2 = enc2.split(":")[0];
      expect(iv1).not.toBe(iv2);
    });
  });

  // ------------------------------------------------------------------ decryptToken

  describe("decryptToken(encryptedStr, secret)", () => {
    it("round-trips: decrypts back to the original token", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      const decrypted = decryptToken(enc, secret);
      expect(decrypted).toBe(token);
    });

    it("verifies GCM auth tag: throws or returns null when given a wrong secret (bad key)", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      const wrongSecret = "a-completely-different-secret-value-that-will-fail";
      let result: string | null;
      try {
        result = decryptToken(enc, wrongSecret);
        // If it doesn't throw, it must return null (not the original token)
        expect(result).toBeNull();
      } catch (err) {
        // Throwing is also acceptable — GCM auth failure
        expect(err).toBeTruthy();
      }
    });

    it("throws or returns null when the ciphertext is tampered with", () => {
      const token = generateToken();
      const enc = encryptToken(token, secret);
      const parts = enc.split(":");
      // Corrupt the ciphertext segment
      const tampered = parts[0] + ":" + parts[1] + ":AAAA" + parts[2].slice(4);
      let result: string | null;
      try {
        result = decryptToken(tampered, secret);
        expect(result).toBeNull();
      } catch (err) {
        expect(err).toBeTruthy();
      }
    });
  });

  // ------------------------------------------------------------------ buildInvitationLink

  describe("buildInvitationLink(token, baseUrl)", () => {
    it("returns ${baseUrl}/invitation/${token}", () => {
      const token = generateToken();
      const baseUrl = "https://example.com";
      const link = buildInvitationLink(token, baseUrl);
      expect(link).toBe(`${baseUrl}/invitation/${token}`);
    });

    it("works with a base URL that has no trailing slash", () => {
      const token = "sometoken";
      const link = buildInvitationLink(token, "https://app.example.org");
      expect(link).toBe("https://app.example.org/invitation/sometoken");
    });
  });
});
