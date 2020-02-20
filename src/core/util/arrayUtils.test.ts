import { last, modelListMerge, discriminate } from "./arrayUtils";

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

test("discriminate", () => {
  const list = [1, 2, 3, 4, 5, 7, 12, 44];
  const isEven = (num: number) => num % 2 == 0;
  const [evens, odds] = discriminate(list, isEven);
  expect(evens).toEqual([2, 4, 12, 44]);
  expect(odds).toEqual([1, 3, 5, 7]);

  expect(discriminate([], isEven)).toEqual([[], []]);
});
