"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

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
