/// <reference types="jest" />

import {
  parseLibreOfficeVersion,
  isVersionAtLeast,
  assertLibreOfficeSupported,
  MIN_SUPPORTED_VERSION,
} from "./libreOfficeVersion";

describe("parseLibreOfficeVersion", () => {
  test("parses a standard Linux --version string", () => {
    expect(parseLibreOfficeVersion("LibreOffice 7.3.7.2 30(Build:2)")).toEqual({
      major: 7,
      minor: 3,
    });
  });

  test("parses a two-digit major/minor string", () => {
    expect(parseLibreOfficeVersion("LibreOffice 25.8.1.2")).toEqual({ major: 25, minor: 8 });
  });

  test("parses a bare major.minor with no patch", () => {
    expect(parseLibreOfficeVersion("LibreOffice 7.4")).toEqual({ major: 7, minor: 4 });
  });

  test("returns null for unparseable/garbage input", () => {
    expect(parseLibreOfficeVersion("")).toBeNull();
    expect(parseLibreOfficeVersion("command not found: soffice")).toBeNull();
    expect(parseLibreOfficeVersion("LibreOffice")).toBeNull();
  });
});

describe("isVersionAtLeast", () => {
  test("higher major always passes regardless of minor", () => {
    expect(isVersionAtLeast({ major: 25, minor: 0 }, { major: 7, minor: 4 })).toBe(true);
  });

  test("same major, minor below floor fails", () => {
    expect(isVersionAtLeast({ major: 7, minor: 3 }, { major: 7, minor: 4 })).toBe(false);
  });

  test("same major, minor at floor passes", () => {
    expect(isVersionAtLeast({ major: 7, minor: 4 }, { major: 7, minor: 4 })).toBe(true);
  });

  test("lower major fails even with a much higher minor", () => {
    expect(isVersionAtLeast({ major: 6, minor: 99 }, { major: 7, minor: 4 })).toBe(false);
  });
});

describe("assertLibreOfficeSupported", () => {
  test("7.3.7 (below floor) throws with a clear upgrade message", () => {
    expect(() => assertLibreOfficeSupported("LibreOffice 7.3.7.2 30(Build:2)")).toThrow(
      /LibreOffice >= 24\.2 required for the assembleQuarter integration suite \(found 7\.3\.7\)/
    );
  });

  test("7.4.5 (below the new floor) throws with a clear upgrade message", () => {
    expect(() => assertLibreOfficeSupported("LibreOffice 7.4.5.1")).toThrow(
      /LibreOffice >= 24\.2 required for the assembleQuarter integration suite \(found 7\.4\.5\)/
    );
  });

  test("24.2.7 (at floor, matching production/staging) passes", () => {
    expect(() => assertLibreOfficeSupported("LibreOffice 24.2.7.2 420(Build:2)")).not.toThrow();
  });

  test("25.8.1 (well above floor) passes", () => {
    expect(() => assertLibreOfficeSupported("LibreOffice 25.8.1.2")).not.toThrow();
  });

  test("garbage input throws a clear parse error, not a crash", () => {
    expect(() => assertLibreOfficeSupported("not a version string")).toThrow(
      /Could not parse LibreOffice version/
    );
  });

  test("MIN_SUPPORTED_VERSION matches the documented (24, 2) floor", () => {
    expect(MIN_SUPPORTED_VERSION).toEqual({ major: 24, minor: 2 });
  });
});
