import { onlyWhitespace } from "./stringUtils";

test("onlyWhitespace", () => {
  expect(onlyWhitespace("    \t\n")).toBe(true);
  expect(onlyWhitespace("   a  ")).toBe(false);
  expect(onlyWhitespace("   .  ")).toBe(false);
});
