const base = 36; // 10 digits and 26 letters
const reEpoch = 1514761200000; // move the starting point more into the recent past so that codes aren't as similar to each other

export default function encode(timestamp = new Date().valueOf()) {
  let num = timestamp - reEpoch;
  let code = "";
  while (num > 0) {
    const rem = num % base;
    code += getCharacter(rem);
    num = (num - rem) / base;
  }
  return code;
}

// value between 0 and 35 inclusive
function getCharacter(value: number) {
  if (value < 10) return `${value}`;
  return String.fromCharCode(value + 55); // value of 10 => 65 = 'A'
}
