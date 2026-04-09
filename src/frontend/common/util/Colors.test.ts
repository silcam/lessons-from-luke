import { darker, faded } from "./Colors";

test("Darker", () => {
  expect(darker("#3f88c5")).toBe("#3470a2");
  expect(darker("#d00000")).toBe("#ab0000");
});

test("faded appends 99 to color for transparency", () => {
  expect(faded("#3f88c5")).toBe("#3f88c599");
  expect(faded("#fff")).toBe("#fff99");
});
