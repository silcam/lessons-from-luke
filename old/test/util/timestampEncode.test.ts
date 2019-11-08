import { encode, decode } from "../../src/core/util/timestampEncode";
import MockDate from "mockdate";

const zero = 1514761200000;

test("base 36 encoder", () => {
  expect(encode(zero + 4)).toEqual("4");
  expect(encode(zero + 10)).toEqual("A");
  expect(encode(zero + 35)).toEqual("Z");
  expect(encode(zero + 36)).toEqual("01");
});

test("base 36 decoder", () => {
  expect(decode("4")).toBe(zero + 4);
  expect(decode("A")).toBe(zero + 10);
  expect(decode("Z")).toBe(zero + 35);
  expect(decode("01")).toBe(zero + 36);
});

test("timestamp encoder uses current date millis", () => {
  MockDate.set("2019-03-27");
  expect(encode()).toEqual(encode(new Date().valueOf()));
  MockDate.reset();
});

test("most importantly decode decodes encode", () => {
  const value = Date.now().valueOf();
  expect(decode(encode(value))).toBe(value);
});
