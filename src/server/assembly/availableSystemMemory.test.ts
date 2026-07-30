/// <reference types="jest" />

import { parseMemAvailable } from "./availableSystemMemory";

/** A realistic (truncated) `/proc/meminfo`, with MemAvailable off the first line. */
const MEMINFO = `MemTotal:        1963236 kB
MemFree:          310364 kB
MemAvailable:    1374208 kB
Buffers:           58112 kB
Cached:           932048 kB
SwapTotal:             0 kB
SwapFree:              0 kB
`;

describe("parseMemAvailable", () => {
  it("reads MemAvailable from a multi-line /proc/meminfo and returns bytes", () => {
    expect(parseMemAvailable(MEMINFO)).toBe(1_374_208 * 1024);
  });

  it("returns undefined when MemAvailable is absent", () => {
    expect(parseMemAvailable("MemTotal:        1963236 kB\nMemFree:  310364 kB\n")).toBeUndefined();
  });

  it("returns undefined for garbage input", () => {
    expect(parseMemAvailable("")).toBeUndefined();
    expect(parseMemAvailable("not a proc file at all")).toBeUndefined();
    expect(parseMemAvailable("MemAvailable:    lots kB\n")).toBeUndefined();
  });
});
