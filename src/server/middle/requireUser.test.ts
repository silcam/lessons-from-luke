/// <reference types="jest" />

import type { Request, Response, NextFunction } from "express";

// Mock the auth module before importing the middleware under test
jest.mock("../auth/auth");

import { getAuth } from "../auth/auth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireUserModule = require("./requireUser") as {
  default: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  loadSession: (req: Request) => Promise<unknown>;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};

const requireUser = requireUserModule.default;
const { loadSession, requireAdmin } = requireUserModule;

const mockGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

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

describe("requireUser middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls next() when req.user is set (valid session)", async () => {
    mockGetAuth.mockReturnValue(makeMockAuth(async () => ({ user: { id: "u1", admin: false } })));

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
