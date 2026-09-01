"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Creating deviceCode table...");

    await sql`
      CREATE TABLE IF NOT EXISTS "deviceCode" (
        "id"              text        PRIMARY KEY,
        "deviceCode"      text        NOT NULL,
        "userCode"        text        NOT NULL,
        "userId"          text,
        "expiresAt"       timestamptz NOT NULL,
        "status"          text        NOT NULL,
        "lastPolledAt"    timestamptz,
        "pollingInterval" integer,
        "clientId"        text,
        "scope"           text
      )
    `;

    // Desktop polling secret — unique, O(1) lookup on /device/token
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_deviceCode_deviceCode"
        ON "deviceCode"("deviceCode")
    `;

    // Human code — O(1) lookup on /device/approve and /device/deny
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_deviceCode_userCode"
        ON "deviceCode"("userCode")
    `;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping deviceCode table...");

    await sql`DROP INDEX IF EXISTS "idx_deviceCode_userCode"`;
    await sql`DROP INDEX IF EXISTS "uq_deviceCode_deviceCode"`;
    await sql`DROP TABLE IF EXISTS "deviceCode"`;

    console.log("Done.");
  });
};
