import { isAppError, asAppError } from "./AppError";

test("isAppError", () => {
  expect(isAppError({ type: "HTTP", status: 500 })).toBe(true);
  expect(isAppError({ type: "HTTP", status: "500" })).toBe(false);
  expect(isAppError({ type: "HTTP" })).toBe(false);
  expect(isAppError({ type: "Nonexistant" })).toBe(false);
  expect(isAppError({})).toBe(false);
});

test("asAppError", () => {
  const httpError = { type: "HTTP", status: 500 };
  expect(asAppError(httpError)).toBe(httpError);
  expect(asAppError({ something: "else" })).toEqual({ type: "Unknown" });
});
