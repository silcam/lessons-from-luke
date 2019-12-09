// import bestMatchMap from "./util/bestMatchMap";
// import { compareTwoStrings } from "string-similarity";
// import { SrcStrings } from "./SrcString";
// import { TStrings } from "./TString";

// type DiffChangeType = "none" | "add" | "remove" | "change";

// type ProjectUpdateDiff = {
//   change: DiffChangeType;
//   oldSrc: string;
//   newSrc: string;
//   oldTranslation: string;
//   newTranslation: string;
//   strId: number;
//   mtString?: boolean;
// }[];

// export function prjUpdateDiff(
//   oldSrcStrings: SrcStrings,
//   newSrcStrings: SrcStrings,
//   oldTStrings: TStrings
// ): ProjectUpdateDiff {
//   const matchMap = bestMatchMap(oldSrcStrings, newSrcStrings, (a, b) =>
//     compareTwoStrings(a.text, b.text)
//   );
//   let oldIndex = 0;
//   let newIndex = 0;
//   let mapIndex = 0;
//   const diff: ProjectUpdateDiff = [];
//   while (oldIndex < oldSrcStrings.length || newIndex < newSrcStrings.length) {
//     const match = matchMap[mapIndex];
//     let change: DiffChangeType = "none";
//     if (match && match[0] == oldIndex && match[1] == newIndex) {
//       change = "none";
//       if (oldSrcStrings[oldIndex].text != newSrcStrings[newIndex].text)
//         change = "change";
//     } else if (
//       (!match && oldSrcStrings[oldIndex]) ||
//       (match && oldIndex < match[0])
//     )
//       change = "remove";
//     else change = "add";

//     diff.push({
//       change,
//       strId: change == "remove" ? -1 : newIndex,
//       oldSrc: change == "add" ? "" : oldTStrings[oldIndex].src,
//       newSrc: change == "remove" ? "" : newSrcStrings[newIndex].text,
//       oldTranslation: change == "add" ? "" : oldTStrings[oldIndex].targetText,
//       newTranslation: change == "none" ? oldTStrings[oldIndex].targetText : "",
//       mtString:
//         change == "remove"
//           ? oldTStrings[oldIndex].mtString
//           : newSrcStrings[newIndex].mtString
//     });
//     [oldIndex, newIndex, mapIndex] = updateIndices(
//       change,
//       oldIndex,
//       newIndex,
//       mapIndex
//     );
//   }
//   return diff;
// }

// function updateIndices(
//   change: DiffChangeType,
//   oldIndex: number,
//   newIndex: number,
//   mapIndex: number
// ) {
//   switch (change) {
//     case "none":
//     case "change":
//       return [oldIndex + 1, newIndex + 1, mapIndex + 1];
//     case "remove":
//       return [oldIndex + 1, newIndex, mapIndex];
//     case "add":
//       return [oldIndex, newIndex + 1, mapIndex];
//   }
// }
