import { execSync } from "child_process";
import postgres from "postgres";
import secrets from "./util/secrets";
import pgLoadFixtures from "./storage/pgLoadFixtures";
import { reseedServerDocsRunDir } from "./storage/seedServerDocs";

export default async function globalSetup() {
  // Wipe + reseed the disposable ODT dir so no test writes into the git-tracked
  // fixture corpus (test/docs/serverDocs). See storage/seedServerDocs.ts.
  reseedServerDocsRunDir();
  console.log("\u2713 test/docs/serverDocs-run reseeded from fixtures");

  execSync("yarn migrate:test", { stdio: "inherit" });

  const sql = postgres({
    ...secrets.testDb,
  });

  await pgLoadFixtures(sql);
  await sql.end();

  console.log("✓ Test database reset to fixtures");
}
