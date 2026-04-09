import { execSync } from "child_process";
import postgres from "postgres";
import secrets from "./util/secrets";
import pgLoadFixtures from "./storage/pgLoadFixtures";

export default async function globalSetup() {
  execSync("yarn migrate:test", { stdio: "inherit" });

  const sql = postgres({
    ...secrets.testDb
  });

  await pgLoadFixtures(sql);
  await sql.end();

  console.log("✓ Test database reset to fixtures");
}
