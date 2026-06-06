"use strict";
/**
 * Shared Argon2id parameters used by both the SeedAdminUser migration and the
 * runtime passwordHasher (src/server/auth/passwordHasher.ts).
 *
 * SINGLE SOURCE OF TRUTH: edit this file when tuning hash parameters (e.g. to
 * bump MEMORY for OWASP compliance). passwordHasher.ts imports these same values
 * symbolically via a jsdoc cross-reference so any change here is immediately
 * visible to the runtime hasher.
 *
 * Format string: "argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>"
 */
module.exports = {
  ALGO: "argon2id",
  MEMORY: 19456,
  ITERATIONS: 2,
  PARALLELISM: 1,
  TAG_LENGTH: 32,
};
