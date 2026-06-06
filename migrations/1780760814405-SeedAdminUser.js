"use strict";
const crypto = require("crypto");
const fs = require("fs");
const { makeDbConnect } = require("./_helpers");

const ALGO = "argon2id";
const MEMORY = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;

const { argon2Sync } = crypto;

function hashPassword(password) {
  const nonce = crypto.randomBytes(16);
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
    const passwordHash = hashPassword(secrets.adminPassword);

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
