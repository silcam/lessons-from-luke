"use strict";
const fs = require("fs");
const postgres = require("postgres");

function dbOpts() {
  const secrets = JSON.parse(fs.readFileSync("secrets.json"));
  return process.env.TEST_DB
    ? secrets.testDb
    : process.env.DEV_DB
    ? secrets.devDb
    : secrets.db;
}

function makeDbConnect(useTransaction = true) {
  return async function dbConnect(cb) {
    const sql = postgres(dbOpts());
    if (useTransaction) {
      await sql.begin(async sql => {
        await cb(sql);
      });
    } else {
      await cb(sql);
    }
    await sql.end();
  };
}

module.exports = { dbOpts, makeDbConnect };
