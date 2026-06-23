"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Creating better-auth tables...");

    // user (FK target for session and account — must come first)
    await sql`
      CREATE TABLE IF NOT EXISTS "user" (
        "id"            text        PRIMARY KEY,
        "name"          text        NOT NULL,
        "email"         text        NOT NULL UNIQUE,
        "emailVerified" boolean     NOT NULL DEFAULT false,
        "image"         text,
        "admin"         boolean     NOT NULL DEFAULT false,
        "createdAt"     timestamptz NOT NULL,
        "updatedAt"     timestamptz NOT NULL
      )
    `;

    // session (FK → user)
    await sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "id"          text        PRIMARY KEY,
        "userId"      text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "token"       text        NOT NULL UNIQUE,
        "expiresAt"   timestamptz NOT NULL,
        "ipAddress"   text,
        "userAgent"   text,
        "createdAt"   timestamptz NOT NULL,
        "updatedAt"   timestamptz NOT NULL
      )
    `;

    // account (FK → user)
    await sql`
      CREATE TABLE IF NOT EXISTS "account" (
        "id"                     text        PRIMARY KEY,
        "userId"                 text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "accountId"              text        NOT NULL,
        "providerId"             text        NOT NULL,
        "accessToken"            text,
        "refreshToken"           text,
        "idToken"                text,
        "accessTokenExpiresAt"   timestamptz,
        "refreshTokenExpiresAt"  timestamptz,
        "scope"                  text,
        "password"               text,
        "createdAt"              timestamptz NOT NULL,
        "updatedAt"              timestamptz NOT NULL
      )
    `;

    // verification (no FK)
    await sql`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id"          text        PRIMARY KEY,
        "identifier"  text        NOT NULL,
        "value"       text        NOT NULL,
        "expiresAt"   timestamptz NOT NULL,
        "createdAt"   timestamptz,
        "updatedAt"   timestamptz
      )
    `;

    // rateLimit (no FK; column names dictated by better-auth)
    await sql`
      CREATE TABLE IF NOT EXISTS "rateLimit" (
        "id"          text    PRIMARY KEY,
        "key"         text    NOT NULL,
        "count"       integer NOT NULL,
        "lastRequest" bigint  NOT NULL
      )
    `;

    // Indexes
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_account_userId"
        ON "account"("userId")
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_session_userId"
        ON "session"("userId")
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_verification_identifier"
        ON "verification"("identifier")
    `;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping better-auth tables...");

    // Drop in reverse FK order
    await sql`DROP TABLE IF EXISTS "rateLimit"`;
    await sql`DROP TABLE IF EXISTS "verification"`;
    await sql`DROP TABLE IF EXISTS "account"`;
    await sql`DROP TABLE IF EXISTS "session"`;
    await sql`DROP TABLE IF EXISTS "user"`;

    console.log("Done.");
  });
};
