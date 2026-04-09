"use strict";
const postgres = require("postgres");
const fs = require("fs");

module.exports.up = async () => {
  await dbConnect(async sql => {
    console.log("Adding column...");
    await sql`
      ALTER TABLE languages
      ADD defaultSrcLang int DEFAULT 1
    `;
    console.log("Done");
  });
};

module.exports.down = function(next) {
  next();
};

async function dbConnect(cb) {
  const secrets = JSON.parse(fs.readFileSync("secrets.json"));
  const opts = process.env.TEST_DB ? secrets.testDb : secrets.db;
  const sql = postgres(opts);
  await sql.begin(async sql => {
    await cb(sql);
  });
  await sql.end();
}
