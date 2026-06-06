"use strict";
// crypto is available as a built-in global in Node 22+; require() provides
// the same module object and is needed for compatibility with the ESLint
// CommonJS config that expects explicit imports in migration files.
// eslint-disable-next-line no-redeclare
var crypto = require("crypto");
const fs = require("fs");
const { makeDbConnect } = require("./_helpers");

/**
 * Hash a password using the same algorithm as better-auth's built-in password
 * hasher (@better-auth/utils/password). better-auth uses scrypt (Node's native
 * crypto.scrypt) with the format: "${saltHex}:${keyHex}"
 *
 * Parameters match @better-auth/utils/dist/password.node.mjs:
 *   N=16384, r=16, p=1, dkLen=64
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      saltHex,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(`${saltHex}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Seeding admin user...");

    // Read secrets — never log values, only field names on error
    const secrets = JSON.parse(fs.readFileSync("secrets.json"));

    if (!secrets.adminEmail) {
      throw new Error(
        "SeedAdminUser: missing required field 'adminEmail' in secrets.json"
      );
    }
    if (!secrets.adminPassword) {
      throw new Error(
        "SeedAdminUser: missing required field 'adminPassword' in secrets.json"
      );
    }

    const email = secrets.adminEmail.toLowerCase();

    // Idempotency check: skip only if BOTH user AND credential account exist
    const existingUsers = await sql`
      SELECT u.id
      FROM "user" u
      INNER JOIN "account" a ON a."userId" = u.id AND a."providerId" = 'credential'
      WHERE u.email = ${email}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      console.log("Admin account already exists, skipping seed.");
      return;
    }

    // Insert user + account atomically in a single transaction
    const now = new Date();
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const passwordHash = await hashPassword(secrets.adminPassword);

    await sql`
      INSERT INTO "user" (
        "id", "email", "name", "admin", "emailVerified", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}, ${email}, 'Admin', true, false, ${now}, ${now}
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
      console.log(
        "No adminEmail in secrets.json, nothing to remove from 'user'."
      );
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
