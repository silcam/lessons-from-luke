/// <reference types="jest" />

import {
  last,
  findBy,
  findIndexBy,
  findByStrict,
  set,
  unset,
  modelListMerge,
  discriminate,
  uniq,
  count,
  insertSorted,
  all
} from "./arrayUtils";

test("findIndexBy finds item by key", () => {
  const items = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
  expect(findIndexBy(items, "id", 2)).toBe(1);
  expect(findIndexBy(items, "id", 99)).toBe(-1);
});

test("findByStrict returns item when found", () => {
  const items = [{ id: 1 }, { id: 2 }];
  expect(findByStrict(items, "id", 1)).toEqual({ id: 1 });
});

test("findByStrict throws when not found", () => {
  const items = [{ id: 1 }];
  expect(() => findByStrict(items, "id", 99)).toThrow("findByStrict");
});

test("set adds item when not already in list", () => {
  const list = ["a", "b"];
  set(list, "c");
  expect(list).toEqual(["a", "b", "c"]);
});

test("set does not add duplicate item", () => {
  const list = ["a", "b"];
  set(list, "a");
  expect(list).toEqual(["a", "b"]);
});

test("unset removes item when found", () => {
  const list = ["a", "b", "c"];
  unset(list, "b");
  expect(list).toEqual(["a", "c"]);
});

test("unset does nothing when item not found", () => {
  const list = ["a", "b"];
  unset(list, "z");
  expect(list).toEqual(["a", "b"]);
});

test("last", () => {
  expect(last([1, 2, 3])).toBe(3);
  expect(last([])).toBeUndefined();
});

test("modelListMerge", () => {
  const a = [{ id: "0" }, { id: "1", name: "Wilma" }, { id: "2" }];
  const b = [{ id: "1", name: "Fred" }, { id: "3" }];
  const out = [
    { id: "0" },
    { id: "1", name: "Fred" },
    { id: "2" },
    { id: "3" }
  ];
  expect(modelListMerge(a, b, (a, b) => a.id == b.id)).toEqual(out);
});

test("modelListMerge with sort function", () => {
  const a = [{ id: "3" }, { id: "1" }];
  const b = [{ id: "2" }];
  const result = modelListMerge(
    a, b,
    (a, b) => a.id == b.id,
    (a, b) => a.id.localeCompare(b.id)
  );
  expect(result.map(x => x.id)).toEqual(["1", "2", "3"]);
});

test("modelListMerge returns aList when bList is empty", () => {
  const a = [{ id: "1" }];
  expect(modelListMerge(a, [], (a, b) => a.id == b.id)).toEqual(a);
});

test("discriminate", () => {
  const list = [1, 2, 3, 4, 5, 7, 12, 44];
  const isEven = (num: number) => num % 2 == 0;
  const [evens, odds] = discriminate(list, isEven);
  expect(evens).toEqual([2, 4, 12, 44]);
  expect(odds).toEqual([1, 3, 5, 7]);

  expect(discriminate([], isEven)).toEqual([[], []]);
});

test("uniq", () => {
  expect(uniq([5, 1, 1, 2, 3, 4, 4, 3, 1, 2, 8])).toEqual([5, 1, 2, 3, 4, 8]);
  expect(uniq([])).toEqual([]);
  expect(uniq(["a", "b", "a"])).toEqual(["a", "b"]);
});

test("uniq with cb", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }];
  expect(uniq(items)).toEqual(items);
  expect(uniq(items, (a, b) => a.id == b.id)).toEqual([
    { id: 1 },
    { id: 2 },
    { id: 3 }
  ]);
});

test("count", () => {
  expect(count([], () => true)).toBe(0);
  expect(count([1, 2, 3], n => n > 1)).toBe(2);
});

test("all", () => {
  const a = [1, 2, 3, 4];
  expect(all(a, item => item > 0)).toBe(true);
  expect(all(a, item => item < 4)).toBe(false);
});

test("insertSorted", () => {
  const aBeforeB = (a: number, b: number) => a > b;
  expect(insertSorted([], 4, aBeforeB)).toEqual([4]);
  expect(insertSorted([3], 4, aBeforeB)).toEqual([4, 3]);
  expect(insertSorted([5], 4, aBeforeB)).toEqual([5, 4]);
  expect(insertSorted([7, 5, 3, 1], 4, aBeforeB)).toEqual([7, 5, 4, 3, 1]);
});
