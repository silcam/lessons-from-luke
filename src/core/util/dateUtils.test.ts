/// <reference types="jest" />

import { lastMonthStr, todayStr } from "./dateUtils";

describe("todayStr", () => {
  test("returns today in YYYY-MM-DD format", () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("returns a valid date string", () => {
    const result = todayStr();
    const parsed = new Date(result + "T00:00:00Z");
    expect(parsed.toJSON().slice(0, 10)).toBe(result);
  });
});

describe("lastMonthStr", () => {
  const RealDate = global.Date;

  afterEach(() => {
    (global as any).Date = RealDate;
  });

  test("returns last month in YYYY-MM format", () => {
    const result = lastMonthStr();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  test("in January returns December of previous year", () => {
    const fakeDate = new RealDate("2024-01-15T12:00:00Z");
    (global as any).Date = class MockDate {
      getUTCFullYear() {
        return fakeDate.getUTCFullYear();
      }
      getUTCMonth() {
        return fakeDate.getUTCMonth();
      }
    };
    expect(lastMonthStr()).toBe("2023-12");
  });

  test("in non-January returns previous month", () => {
    const fakeDate = new RealDate("2024-06-15T12:00:00Z");
    (global as any).Date = class MockDate {
      getUTCFullYear() {
        return fakeDate.getUTCFullYear();
      }
      getUTCMonth() {
        return fakeDate.getUTCMonth();
      }
    };
    expect(lastMonthStr()).toBe("2024-05");
  });

  test("in February returns previous month of same year", () => {
    const fakeDate = new RealDate("2024-02-10T12:00:00Z");
    (global as any).Date = class MockDate {
      getUTCFullYear() {
        return fakeDate.getUTCFullYear();
      }
      getUTCMonth() {
        return fakeDate.getUTCMonth();
      }
    };
    expect(lastMonthStr()).toBe("2024-01");
  });

  test("zero-pads single-digit months", () => {
    const fakeDate = new RealDate("2024-03-01T12:00:00Z");
    (global as any).Date = class MockDate {
      getUTCFullYear() {
        return fakeDate.getUTCFullYear();
      }
      getUTCMonth() {
        return fakeDate.getUTCMonth();
      }
    };
    expect(lastMonthStr()).toBe("2024-02");
  });
});
