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

// Mock user ID used by the better-auth unit-test shim (__mocks__/better-auth.cjs).
// Controller tests that call admin routes need this row to exist in "user" so that
// the invitation.invitedBy FK is satisfied (invitedBy = req.user.id = "user-test-id").
const MOCK_USER_ID = "user-test-id";

// This setup file is shared by the unit suite (jest.config.js) and the integration
// suite (jest.integration.config.js). The mock-admin row below exists ONLY for the
// unit suite, whose better-auth shim reports req.user.id = MOCK_USER_ID. The
// integration suite runs against a real better-auth server with a real seeded
// admin, so an extra admin=true row here would break US4's "exactly one admin"
// assertions. INTEGRATION_SERVER_URL is set by jestIntegrationGlobalSetup.ts
// before Jest forks workers, so it is visible in every integration worker.
const IS_INTEGRATION = !!process.env.INTEGRATION_SERVER_URL;

beforeEach(async () => {
  await storage.beginTransaction();

  // Ensure the mock user row exists for invitation FK tests — unit suite only.
  // The integration suite uses real seeded users; seeding a second admin here
  // would break its "exactly one admin" assertions (US4).
  if (IS_INTEGRATION) return;

  const client = await authCleanupPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,'mock-admin@test.example.invalid','Mock Admin',true,false,NOW(),NOW())
       ON CONFLICT ("id") DO NOTHING`,
      [MOCK_USER_ID]
    );
  } finally {
    client.release();
  }
});

afterEach(async () => {
  await storage.rollbackTransaction();

  // Clean up auth rows written outside the domain transaction.
  // Spare the seeded admin (compare on lowercase email) so loggedInAgent()
  // keeps working across tests.
  const client = await authCleanupPool.connect();
  try {
    await client.query('DELETE FROM "invitationRateLimit"');
    await client.query('DELETE FROM "rateLimit"');
    await client.query('DELETE FROM "session"');
    await client.query('DELETE FROM "verification"');
    await client.query('DELETE FROM "invitation"');
    await client.query(
      `DELETE FROM "account" WHERE "userId" IN (
         SELECT id FROM "user" WHERE LOWER(email) != $1
       )`,
      [adminEmail]
    );
    // Spare the seeded admin (by email) so loggedInAgent() keeps working across
    // tests. In the unit suite, also spare the mock user (by ID) so the
    // invitation.invitedBy FK stays satisfied for controller tests using the
    // better-auth unit-test shim (req.user.id = "user-test-id"). The integration
    // suite has no mock user and must not retain extra admin rows (US4), so it
    // deletes every non-seeded user.
    if (IS_INTEGRATION) {
      await client.query(`DELETE FROM "user" WHERE LOWER(email) != $1`, [adminEmail]);
    } else {
      await client.query(`DELETE FROM "user" WHERE LOWER(email) != $1 AND id != $2`, [
        adminEmail,
        MOCK_USER_ID,
      ]);
    }
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await storage.close();
  await authCleanupPool.end();
});
