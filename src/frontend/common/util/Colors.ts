import { zeroPad } from "../../../core/util/numberUtils";

// https://coolors.co/1c3144-d00000-ffba08-a2aebb-3f88c5

const Colors = {
  primary: "#3f88c5",
  highlight: "#ffba08",
  darkBG: "#1c3144",
  // lightGrey: "#a2aebb",
  lightGrey: "#eee",
  success: "#39b54a",
  warning: "#ffba08",
  danger: "#d00000"
};

// const Colors = {
//   grey: "#4c5454",
//   lightGrey: "#adb1b1",
//   orangish: "#ff715b",
//   green: "#1ea896",
//   brown: "#523f38",
//   darker: {
//     orangish: "#d15d4b",
//     green: "#198a7b"
//   }
// };

export function faded(color: string) {
  return `${color}99`;
}

export function darker(color: string) {
  return (
    "#" +
    [1, 3, 5]
      .map(i =>
        zeroPad(
          Math.round(parseInt(color.substr(i, 2), 16) * 0.82).toString(16),
          2
        )
      )
      .join("")
  );
}

export default Colors;
