import { randomBytes, timingSafeEqual } from "crypto";

/**
 * Argon2id parameters — MUST stay in sync with migrations/_argon2Params.js,
 * which is the CommonJS single source of truth shared by the SeedAdminUser
 * migration. If you tune any of these values, update _argon2Params.js first
 * so that both the runtime hasher and future migration runs use identical params.
 */
const ALGO = "argon2id";
const MEMORY = 19456; // KiB — see migrations/_argon2Params.js
const ITERATIONS = 2; // passes — see migrations/_argon2Params.js
const PARALLELISM = 1; // see migrations/_argon2Params.js
const TAG_LENGTH = 32; // bytes — see migrations/_argon2Params.js

// Node 24 built-in argon2Sync: not yet in @types/node@20, so we pull it at
// runtime via require and assert the minimal shape we need.
type Argon2Params = {
  message: Buffer;
  nonce: Buffer;
  passes: number;
  memory: number;
  parallelism: number;
  tagLength: number;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { argon2Sync } = require("crypto") as {
  argon2Sync: (algorithm: string, params: Argon2Params) => Buffer;
};

/**
 * Hashes a plaintext password using Argon2id with a random 16-byte salt.
 *
 * The returned string encodes all parameters needed to verify the password
 * later, in the format:
 *   argon2id$<m>$<t>$<p>$<l>$<saltHex>$<hashHex>
 *
 * The tag length `<l>` is encoded explicitly so that {@link verify} can
 * round-trip any hash regardless of the current TAG_LENGTH constant value.
 * This means changing TAG_LENGTH in the future will not silently break
 * verification of credentials that were hashed under a different value.
 *
 * @param password - The plaintext password to hash.
 * @returns A promise resolving to the encoded hash string.
 */
export async function hash(password: string): Promise<string> {
  const nonce = randomBytes(16);
  const hashBuf = argon2Sync(ALGO, {
    message: Buffer.from(password, "utf8"),
    nonce,
    passes: ITERATIONS,
    memory: MEMORY,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
  return `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${TAG_LENGTH}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored Argon2id hash string.
 *
 * Supports two formats:
 * - New 7-field: `argon2id$<m>$<t>$<p>$<l>$<saltHex>$<hashHex>` — tag length
 *   is read from the stored `<l>` field, so verification is independent of the
 *   current TAG_LENGTH constant.
 * - Legacy 6-field: `argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>` — tag length
 *   falls back to the TAG_LENGTH constant (32) for backward compatibility with
 *   hashes produced before the tag-length field was introduced.
 *
 * Returns `false` (without throwing) if the stored hash is malformed or if
 * the password does not match.
 *
 * @param storedHash - The encoded hash string produced by {@link hash}.
 * @param password - The plaintext password to check.
 * @returns A promise resolving to `true` if the password matches, `false` otherwise.
 */
export async function verify(
  storedHash: string,
  password: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");
    if (parts[0] !== ALGO) {
      return false;
    }

    let m: number, t: number, p: number, tagLength: number, nonceHex: string, expectedHashHex: string;

    if (parts.length === 7) {
      // New format: argon2id$m$t$p$l$saltHex$hashHex
      const [, mStr, tStr, pStr, lStr, nHex, eHex] = parts;
      m = parseInt(mStr, 10);
      t = parseInt(tStr, 10);
      p = parseInt(pStr, 10);
      tagLength = parseInt(lStr, 10);
      nonceHex = nHex;
      expectedHashHex = eHex;
      if (isNaN(tagLength) || tagLength <= 0) {
        return false;
      }
    } else if (parts.length === 6) {
      // Legacy format: argon2id$m$t$p$saltHex$hashHex
      const [, mStr, tStr, pStr, nHex, eHex] = parts;
      m = parseInt(mStr, 10);
      t = parseInt(tStr, 10);
      p = parseInt(pStr, 10);
      tagLength = TAG_LENGTH;
      nonceHex = nHex;
      expectedHashHex = eHex;
    } else {
      return false;
    }

    if (isNaN(m) || isNaN(t) || isNaN(p)) {
      return false;
    }
    if (nonceHex.length === 0 || nonceHex.length % 2 !== 0) {
      return false;
    }
    const nonce = Buffer.from(nonceHex, "hex");
    const actualHashBuf = argon2Sync(ALGO, {
      message: Buffer.from(password, "utf8"),
      nonce,
      passes: t,
      memory: m,
      parallelism: p,
      tagLength,
    });
    const expectedHashBuf = Buffer.from(expectedHashHex, "hex");
    if (actualHashBuf.length !== expectedHashBuf.length) {
      return false;
    }
    return timingSafeEqual(actualHashBuf, expectedHashBuf);
  } catch {
    return false;
  }
}
