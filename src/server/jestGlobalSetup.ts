import postgres from "postgres";
import secrets from "./util/secrets";
import pgLoadFixtures from "./storage/pgLoadFixtures";

export default async function globalSetup() {
  const sql = postgres({
    ...secrets.testDb
  });

  await pgLoadFixtures(sql);
  await sql.end();

  console.log("✓ Test database reset to fixtures");
}
