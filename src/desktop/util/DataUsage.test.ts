import { dataUsageReport } from "./DataUsage";

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
