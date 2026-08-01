/// <reference types="jest" />

import { handleErrors } from "./WebAPI";

function mockRes() {
  return {
    _status: 200,
    _body: undefined as any,
    status(code: number) {
      this._status = code;
      return this;
    },
    send() {
      return this;
    },
    json(body: any) {
      this._body = body;
      return this;
    },
  } as any;
}

test("handleErrors: no error — runs callback without touching status", async () => {
  const res = mockRes();
  await handleErrors(res, async () => {});
  expect(res._status).toBe(200);
});

test("handleErrors: error with status field — sends that status", async () => {
  const res = mockRes();
  await handleErrors(res, async () => {
    throw { status: 422 };
  });
  expect(res._status).toBe(422);
});

test("handleErrors: error with status and body fields — sends status and forwards the body as JSON", async () => {
  const res = mockRes();
  await handleErrors(res, async () => {
    throw { status: 422, body: { reason: "tooLong" } };
  });
  expect(res._status).toBe(422);
  expect(res._body).toEqual({ reason: "tooLong" });
});

test("handleErrors: error with a body field but a 500 status — does not forward the body", async () => {
  const res = mockRes();
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await handleErrors(res, async () => {
    throw { status: 500, body: { secret: "internal detail" } };
  });
  expect(res._status).toBe(500);
  expect(res._body).toBeUndefined();
  spy.mockRestore();
});

test("handleErrors: error without status field — defaults to 500 and logs", async () => {
  const res = mockRes();
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await handleErrors(res, async () => {
    throw new Error("unexpected boom");
  });
  expect(res._status).toBe(500);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

test("handleErrors: error with non-HTTP integer status (e.g. unzip exit code 9) — defaults to 500", async () => {
  const res = mockRes();
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const err: any = new Error("unzip failed");
  err.status = 9;
  await handleErrors(res, async () => {
    throw err;
  });
  expect(res._status).toBe(500);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

test("handleErrors: error with non-integer status — defaults to 500", async () => {
  const res = mockRes();
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await handleErrors(res, async () => {
    throw { status: "ENOENT" };
  });
  expect(res._status).toBe(500);
  spy.mockRestore();
});
