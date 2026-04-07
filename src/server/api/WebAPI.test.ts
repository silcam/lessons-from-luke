/// <reference types="jest" />

import { handleErrors } from "./WebAPI";

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
