import { zeroPad } from "./numberUtils";

// UTC!
export function lastMonthStr() {
  const date = new Date();
  const yearMonth: [number, number] = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1
  ];
  if (yearMonth[1] == 1) {
    yearMonth[0] = yearMonth[0] - 1;
    yearMonth[1] = 12;
  } else yearMonth[1] = yearMonth[1] - 1;

  return `${yearMonth[0]}-${zeroPad(yearMonth[1], 2)}`;
}

// UTC!
export function todayStr() {
  return new Date().toJSON().slice(0, 10);
}
