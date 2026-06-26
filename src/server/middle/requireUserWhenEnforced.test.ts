/// <reference types="jest" />

import type { Request, Response, NextFunction } from "express";

// Mock the ESM-only auth chain before anything else loads it
jest.mock("../auth/auth");
// Mock enforcementFlag so tests control the flag value
jest.mock("../util/enforcementFlag");
// Mock requireUser with a factory so the real module (and its auth deps) never loads
jest.mock("./requireUser", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { isEnforcementEnabled } from "../util/enforcementFlag";
import requireUser from "./requireUser";

const mockIsEnforcementEnabled = isEnforcementEnabled as jest.MockedFunction<
  typeof isEnforcementEnabled
>;
const mockRequireUser = requireUser as jest.MockedFunction<typeof requireUser>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: requireUserWhenEnforced } = require("./requireUserWhenEnforced") as {
  default: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
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
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

function mockNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

describe("requireUserWhenEnforced middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls next() immediately when enforcement is disabled (flag off)", async () => {
    mockIsEnforcementEnabled.mockReturnValue(false);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUserWhenEnforced(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  test("delegates to requireUser when enforcement is enabled and no session → 401", async () => {
    mockIsEnforcementEnabled.mockReturnValue(true);
    mockRequireUser.mockImplementation(async (_req, res, _next) => {
      res.status(401).json({ error: "Unauthorized" });
    });

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUserWhenEnforced(req, res, next);

    expect(mockRequireUser).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("delegates to requireUser when enforcement is enabled and session is valid → next()", async () => {
    mockIsEnforcementEnabled.mockReturnValue(true);
    mockRequireUser.mockImplementation(async (_req, _res, next) => {
      next();
    });

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await requireUserWhenEnforced(req, res, next);

    expect(mockRequireUser).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });
});
