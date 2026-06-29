"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Creating invitation table...");

    await sql`
      CREATE TABLE IF NOT EXISTS "invitation" (
        "id"          text        PRIMARY KEY,
        "email"       text        NOT NULL,
        "role"        text        NOT NULL,
        "status"      text        NOT NULL DEFAULT 'pending',
        "tokenHash"   text        NOT NULL UNIQUE,
        "tokenEnc"    text        NOT NULL,
        "invitedBy"   text        NOT NULL REFERENCES "user"("id"),
        "createdAt"   timestamptz NOT NULL,
        "expiresAt"   timestamptz NOT NULL,
        "acceptedAt"  timestamptz
      )
    `;

    // O(1) single-use lookup; also enforces UNIQUE on tokenHash
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_invitation_tokenHash"
        ON "invitation"("tokenHash")
    `;

    // Management list + account/dup checks on email
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_invitation_email"
        ON "invitation"(LOWER("email"))
    `;

    // FR-005: one active invite per email (DB invariant via partial unique index)
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_invitation_one_pending_email"
        ON "invitation"(LOWER("email"))
        WHERE "status" = 'pending'
    `;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping invitation table...");

    await sql`DROP INDEX IF EXISTS "uq_invitation_one_pending_email"`;
    await sql`DROP INDEX IF EXISTS "idx_invitation_email"`;
    await sql`DROP INDEX IF EXISTS "idx_invitation_tokenHash"`;
    await sql`DROP TABLE IF EXISTS "invitation"`;

    console.log("Done.");
  });
};
