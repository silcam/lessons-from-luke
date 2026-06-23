import "../testSupport/jestSilenceConsole";
import { Pool } from "pg";
import { TransactionalTestStorage } from "./storage/TransactionalTestStorage";
import secrets from "./util/secrets";

const storage = new TransactionalTestStorage();
(global as any).testStorage = storage;

// Isolated pg.Pool for auth-table cleanup (Decision 5 / research.md).
// better-auth writes session/verification/user/account rows on its own pool,
// outside the TransactionalTestStorage porsager transaction.  Those rows
// survive the per-test rollback and would corrupt isolation — we clean them
// up here after every rollback.
//
// Note: porsager/postgres uses "username" but pg/Pool uses "user".
// We remap here so pg.Pool can connect with the secrets.json credentials.
const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const authCleanupPool = new Pool({ ...restTestDb, user: dbUser, max: 1 });

const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();

beforeEach(async () => {
  await storage.beginTransaction();
});

afterEach(async () => {
  await storage.rollbackTransaction();

  // Clean up auth rows written outside the domain transaction.
  // Spare the seeded admin (compare on lowercase email) so loggedInAgent()
  // keeps working across tests.
  const client = await authCleanupPool.connect();
  try {
    await client.query('DELETE FROM "rateLimit"');
    await client.query('DELETE FROM "session"');
    await client.query('DELETE FROM "verification"');
    await client.query(
      `DELETE FROM "account" WHERE "userId" IN (
         SELECT id FROM "user" WHERE LOWER(email) != $1
       )`,
      [adminEmail]
    );
    await client.query('DELETE FROM "user" WHERE LOWER(email) != $1', [adminEmail]);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await storage.close();
  await authCleanupPool.end();
});
