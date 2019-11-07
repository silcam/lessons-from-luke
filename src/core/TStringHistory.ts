import { TStrings } from "./TString";

export type TStringHistory = {
  time: number;
  tStrings: TStrings;
}[];

export default function updateTStringHistory(
  history: TStringHistory,
  oldTStrings: TStrings,
  newTStrings: TStrings
) {
  const newHistItem = genHistDiff(oldTStrings, newTStrings);
  if (newHistItem.length == 0) return history;
  return history.concat([
    { time: Date.now().valueOf(), tStrings: newHistItem }
  ]);
}

function genHistDiff(oldTStrings: TStrings, newTStrings: TStrings) {
  return oldTStrings.filter(oldTString => {
    const newTString = newTStrings[oldTString.id];
    return (
      oldTString.targetText.length > 0 &&
      !(newTString && oldTString.targetText == newTString.targetText)
    );
  });
}
