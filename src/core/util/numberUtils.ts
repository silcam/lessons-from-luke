// return x s.t. 0 <= x < size
export function randInt(size: number) {
  return Math.floor(Math.random() * size);
}

export function zeroPad(num: number | string, digits: number) {
  const s = num.toString();
  if (s.length >= digits) return s;

  const zeros = new Array(digits - s.length).fill("0").join("");
  return zeros + s;
}

export function percent(fraction: number, whole: number) {
  if (whole == 0) return 0;
  return Math.round((100 * fraction) / whole);
}

export function average(nums: number[]) {
  if (nums.length == 0) return 0;
  return sum(nums) / nums.length;
}

export function sum(nums: number[]) {
  return nums.reduce((sum, num) => sum + num, 0);
}
