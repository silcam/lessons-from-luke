/// <reference types="jest" />

import { encode, decode } from "./timestampEncode";

describe("encode", () => {
  test("encodes a known timestamp to a non-empty string", () => {
    const result = encode(1594232387331);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("uses current time when no argument provided", () => {
    const result = encode();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("produces consistent output for same input", () => {
    const ts = 1594232387331;
    expect(encode(ts)).toBe(encode(ts));
  });
});

describe("decode", () => {
  test("decodes a numeric-only code", () => {
    // encode a timestamp that produces only digit characters
    // Small offset from reEpoch gives a small number (< 36 iterations)
    const ts = 1514761200001; // reEpoch + 1, encodes to a single digit "1"
    const code = encode(ts);
    const decoded = decode(code);
    expect(decoded).toBe(ts);
  });

  test("decodes a code with letter characters", () => {
    // A larger timestamp will produce letter characters (values >= 10 use A-Z)
    const ts = 1594232387331;
    const code = encode(ts);
    // Verify the code contains at least one letter (A-Z) since the encoded value is large
    expect(code).toMatch(/[A-Z]/);
    const decoded = decode(code);
    expect(decoded).toBe(ts);
  });

  test("encode and decode are inverse operations", () => {
    const timestamps = [1514761200001, 1594232387331, 1700000000000];
    timestamps.forEach(ts => {
      expect(decode(encode(ts))).toBe(ts);
    });
  });
});
