"use strict";
// crypto is available as a built-in global in Node 22+; require() provides
// the same module object and is needed for compatibility with the ESLint
// CommonJS config that expects explicit imports in migration files.
// eslint-disable-next-line no-redeclare
var crypto = require("crypto");
const fs = require("fs");
const { makeDbConnect } = require("./_helpers");
const { ALGO, MEMORY, ITERATIONS, PARALLELISM, TAG_LENGTH } = require("./_argon2Params");

/**
 * Hash a password using Argon2id via Node 24's built-in crypto.argon2Sync.
 *
 * Parameters come from migrations/_argon2Params.js (the single source of truth),
 * which is also cross-referenced by src/server/auth/passwordHasher.ts. Tuning
 * parameters in _argon2Params.js is visible to both the migration and the runtime
 * hasher without requiring a dual-site update.
 *
 * Format: "argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>"
 */
function hashPassword(password) {
  const nonce = crypto.randomBytes(16);
  const hashBuf = crypto.argon2Sync(ALGO, {
    message: Buffer.from(password, "utf8"),
    nonce,
    passes: ITERATIONS,
    memory: MEMORY,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
  return `${ALGO}$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${nonce.toString("hex")}$${hashBuf.toString("hex")}`;
}

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Seeding admin user...");

    // Read secrets — never log values, only field names on error
    const secrets = JSON.parse(fs.readFileSync("secrets.json"));

    if (!secrets.adminEmail) {
      throw new Error("SeedAdminUser: missing required field 'adminEmail' in secrets.json");
    }
    if (!secrets.adminPassword) {
      throw new Error("SeedAdminUser: missing required field 'adminPassword' in secrets.json");
    }
    if (secrets.adminPassword.length < 12) {
      throw new Error(
        "SeedAdminUser: adminPassword in secrets.json must be at least 12 characters " +
          "(NIST 800-63B / OWASP 2025 minimum). Update secrets.json before running migrations."
      );
    }

    const email = secrets.adminEmail.toLowerCase();

    // Check whether admin user + credential account already exist, and if so,
    // whether the stored credential is already in the Argon2id format.
    // If the credential is in the legacy scrypt format ("saltHex:keyHex"), we
    // delete and re-insert with Argon2id so the wired passwordHasher can verify it.
    const existingRows = await sql`
      SELECT u.id, a.id AS "accountId", a.password
      FROM "user" u
      INNER JOIN "account" a ON a."userId" = u.id AND a."providerId" = 'credential'
      WHERE u.email = ${email}
      LIMIT 1
    `;

    if (existingRows.length > 0) {
      const existingHash = existingRows[0].password;
      if (existingHash.startsWith("argon2id$")) {
        console.log("Admin account already exists with Argon2id hash, skipping seed.");
        return;
      }
      // Legacy scrypt format detected — delete so we can re-insert with Argon2id
      console.log("Admin account has legacy scrypt hash — re-seeding with Argon2id.");
      await sql`DELETE FROM "user" WHERE email = ${email} AND admin = true`;
    }

    // Insert user + account atomically in a single transaction.
    // emailVerified = true: the admin email is provisioned out-of-band by the
    // operator via secrets.json (adminEmail), and the app has no email-sending /
    // verification flow that could ever flip it. Marking it verified keeps the
    // account from being locked out if requireEmailVerification is enabled later.
    const now = new Date();
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const passwordHash = hashPassword(secrets.adminPassword);

    await sql`
      INSERT INTO "user" (
        "id", "email", "name", "admin", "emailVerified", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}, ${email}, 'Admin', true, true, ${now}, ${now}
      )
    `;

    await sql`
      INSERT INTO "account" (
        "id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt"
      ) VALUES (
        ${accountId}, ${userId}, ${userId}, 'credential', ${passwordHash}, ${now}, ${now}
      )
    `;

    console.log("Admin user seeded successfully.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Removing seeded admin user...");

    const secrets = JSON.parse(fs.readFileSync("secrets.json"));
    if (!secrets.adminEmail) {
      console.log("No adminEmail in secrets.json, nothing to remove from 'user'.");
      return;
    }

    const email = secrets.adminEmail.toLowerCase();

    // Deleting user cascades to account and session via FK ON DELETE CASCADE
    await sql`
      DELETE FROM "user" WHERE email = ${email} AND admin = true
    `;

    console.log("Done.");
  });
};
