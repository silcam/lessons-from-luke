/// <reference types="jest" />

/**
 * Tests for src/server/middle/requireSameOrigin.ts
 *
 * Covers all 6 distinct branches:
 *   1. test-mode skip (NODE_ENV=test, BETTER_AUTH_ENFORCE_ORIGIN unset)
 *   2. no allowed origins guard → 403
 *   3. no Origin and no Referer → 403
 *   4. valid Origin matching allowed origin → next()
 *   5. Origin not in allow-list → 403
 *   6. valid Referer (no Origin) → extracts origin, calls next()
 *   7. malformed Referer string → 403 (URL parse fails, candidate stays undefined)
 *   8. trailing-slash normalization (allowed='http://x', candidate='http://x/')
 */

import type { Request, Response, NextFunction } from "express";

// Mock trustedOrigins so tests control the allowed-origins list independently
// of env-var state (except where we explicitly test the skip logic).
jest.mock("../auth/trustedOrigins");

import { getTrustedOrigins } from "../auth/trustedOrigins";

const mockGetTrustedOrigins = getTrustedOrigins as jest.MockedFunction<typeof getTrustedOrigins>;

// Import the module under test via require so it picks up the jest.mock() above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireSameOrigin } = require("./requireSameOrigin") as {
  requireSameOrigin: (req: Request, res: Response, next: NextFunction) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function mockNext(): jest.Mock & NextFunction {
  return jest.fn() as unknown as jest.Mock & NextFunction;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireSameOrigin middleware", () => {
  let savedEnforceOrigin: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    // Save and clear the enforcement flag so each test starts clean.
    savedEnforceOrigin = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    delete process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    // Default: return a valid allow-list so tests that set the flag don't
    // accidentally hit the "no allowed origins" branch unless they want to.
    mockGetTrustedOrigins.mockReturnValue(["http://localhost:8080"]);
  });

  afterEach(() => {
    if (savedEnforceOrigin === undefined) {
      delete process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    } else {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnforceOrigin;
    }
  });

  // -------------------------------------------------------------------------
  // Branch 1: test-mode skip
  // -------------------------------------------------------------------------
  test("NODE_ENV=test without BETTER_AUTH_ENFORCE_ORIGIN=1 → skips check, calls next()", () => {
    // NODE_ENV is already 'test' in the Jest environment; enforcement flag is absent.
    const req = mockReq(); // no origin or referer — would 403 if the check ran
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Branch 2: no allowed origins configured → 403
  // -------------------------------------------------------------------------
  test("no allowed origins configured → 403", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    mockGetTrustedOrigins.mockReturnValue(null);

    const req = mockReq({ origin: "http://localhost:8080" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Branch 3: no Origin and no Referer → 403
  // -------------------------------------------------------------------------
  test("no Origin and no Referer → 403", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    const req = mockReq(); // no origin, no referer
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Branch 4: valid Origin matching allowed origin → next()
  // -------------------------------------------------------------------------
  test("valid Origin matching allowed origin → calls next()", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    const req = mockReq({ origin: "http://localhost:8080" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Branch 5: Origin not in allow-list → 403
  // -------------------------------------------------------------------------
  test("Origin not in allow-list → 403", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    const req = mockReq({ origin: "http://evil.example.com" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Branch 6: valid Referer (no Origin) → extracts origin, calls next()
  // -------------------------------------------------------------------------
  test("valid Referer without Origin → extracts origin, calls next()", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    const req = mockReq({ referer: "http://localhost:8080/some/path?query=1" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Branch 7: malformed Referer string → 403
  // -------------------------------------------------------------------------
  test("malformed Referer string → 403 (URL parse fails, candidate stays undefined)", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    const req = mockReq({ referer: "not-a-valid-url" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Branch 8: trailing-slash normalization
  // -------------------------------------------------------------------------
  test("trailing-slash normalization: Origin with trailing slash matches allow-list entry without it", () => {
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    // Allow-list has no trailing slash; request Origin has one.
    mockGetTrustedOrigins.mockReturnValue(["http://localhost:8080"]);

    const req = mockReq({ origin: "http://localhost:8080/" });
    const res = mockRes();
    const next = mockNext();

    requireSameOrigin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });
});
