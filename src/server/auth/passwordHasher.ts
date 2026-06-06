import { randomBytes, timingSafeEqual } from "crypto";

const ALGO = "argon2id";
const MEMORY = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;

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
 *   argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>
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
  return `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored Argon2id hash string.
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
    if (parts.length !== 6 || parts[0] !== ALGO) {
      return false;
    }
    const [, mStr, tStr, pStr, nonceHex, expectedHashHex] = parts;
    const m = parseInt(mStr, 10);
    const t = parseInt(tStr, 10);
    const p = parseInt(pStr, 10);
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
      tagLength: TAG_LENGTH,
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
