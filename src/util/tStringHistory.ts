import { TDocString } from "./Storage";

export type TStringHistory = {
  time: number;
  tStrings: TDocString[];
}[];

export default function tStringHistory(
  history: TStringHistory,
  oldTStrings: TDocString[],
  newTStrings: TDocString[]
) {
  const newHistItem = genHistDiff(oldTStrings, newTStrings);
  if (newHistItem.length == 0) return history;
  return history.concat([
    { time: Date.now().valueOf(), tStrings: newHistItem }
  ]);
}

function genHistDiff(oldTStrings: TDocString[], newTStrings: TDocString[]) {
  return oldTStrings.filter(oldTString => {
    const newTString = newTStrings[oldTString.id];
    return (
      oldTString.targetText.length > 0 &&
      !(newTString && oldTString.targetText == newTString.targetText)
    );
  });
}
