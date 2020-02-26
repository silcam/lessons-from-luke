import {
  unset,
  validateFields,
  Field,
  objKeys,
  objFilter
} from "./objectUtils";

test("Unset", () => {
  const obj = { a: 1, b: 2, c: 3 };
  expect(unset(obj, "a")).toEqual({ b: 2, c: 3 });
});

test("Validate: All Valid", () => {
  const obj = { a: 1, b: "two", c: ["three"], d: [], e: 4 };
  const fields: Field<typeof obj>[] = [
    ["a", "number"],
    ["b", "string"],
    ["c", "string[]"],
    ["d", "string[]"]
    // No e - extra fields are OK
  ];
  expect(validateFields(obj, fields)).toBe(true);
});

test("Validate: Several invalid", () => {
  expect(validateFields({ a: "1" }, ["a", "number"] as any)).toBe(false);
  expect(validateFields({ a: 1 }, ["b", "number"] as any)).toBe(false);
  expect(validateFields({ a: 1 }, ["a", "string"] as any)).toBe(false);
  expect(validateFields({ a: "1" }, ["b", "string"] as any)).toBe(false);
  expect(validateFields({ a: [1] }, ["a", "string[]"] as any)).toBe(false);
  expect(validateFields({ a: [1] }, ["b", "string[]"] as any)).toBe(false);
  expect(
    validateFields({ a: 1, b: 2, c: "3" }, [
      ["a", "number"],
      ["b", "string"],
      ["c", "string"]
    ] as any)
  ).toBe(false);
});

test("Validate: not an object", () => {
  expect(validateFields("string", ["a", "number"] as any)).toBe(false);
  expect(validateFields(44, ["a", "number"] as any)).toBe(false);
  expect(validateFields([1, 2, 3], ["a", "number"] as any)).toBe(false);
});

test("objKeys", () => {
  expect(objKeys({ a: 1, b: 2 })).toEqual(["a", "b"]);
});

test("objFilter", () => {
  const obj = { a: 1, b: 2, c: 3 };
  expect(objFilter(obj, ["a", "c", "d"])).toEqual({ a: 1, c: 3 });
  expect(objFilter(obj, [] as string[])).toEqual({});
  expect(objFilter({}, ["a"])).toEqual({});
});
