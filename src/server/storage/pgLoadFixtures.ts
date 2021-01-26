import { SqlFunc } from "postgres";
import fs from "fs";
import { sqlizeLang } from "../../core/models/Language";
import { sqlizeTString } from "../../core/models/TString";

const jsonFixturesPath = process.cwd() + "/test/fixtures-0.json";
const fixtures = JSON.parse(fs.readFileSync(jsonFixturesPath).toString());

export default async function pgLoadFixtures(sql: SqlFunc) {
  await sql.begin(async sql => {
    await sql`DELETE FROM languages`;
    await sql`INSERT INTO languages ${sql(fixtures.languages.map(sqlizeLang))}`;
    await sql`UPDATE languages SET created=1594220697740, modified=1594220697740`;
    await sql`ALTER SEQUENCE languages_languageid_seq RESTART 4`;

    await sql`DELETE FROM lessons`;
    await sql`INSERT INTO lessons ${sql(fixtures.lessons)}`;
    await sql`UPDATE lessons SET created=1594220697740, modified=1594220697740`;
    await sql`ALTER SEQUENCE lessons_lessonid_seq RESTART 16`;

    await sql`DELETE FROM lessonStrings`;
    await sql`INSERT INTO lessonStrings ${sql(fixtures.lessonStrings)}`;
    await sql`ALTER SEQUENCE lessonstrings_lessonstringid_seq RESTART 1409`;

    await sql`DELETE FROM oldLessonStrings`;
    await sql`INSERT INTO oldLessonStrings ${sql(fixtures.oldLessonStrings)}`;

    await sql`DELETE FROM lessonDiffs`;

    await sql`DELETE FROM tStrings`;
    await sql`INSERT INTO tStrings ${sql(
      fixtures.tStrings.map(sqlizeTString)
    )}`;
    await sql`UPDATE tstrings SET created=1594220697740, modified=1594220697740`;
    await sql`ALTER SEQUENCE tstrings_masterid_seq RESTART 655`;
  });

  // console.log("PG Fixtures Loaded");
}
