"use strict";
const postgres = require("postgres");

async function up() {
  await dbConnect(async sql => {
    await sql.begin(async sql => {
      console.log("Create languages table...");
      await sql`
      CREATE TABLE languages (
        languageId serial primary key,
        name text,
        code text,
        motherTongue boolean,
        progress jsonb
      )
    `;

      console.log("Create lessons table...");
      await sql`
      CREATE TABLE lessons(
        lessonId serial primary key,
        book text,
        series int,
        lesson int,
        version int
      )
    `;

      console.log("Create lessonStrings table...");
      await sql`
      CREATE TABLE lessonStrings (
        lessonStringId serial primary key,
        masterId int,
        lessonId int,
        lessonVersion int,
        type text,
        xpath text,
        motherTongue boolean
      )
    `;

      console.log("Create oldLessonStrings table...");
      await sql`
      CREATE TABLE oldLessonStrings (
        lessonStringId serial primary key,
        masterId int,
        lessonId int,
        lessonVersion int,
        type text,
        xpath text,
        motherTongue boolean
      )
    `;

      console.log("Create tStrings table...");
      await sql`
      CREATE TABLE tStrings (
        masterId serial,
        languageId int,
        sourceLanguageId int,
        source text,
        text text,
        history jsonb,
        lessonStringId int
      )
    `;

      console.log("DONE");
    });
  });
}

async function down() {
  await dbConnect(async sql => {
    await sql`DROP TABLE languages`;
    await sql`DROP TABLE lessons`;
    await sql`DROP TABLE lessonStrings`;
    await sql`DROP TABLE oldLessonStrings`;
    await sql`DROP TABLE tStrings`;
  });
}

async function dbConnect(cb) {
  const opts =
    process.env.NODE_ENV == "production"
      ? {}
      : {
          database: "lessons-from-luke",
          username: "lessons-from-luke",
          password: "lessons-from-luke"
        };
  const sql = postgres(opts);
  await cb(sql);
  await sql.end();
}
module.exports = { up, down, dbConnect };
