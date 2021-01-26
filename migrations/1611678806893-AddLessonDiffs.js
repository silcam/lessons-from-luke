"use strict";
const postgres = require("postgres");
const fs = require("fs");

module.exports.up = async () => {
  await dbConnect(async sql => {
    console.log(`Create Table...`);
    await sql`
    CREATE TABLE lessonDiffs (
      lessonId int primary key,
      version int,
      diff jsonb
    )
  `;
  });
  console.log("Done");
};

module.exports.down = async () => {
  await dbConnect(async sql => {
    console.log(`Drop Table...`);
    await sql`DROP TABLE lessonDiffs`;
  });
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
