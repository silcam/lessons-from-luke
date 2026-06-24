/// <reference types="jest" />

import { Request, Response, NextFunction } from "express";
import normalizeForwardedProto from "./normalizeForwardedProto";

// Build a minimal mock req/res/next. We only exercise req.headers and next().
function mockCtx(headers: Record<string, string | string[] | undefined>): {
  req: Request;
  res: Response;
  next: jest.Mock<void, []> & NextFunction;
} {
  const req = { headers } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn() as jest.Mock<void, []> & NextFunction;
  return { req, res, next };
}

describe("normalizeForwardedProto", () => {
  test('doubled "https, https" collapses to "https"', () => {
    const { req, res, next } = mockCtx({ "x-forwarded-proto": "https, https" });
    normalizeForwardedProto(req, res, next);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("single value is left unchanged", () => {
    const { req, res, next } = mockCtx({ "x-forwarded-proto": "https" });
    normalizeForwardedProto(req, res, next);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('array form ["https", "https"] collapses to "https"', () => {
    const { req, res, next } = mockCtx({ "x-forwarded-proto": ["https", "https"] });
    normalizeForwardedProto(req, res, next);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("missing header is left untouched (no key added)", () => {
    const { req, res, next } = mockCtx({ host: "example.com" });
    normalizeForwardedProto(req, res, next);
    expect("x-forwarded-proto" in req.headers).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("surrounding whitespace is trimmed", () => {
    const { req, res, next } = mockCtx({ "x-forwarded-proto": "  https ,  http " });
    normalizeForwardedProto(req, res, next);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("calls next() exactly once", () => {
    const { req, res, next } = mockCtx({ "x-forwarded-proto": "https, https" });
    normalizeForwardedProto(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
