/// <reference types="jest" />

import type { Request, Response, NextFunction } from "express";

// Mock the auth module before importing the middleware under test
jest.mock("../auth/auth");

import { getAuth, getAuthPool } from "../auth/auth";

const requireUserModule = require("./requireUser") as {
  default: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  loadSession: (req: Request) => Promise<unknown>;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};

const requireUser = requireUserModule.default;
const { loadSession, requireAdmin } = requireUserModule;

const mockGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockGetAuthPool = getAuthPool as jest.MockedFunction<typeof getAuthPool>;

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
  } as unknown as Request;
}

function mockRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    send(body?: unknown) {
      res._body = body;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

function mockNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

function makeMockAuth(getSessionImpl: () => Promise<unknown>) {
  return {
    api: {
      getSession: jest.fn(getSessionImpl),
    },
  } as unknown as ReturnType<typeof getAuth>;
}

/**
 * Builds a fake pg.Pool whose `query()` resolves/rejects per `queryImpl`.
 * Used to stub the `SELECT "deactivatedAt" FROM "user" WHERE id = $1`
 * lookup that `loadSession()` performs after a valid session is found
 * (data-model.md §Enforcement points).
 */
function makeMockPool(queryImpl: () => Promise<{ rows: Array<{ deactivatedAt: Date | null }> }>) {
  return {
    query: jest.fn(queryImpl),
  } as unknown as ReturnType<typeof getAuthPool>;
}

/** Default "active user" pool stub — the common case for tests below. */
function activePoolStub() {
  return makeMockPool(async () => ({ rows: [{ deactivatedAt: null }] }));
}

describe("requireUser middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls next() when req.user is set (valid session)", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u1", admin: false } })));
    mockGetAuthPool.mockReturnValue(activePoolStub());

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("responds 401 and does NOT call next() when getSession returns null", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => null));

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("responds 401 and does NOT call next() when getSession throws (fail-closed)", async () => {
    mockGetAuth.mockReturnValue(
      makeMockAuth(async () => {
        throw new Error("session store unavailable");
      })
    );

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

describe("requireAdmin middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls next() when req.user exists and admin is true", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u1", admin: true } })));
    mockGetAuthPool.mockReturnValue(activePoolStub());

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("responds 401 and does NOT call next() when no session (getSession returns null)", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => null));

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("responds 403 and does NOT call next() when user exists but admin is false", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u1", admin: false } })));
    mockGetAuthPool.mockReturnValue(activePoolStub());

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  test("responds 401 and does NOT call next() when getSession throws (fail-closed)", async () => {
    mockGetAuth.mockReturnValue(
      makeMockAuth(async () => {
        throw new Error("db connection lost");
      })
    );

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

describe("loadSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns session data when getSession resolves", async () => {
    const sessionData = { user: { id: "u1", admin: true } };
    mockGetAuth.mockReturnValue(makeMockAuth(async () => sessionData));
    mockGetAuthPool.mockReturnValue(activePoolStub());

    const req = mockReq();
    const result = await loadSession(req);

    expect(result).toEqual(sessionData);
  });

  test("returns null when getSession throws", async () => {
    mockGetAuth.mockReturnValue(
      makeMockAuth(async () => {
        throw new Error("unexpected error");
      })
    );

    const req = mockReq();
    const result = await loadSession(req);

    expect(result).toBeNull();
  });
});

// ------------------------------------------------------------------
// US2 / FR-005: deactivation enforcement at the session-load checkpoint.
//
// data-model.md §Enforcement points: after getSession() returns a session,
// loadSession() must SELECT "deactivatedAt" FROM "user" WHERE id = $1 and,
// if non-NULL, treat the request as unauthenticated (return null, leave
// req.user unset) -- even though better-auth itself still considers the
// session valid. Both the positive check and its error path MUST fail
// closed (deny), never swallow-and-continue.
//
// RED: none of this exists yet -- loadSession() never calls getAuthPool(),
// so these assertions fail against the current implementation.
// ------------------------------------------------------------------
describe("loadSession — deactivation enforcement (US2/FR-005)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("a deactivated user's otherwise-valid session is treated as unauthenticated", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u1", admin: false } })));
    mockGetAuthPool.mockReturnValue(
      makeMockPool(async () => ({
        rows: [{ deactivatedAt: new Date("2026-06-01T00:00:00Z") }],
      }))
    );

    const req = mockReq();
    const result = await loadSession(req);

    expect(result).toBeNull();
    expect(req.user).toBeUndefined();
  });

  test("an active user's valid session still succeeds normally (no regression)", async () => {
    const sessionData = { user: { id: "u2", admin: false } };
    mockGetAuth.mockReturnValue(makeMockAuth(async () => sessionData));
    mockGetAuthPool.mockReturnValue(activePoolStub());

    const req = mockReq();
    const result = await loadSession(req);

    expect(result).toEqual(sessionData);
    expect(req.user).toEqual({ id: "u2", admin: false });
  });

  test("fails closed: a deactivatedAt lookup error is treated as unauthenticated, not a thrown error", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u3", admin: false } })));
    mockGetAuthPool.mockReturnValue(
      makeMockPool(async () => {
        throw new Error("deactivatedAt lookup failed");
      })
    );

    const req = mockReq();
    const result = await loadSession(req);

    expect(result).toBeNull();
    expect(req.user).toBeUndefined();
  });
});
