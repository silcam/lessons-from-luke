"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

module.exports.up = async () => {
  await dbConnect(async (sql) => {
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
  await dbConnect(async (sql) => {
    console.log(`Drop Table...`);
    await sql`DROP TABLE lessonDiffs`;
  });
  console.log("Done");
};
