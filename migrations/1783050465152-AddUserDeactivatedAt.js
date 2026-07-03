"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

// US2 (deactivate/reactivate account access): a nullable marker column on the
// auth-owned "user" table. NULL = active (default for every existing row incl.
// the seeded admin); non-null = deactivated at that instant. No index — roster
// scans are ≤ tens of rows and enforcement lookups are by PK.

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Adding user.deactivatedAt...");

    await sql`ALTER TABLE "user" ADD COLUMN "deactivatedAt" timestamptz`;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping user.deactivatedAt...");

    await sql`ALTER TABLE "user" DROP COLUMN "deactivatedAt"`;

    console.log("Done.");
  });
};
