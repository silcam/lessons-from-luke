/// <reference types="jest" />

import bestMatchMap from "./bestMatchMap";

describe("bestMatchMap", () => {
  test("matches identical single elements", () => {
    const result = bestMatchMap(["a"], ["a"], (a, b) => (a === b ? 1 : 0));
    expect(result).toEqual([[0, 0]]);
  });

  test("matches best pairs in aligned arrays", () => {
    const a = ["x", "y"];
    const b = ["x", "y"];
    const comp = (a: string, b: string) => (a === b ? 1 : 0);
    const result = bestMatchMap(a, b, comp);
    expect(result).toContainEqual([0, 0]);
    expect(result).toContainEqual([1, 1]);
  });

  test("ignores non-matching pairs (score 0)", () => {
    const a = ["a"];
    const b = ["z"];
    const result = bestMatchMap(a, b, () => 0);
    expect(result).toEqual([]);
  });

  test("finds best diagonal match over suboptimal direct matches", () => {
    const a = [1, 2];
    const b = [1, 2];
    const comp = (x: number, y: number) => (x === y ? 2 : 0);
    const result = bestMatchMap(a, b, comp);
    expect(result).toContainEqual([0, 0]);
    expect(result).toContainEqual([1, 1]);
  });

  test("handles mismatched array lengths", () => {
    const a = ["a", "b", "c"];
    const b = ["a", "c"];
    const comp = (x: string, y: string) => (x === y ? 1 : 0);
    const result = bestMatchMap(a, b, comp);
    // Should match "a" -> "a" and "c" -> "c"
    expect(result).toContainEqual([0, 0]);
    expect(result).toContainEqual([2, 1]);
  });
});
