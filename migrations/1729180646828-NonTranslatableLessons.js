'use strict'
const postgres = require("postgres");
const fs = require("fs");

module.exports.up = async () => {
  await dbConnect(async sql => {
    console.log(`Adding non-translating column to lessons`);
    await sql`
    ALTER TABLE lessons
      ADD COLUMN non_translating BOOLEAN NOT NULL DEFAULT false
    `;
  });
  console.log("Done");
}

module.exports.down = async () => {
  await dbConnect(async sql => {
    console.log(`Removing non-translating column from lessons`);
    await sql`ALTER TABLE DROP COLUMN non_translating`;
  });
  console.log("Done");
}

async function dbConnect(cb) {
  const secrets = JSON.parse(fs.readFileSync("secrets.json"));
  const opts = secrets.db;
  const sql = postgres(opts);
  await sql.begin(async sql => {
    await cb(sql);
  });
  await sql.end();
}
