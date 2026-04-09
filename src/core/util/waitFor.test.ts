/// <reference types="jest" />

import waitFor from "./waitFor";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("resolves immediately when condition is already true", async () => {
  const promise = waitFor(() => true);
  await promise;
});

test("resolves when condition becomes true after several checks", async () => {
  let count = 0;
  const promise = waitFor(() => {
    count++;
    return count >= 5;
  });
  jest.runAllTimers();
  await promise;
  expect(count).toBeGreaterThanOrEqual(5);
});

test("rejects when condition never becomes true within max intervals", async () => {
  const promise = waitFor(() => false);
  jest.runAllTimers();
  await expect(promise).rejects.toBeUndefined();
});

test("resolves on the first true check without scheduling extra timers", async () => {
  const cb = jest.fn(() => true);
  await waitFor(cb);
  expect(cb).toHaveBeenCalledTimes(1);
});
