"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Creating invitationRateLimit table...");

    await sql`
      CREATE TABLE IF NOT EXISTS "invitationRateLimit" (
        "key"         text    PRIMARY KEY,
        "count"       integer NOT NULL,
        "lastRequest" bigint  NOT NULL
      )
    `;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping invitationRateLimit table...");

    await sql`DROP TABLE IF EXISTS "invitationRateLimit"`;

    console.log("Done.");
  });
};
