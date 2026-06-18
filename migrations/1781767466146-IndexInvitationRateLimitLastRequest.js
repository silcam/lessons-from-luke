"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log(
      'Adding index on invitationRateLimit("lastRequest") for efficient prune DELETEs...'
    );

    await sql`
      CREATE INDEX IF NOT EXISTS "idx_invitationRateLimit_lastRequest"
        ON "invitationRateLimit"("lastRequest")
    `;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log(
      'Dropping index on invitationRateLimit("lastRequest")...'
    );

    await sql`DROP INDEX IF EXISTS "idx_invitationRateLimit_lastRequest"`;

    console.log("Done.");
  });
};
