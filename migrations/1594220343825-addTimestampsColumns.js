"use strict";
const postgres = require("postgres");
const fs = require("fs");

module.exports.up = async () => {
  await dbConnect(async sql => {
    console.log("Adding columns...");
    await sql`
      ALTER TABLE tstrings
      ADD created bigint,
      ADD modified bigint
    `;
    await sql`
      ALTER TABLE languages
      ADD created bigint,
      ADD modified bigint
    `;
    await sql`
      ALTER TABLE lessons
      ADD created bigint,
      ADD modified bigint
    `;

    console.log("Setting timestamps...");
    const timestamp = Date.now().valueOf();
    const update = { created: timestamp, modified: timestamp };
    await sql`
      UPDATE tstrings
      SET ${sql(update)}
    `;
    await sql`
      UPDATE languages
      SET ${sql(update)}
    `;
    await sql`
      UPDATE lessons
      SET ${sql(update)}
    `;

    console.log("Done");
  });
};

module.exports.down = async () => {
  console.log("Dropping columns...");
  await sql`
    ALTER TABLE tstrings
    DROP created,
    DROP modified
  `;
  await sql`
    ALTER TABLE languages
    DROP created,
    DROP modified
  `;
  await sql`
    ALTER TABLE lessons
    DROP created,
    DROP modified
  `;
  console.log("Done");
};

async function dbConnect(cb) {
  const secrets = JSON.parse(fs.readFileSync("secrets.json"));
  const opts = secrets.db;
  const sql = postgres(opts);
  await sql.begin(async sql => {
    await cb(sql);
  });
  await sql.end();
}
