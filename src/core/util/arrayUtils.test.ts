import { last, modelListMerge } from "./arrayUtils";

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
