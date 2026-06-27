/**
 * Unit tests for sessionRevocation.ts
 *
 * Uses mock pg pool to verify:
 * - DELETE FROM "deviceCode" is called before DELETE FROM "session"
 * - Transaction rolls back if session delete fails
 * - revokedCount is accurate (sum of rows deleted from both tables)
 * - Structured audit log is emitted with userId, revokedCount, timestamp
 * - Session tokens are never logged
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Data model: data-model.md §Entity 1 (row cleanup on revoke)
 */

import { Pool, PoolClient, QueryResult } from "pg";
import { revokeUserSessions } from "./sessionRevocation";

// ------------------------------------------------------------------ helpers

function makeQueryResult(rowCount: number): QueryResult {
  return {
    rows: [],
    rowCount,
    command: "DELETE",
    oid: 0,
    fields: [],
  };
}

/**
 * Builds a mock PoolClient whose query() responses are consumed in order.
 * Pass Error instances to simulate query failures.
 */
function makeMockClient(queryResponses: Array<QueryResult | Error>): PoolClient {
  let callIndex = 0;

  const client = {
    query: jest.fn(async (_sql: string) => {
      const response = queryResponses[callIndex++];
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }),
    release: jest.fn(),
  } as unknown as PoolClient;

  return client;
}

function makeMockPool(client: PoolClient): Pool {
  return {
    connect: jest.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

// ------------------------------------------------------------------ tests

describe("revokeUserSessions", () => {
  const userId = "test-user-id-123";

  it("returns revokedCount = sum of deviceCode + session rows deleted", async () => {
    const client = makeMockClient([
      makeQueryResult(0), // BEGIN
      makeQueryResult(3), // DELETE deviceCode
      makeQueryResult(2), // DELETE session
      makeQueryResult(0), // COMMIT
    ]);
    const pool = makeMockPool(client);

    const result = await revokeUserSessions(pool, userId);

    expect(result.revokedCount).toBe(5);
    expect(client.release).toHaveBeenCalled();
  });

  it("returns revokedCount = 0 when user has no sessions or device codes", async () => {
    const client = makeMockClient([
      makeQueryResult(0), // BEGIN
      makeQueryResult(0), // DELETE deviceCode (none)
      makeQueryResult(0), // DELETE session (none)
      makeQueryResult(0), // COMMIT
    ]);
    const pool = makeMockPool(client);

    const result = await revokeUserSessions(pool, userId);

    expect(result.revokedCount).toBe(0);
  });

  it("deletes deviceCode rows BEFORE session rows", async () => {
    const queryOrder: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queryOrder.push(sql.trim());
        return makeQueryResult(0);
      }),
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = makeMockPool(client);

    await revokeUserSessions(pool, userId);

    const deviceCodeIndex = queryOrder.findIndex((q) => q.includes('"deviceCode"'));
    const sessionIndex = queryOrder.findIndex((q) => q.includes('"session"'));
    expect(deviceCodeIndex).toBeGreaterThanOrEqual(0);
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(deviceCodeIndex).toBeLessThan(sessionIndex);
  });

  it("rolls back the transaction and rethrows if session delete fails", async () => {
    const rollbackSeen: boolean[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        const trimmed = sql.trim();
        if (trimmed.startsWith("BEGIN")) return makeQueryResult(0);
        if (trimmed.includes('"deviceCode"')) return makeQueryResult(1);
        if (trimmed.includes('"session"')) throw new Error("session delete failed");
        if (trimmed.startsWith("ROLLBACK")) {
          rollbackSeen.push(true);
          return makeQueryResult(0);
        }
        return makeQueryResult(0);
      }),
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = makeMockPool(client);

    await expect(revokeUserSessions(pool, userId)).rejects.toThrow("session delete failed");

    expect(rollbackSeen).toContain(true);
    expect(client.release).toHaveBeenCalled();
  });

  it("emits a structured audit log with userId, revokedCount, and timestamp — no session tokens", async () => {
    const client = makeMockClient([
      makeQueryResult(0), // BEGIN
      makeQueryResult(2), // DELETE deviceCode
      makeQueryResult(1), // DELETE session
      makeQueryResult(0), // COMMIT
    ]);
    const pool = makeMockPool(client);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await revokeUserSessions(pool, userId);

    // Assert before restoring — mockRestore() calls mockReset() which clears call history.
    expect(logSpy).toHaveBeenCalled();
    const logArg = logSpy.mock.calls[0][0] as string;
    const logObj = JSON.parse(logArg) as Record<string, unknown>;

    logSpy.mockRestore();

    expect(logObj.userId).toBe(userId);
    expect(logObj.revokedCount).toBe(3);
    expect(typeof logObj.timestamp).toBe("string");
    // No session tokens must appear anywhere in the log output
    expect(JSON.stringify(logObj)).not.toMatch(/token/i);
  });
});
