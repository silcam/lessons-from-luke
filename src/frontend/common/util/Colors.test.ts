import { darker } from "./Colors";

test("Darker", () => {
  expect(darker("#3f88c5")).toBe("#3470a2");
});
