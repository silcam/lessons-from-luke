/// <reference types="jest" />

import requireUser, { isLoggedIn } from "./requireUser";

function mockReq(sessionData?: Record<string, any>) {
  return {
    session: sessionData
  } as any;
}

function mockRes() {
  return {
    _status: 200,
    status(code: number) {
      this._status = code;
      return this;
    },
    send() {
      return this;
    }
  } as any;
}

describe("isLoggedIn", () => {
  test("returns true when session has userId", () => {
    expect(isLoggedIn(mockReq({ userId: 1 }))).toBe(true);
  });

  test("returns false when session is absent", () => {
    expect(isLoggedIn(mockReq(undefined))).toBe(false);
  });

  test("returns false when session exists but userId is missing", () => {
    expect(isLoggedIn(mockReq({}))).toBe(false);
  });

  test("returns false when userId is null", () => {
    expect(isLoggedIn(mockReq({ userId: null }))).toBe(false);
  });
});

describe("requireUser middleware", () => {
  test("calls next() when user is logged in", () => {
    const req = mockReq({ userId: 42 });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("responds with 401 when session is absent", () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test("responds with 401 when userId is missing from session", () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});
