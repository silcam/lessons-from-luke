import { dataUsageReport } from "./DataUsage";

test("DataUsage Log - empty usage returns zero total", () => {
  expect(dataUsageReport({})).toBe("Total: 0B");
});

test("DataUsage Log", () => {
  const usage = {
    "2020-10-07": 13457,
    "2020-10-06": 12345123,
    "2020-10-08": 9123456788,
    "2020-09-30": 612
  };

  expect(dataUsageReport(usage)).toBe(
    "Total: 9.14G\nDaily Average: 2.28G\n\n2020-10-08  9.12G\n2020-10-07  13.46K\n2020-10-06  12.35M\n2020-09-30  612B"
  );
});

test("DataUsage - single day aggregation", () => {
  const usage = { "2021-06-15": 5000 };
  // Single day: total = 5000B, average = 5000B, one entry
  expect(dataUsageReport(usage)).toBe("Total: 5K\nDaily Average: 5K\n\n2021-06-15  5K");
});

test("DataUsage - bytes under 1K displayed as bytes", () => {
  const usage = { "2021-06-15": 500 };
  expect(dataUsageReport(usage)).toBe("Total: 500B\nDaily Average: 500B\n\n2021-06-15  500B");
});

test("DataUsage - megabyte range", () => {
  const usage = { "2021-06-15": 2500000 };
  expect(dataUsageReport(usage)).toBe("Total: 2.5M\nDaily Average: 2.5M\n\n2021-06-15  2.5M");
});

test("DataUsage - large counts (> 10 days) only shows last 10 in report", () => {
  const usage: { [key: string]: number } = {};
  for (let i = 1; i <= 15; i++) {
    const day = String(i).padStart(2, "0");
    usage[`2021-06-${day}`] = 1000 * i;
  }
  const report = dataUsageReport(usage);
  // The report should only include the last 10 days (06-06 to 06-15)
  expect(report).toContain("2021-06-15");
  expect(report).toContain("2021-06-06");
  expect(report).not.toContain("2021-06-05");
  expect(report).not.toContain("2021-06-01");
});

test("DataUsage - two days: average is mean of daily values", () => {
  const usage = {
    "2021-01-01": 2000,
    "2021-01-02": 4000
  };
  const report = dataUsageReport(usage);
  // total = 6000B = 6K, average = 3000B = 3K
  expect(report).toContain("Total: 6K");
  expect(report).toContain("Daily Average: 3K");
});

test("DataUsage - zero value entry displays as 0B", () => {
  const usage = {
    "2021-01-01": 1000,
    "2021-01-02": 0
  };
  const report = dataUsageReport(usage);
  expect(report).toContain("2021-01-02  0B");
});

test("DataUsage - report entries are sorted in descending date order", () => {
  const usage = {
    "2021-01-01": 100,
    "2021-01-03": 300,
    "2021-01-02": 200
  };
  const report = dataUsageReport(usage);
  const lines = report.split("\n");
  // Find the index of each date line
  const idx1 = lines.findIndex(l => l.startsWith("2021-01-03"));
  const idx2 = lines.findIndex(l => l.startsWith("2021-01-02"));
  const idx3 = lines.findIndex(l => l.startsWith("2021-01-01"));
  expect(idx1).toBeLessThan(idx2);
  expect(idx2).toBeLessThan(idx3);
});
