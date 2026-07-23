"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Adding column...");
    await sql`
      ALTER TABLE languages
      ADD archived boolean NOT NULL DEFAULT false
    `;
    console.log("Done");
  });
};

module.exports.down = function (next) {
  next();
};
