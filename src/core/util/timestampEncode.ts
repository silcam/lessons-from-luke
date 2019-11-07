const base = 36; // 10 digits and 26 letters
const reEpoch = 1514761200000; // move the starting point more into the recent past so that codes aren't as similar to each other

export function encode(timestamp = new Date().valueOf()) {
  let num = timestamp - reEpoch;
  let code = "";
  while (num > 0) {
    const rem = num % base;
    code += getCharacter(rem);
    num = (num - rem) / base;
  }
  return code;
}

export function decode(code: string) {
  let value = 0;
  for (let i = 0; i < code.length; ++i) {
    let charVal = parseInt(code.charAt(i));
    if (isNaN(charVal)) {
      charVal = code.charCodeAt(i) - 55; // 'A' => 65 => 10
    }
    value += charVal * Math.pow(36, i);
  }
  return value + reEpoch;
}

// value between 0 and 35 inclusive
function getCharacter(value: number) {
  if (value < 10) return `${value}`;
  return String.fromCharCode(value + 55); // value of 10 => 65 = 'A'
}
