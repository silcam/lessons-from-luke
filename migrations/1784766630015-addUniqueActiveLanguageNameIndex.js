"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

// Closes the TOCTOU window between the app-level case-insensitive duplicate
// name check and the write on both the create and rename language endpoints
// (lessons-from-luke-fm4a.9): a partial unique index on lower(name) for
// active (non-archived) rows makes the database itself the serialization
// point, so two concurrent requests racing toward the same new name can
// never both commit — the loser's INSERT/UPDATE fails with a 23505 unique
// violation, which the app layer maps to 409. The index is partial (WHERE
// NOT archived) so archived languages' names never collide with active
// ones, matching the existing "rename to an archived name" 200 behavior.
module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Adding unique index...");
    await sql`
      CREATE UNIQUE INDEX languages_name_active_lower_idx
      ON languages (lower(name))
      WHERE NOT archived
    `;
    console.log("Done");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Dropping unique index...");
    await sql`
      DROP INDEX languages_name_active_lower_idx
    `;
    console.log("Done");
  });
};
