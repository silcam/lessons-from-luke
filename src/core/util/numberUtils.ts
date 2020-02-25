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
