import { lastMonthStr } from "./dateUtils";

test.skip("Last Month", () => {
  expect(lastMonthStr()).toBe("2020-09");
});
