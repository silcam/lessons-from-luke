import { randInt, zeroPad } from "./numberUtils";

test("Random Int", () => {
  const num = randInt(5);
  expect(num).toBeGreaterThanOrEqual(0);
  expect(num).toBeLessThan(10);
});

test("zeroPad", () => {
  expect(zeroPad(4, 3)).toBe("004");
  expect(zeroPad(123, 3)).toBe("123");
  expect(zeroPad(1234, 3)).toBe("1234");
});
