import encode from "../../src/util/timestampEncode";
import MockDate from "mockdate";

const zero = 1514761200000;

test("base 36 encoder", () => {
  expect(encode(zero + 4)).toEqual("4");
  expect(encode(zero + 10)).toEqual("A");
  expect(encode(zero + 35)).toEqual("Z");
  expect(encode(zero + 36)).toEqual("01");
});

test("timestamp encoder uses current date millis", () => {
  MockDate.set("2019-03-27");
  expect(encode()).toEqual(encode(new Date().valueOf()));
  MockDate.reset();
});
