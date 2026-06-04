const fs = require('fs');
const postgres = require('postgres');

// pgLoadFixtures is compiled from src/server/storage/pgLoadFixtures.ts.
// Build dist first: tsc -b ./src/server (already part of `yarn dev-web`).
const pgLoadFixtures = require('../dist/server/storage/pgLoadFixtures').default;

const secrets = JSON.parse(fs.readFileSync('secrets.json'));

(async () => {
  const sql = postgres(secrets.devDb);
  await pgLoadFixtures(sql);
  await sql.end();
  console.log('✓ Dev database reset to fixtures');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
