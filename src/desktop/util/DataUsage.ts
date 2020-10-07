export type DataUsage = { [date: string]: number };

export function dataUsageReport(usage: DataUsage): string {
  const total = Object.values(usage).reduce((sum, num) => sum + num);
  const avg = total / Object.keys(usage).length;

  const lastTenDays = Object.keys(usage).sort().reverse().slice(0, 10);
  const lastTenDaysLog = lastTenDays.map(
    date => `${date}  ${prettyNums(usage[date])}`
  );

  return `Total: ${prettyNums(total)}\nDaily Average: ${prettyNums(
    avg
  )}\n\n${lastTenDaysLog.join("\n")}`;
}

function prettyNums(num: number) {
  const gig = Math.pow(10, 9);
  const meg = Math.pow(10, 6);
  const kilo = Math.pow(10, 3);

  if (num > gig) return prettyFormat(num, gig, "G");
  if (num > meg) return prettyFormat(num, meg, "M");
  if (num > kilo) return prettyFormat(num, kilo, "K");
  return `${num}B`;
}

function prettyFormat(num: number, div: number, letter: string) {
  num = (num / div) * 100;
  num = Math.round(num);
  num = num / 100;
  return `${num}${letter}`;
}
