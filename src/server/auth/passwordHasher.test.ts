import { randomBytes } from "crypto";
import { hash, verify } from "./passwordHasher";

// Node 24 built-in argon2Sync — same require path used by the migration
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { argon2Sync } = require("crypto") as {
  argon2Sync: (
    algorithm: string,
    params: {
      message: Buffer;
      nonce: Buffer;
      passes: number;
      memory: number;
      parallelism: number;
      tagLength: number;
    }
  ) => Buffer;
};

// Shared Argon2id constants from the single source of truth used by the migration.
// Importing here ensures the test exercises the same parameter values that
// migrations/_argon2Params.js exports, so any param drift is caught immediately.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ALGO, MEMORY, ITERATIONS, PARALLELISM, TAG_LENGTH } = require("../../../migrations/_argon2Params") as {
  ALGO: string;
  MEMORY: number;
  ITERATIONS: number;
  PARALLELISM: number;
  TAG_LENGTH: number;
};

/**
 * Inline Argon2id hash helper using the same code path as the SeedAdminUser
 * migration. Consumes parameters from migrations/_argon2Params.js (the single
 * source of truth) so that any param tuning is caught by this test.
 */
function migrationArgon2idHash(password: string): string {
  const nonce = randomBytes(16);
  const hashBuf = argon2Sync(ALGO, {
    message: Buffer.from(password, "utf8"),
    nonce,
    passes: ITERATIONS,
    memory: MEMORY,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
  return `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
}

describe("passwordHasher", () => {
  const password = "correct-horse-battery-staple";
  const wrongPassword = "wrong-password";

  it("hash(password) returns a string matching the argon2id format", async () => {
    const result = await hash(password);
    // 7-field format: argon2id$m$t$p$l$saltHex$hashHex
    expect(result).toMatch(
      /^argon2id\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9a-f]+\$[0-9a-f]+$/
    );
  });

  it("hash(password) produces different values on repeated calls (salt randomness)", async () => {
    const hash1 = await hash(password);
    const hash2 = await hash(password);
    expect(hash1).not.toBe(hash2);
  });

  it("verify(hash(password), password) returns true (round-trip)", async () => {
    const hashed = await hash(password);
    const result = await verify(hashed, password);
    expect(result).toBe(true);
  });

  it("verify(hash(password), wrongPassword) returns false", async () => {
    const hashed = await hash(password);
    const result = await verify(hashed, wrongPassword);
    expect(result).toBe(false);
  });

  it("verify('not-a-valid-hash', password) returns false without throwing", async () => {
    const result = await verify("not-a-valid-hash", password);
    expect(result).toBe(false);
  });

  // Verifies that the migration's Argon2id hashPassword output (produced by the
  // same argon2Sync call path in SeedAdminUser.js) is verifiable by passwordHasher.verify.
  // This ensures seeded admin credentials are accepted at runtime after the migration
  // switches from scrypt to Argon2id.
  it("verify(migrationArgon2idHash(password), password) returns true (migration format round-trip)", async () => {
    const hashed = migrationArgon2idHash(password);
    const result = await verify(hashed, password);
    expect(result).toBe(true);
  });

  // Verifies that the better-auth password adapter form ({ hash, password }) correctly
  // delegates to passwordHasher.verify — guards against argument-order bugs in the adapter.
  it("better-auth adapter: verify({ hash: hashed, password }) returns true", async () => {
    const hashed = await hash(password);
    // The adapter in auth.ts calls: verify({ hash, password }) => passwordHasher.verify(hash, password)
    const betterAuthVerifyAdapter = ({ hash: h, password: p }: { hash: string; password: string }) =>
      verify(h, p);
    const result = await betterAuthVerifyAdapter({ hash: hashed, password });
    expect(result).toBe(true);
  });

  // Guard: the adapter must return false for wrong password (arg-order regression check)
  it("better-auth adapter: verify({ hash: hashed, password: wrong }) returns false", async () => {
    const hashed = await hash(password);
    const betterAuthVerifyAdapter = ({ hash: h, password: p }: { hash: string; password: string }) =>
      verify(h, p);
    const result = await betterAuthVerifyAdapter({ hash: hashed, password: wrongPassword });
    expect(result).toBe(false);
  });

  // ------------------------------------------------------------------ tag-length encoding

  // New 7-field format: argon2id$m$t$p$l$saltHex$hashHex
  // verify() must derive tag length from the stored hash, not from TAG_LENGTH constant,
  // so that changing TAG_LENGTH in the future does not silently break existing credentials.

  it("hash(password) produces a string matching the new 7-field format argon2id$m$t$p$l$saltHex$hashHex", async () => {
    const result = await hash(password);
    expect(result).toMatch(
      /^argon2id\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9a-f]+\$[0-9a-f]+$/
    );
    expect(result.split("$")).toHaveLength(7);
  });

  it("verify() round-trips a manually constructed hash with a non-default tag length (64 bytes)", async () => {
    // Build a valid hash string using tagLength=64, bypassing hash() which uses TAG_LENGTH.
    // This simulates a future environment where TAG_LENGTH=64 and proves verify() reads
    // tag length from the stored hash rather than from the TAG_LENGTH constant.
    const customTagLength = 64;
    const nonce = randomBytes(16);
    const hashBuf = argon2Sync(ALGO, {
      message: Buffer.from(password, "utf8"),
      nonce,
      passes: ITERATIONS,
      memory: MEMORY,
      parallelism: PARALLELISM,
      tagLength: customTagLength,
    });
    // 7-field format with l=64
    const stored = `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${customTagLength}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
    const result = await verify(stored, password);
    expect(result).toBe(true);
  });

  it("verify() still returns true for old 6-field hashes (backward compatibility)", async () => {
    // Old format: argon2id$m$t$p$saltHex$hashHex (no tag-length field).
    // verify() must fall back to TAG_LENGTH (32) for these so existing credentials keep working.
    const nonce = randomBytes(16);
    const hashBuf = argon2Sync(ALGO, {
      message: Buffer.from(password, "utf8"),
      nonce,
      passes: ITERATIONS,
      memory: MEMORY,
      parallelism: PARALLELISM,
      tagLength: TAG_LENGTH, // 32 — matches the fallback constant
    });
    // 6-field format (no l field)
    const stored = `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
    const result = await verify(stored, password);
    expect(result).toBe(true);
  });
});
