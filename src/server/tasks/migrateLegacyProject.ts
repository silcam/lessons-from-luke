// import PGStorage from "../storage/PGStorage";
// import {
//   LegacyTString,
//   legacyProjects,
//   legacyTStrings,
//   LegacyProject
// } from "../storage/legacyStorage";
// import { TString } from "../../core/models/TString";
// import { FRENCH_ID } from "../../core/models/Language";
// import fs from "fs";
// import { compareTwoStrings } from "string-similarity";
// import { discriminate } from "../../core/util/arrayUtils";

// const NONE = 0;
// const EXACT = 1;
// const SUPER = 2;
// const SUB = 3;

// runAll();

// async function runAll() {
//   const frenchStrings = await getFrenchTStrings();

//   eachProject((legacyStrings, project) => {
//     console.log(`====   ${project.targetLang.toUpperCase()}   ====`);
//     printSimilarEnoughStrings(legacyStrings, frenchStrings, 0.9);
//   });
// }

// function printSimilarEnoughStrings(
//   legacyStrings: LegacyTString[],
//   frenchStrings: TString[],
//   bar: number
// ) {
//   const [exact, rest] = discriminate(legacyStrings, legStr =>
//     frenchStrings.some(frStr => legStr.src == frStr.text)
//   );
//   const found = rest.filter(legStr =>
//     frenchStrings.some(frStr => compareTwoStrings(legStr.src, frStr.text) > bar)
//   );
//   console.log(`${legacyStrings.length} total strings`);
//   console.log(`${exact.length} exact matches`);
//   console.log(
//     `${found.length + exact.length} > 0.9 (${Math.round(
//       (100 * (found.length + exact.length)) / legacyStrings.length
//     )}% success)`
//   );
//   console.log("");
//   // legacyStrings.forEach(legStr => {
//   //   frenchStrings.forEach(frStr => {
//   //     const similarity = compareTwoStrings(legStr.src, frStr.text);
//   //     if (similarity >= bar) {
//   //       console.log(`=== ${Math.round(similarity * 100)}% ===`);
//   //       console.log(`-- ${legStr.src}`);
//   //       console.log(`-- ${frStr.text}`);
//   //       console.log("===");
//   //       console.log("");
//   //     }
//   //   });
//   // });
// }

// async function getFrenchTStrings(): Promise<TString[]> {
//   if (process.env.NODE_ENV == "test") {
//     return JSON.parse(fs.readFileSync("frenchStrings.json").toString());
//   }
//   return new PGStorage().tStrings({ languageId: FRENCH_ID });
// }

// async function eachProject(
//   cb: (projectStrings: LegacyTString[], project: LegacyProject) => void
// ) {
//   const projects = legacyProjects();
//   projects.forEach(project => {
//     const strings = stripScripture(legacyTStrings(project));
//     cb(strings, project);
//   });
// }

// // async function findAllMatches() {
// //   const frenchTStrings = await getFrenchTStrings();
// //   const frenchStrings = frenchTStrings.map(tStr =>
// //     letterMatchTransform(tStr.text)
// //   );
// //   // frenchStrings.forEach(str => console.log(`FR: ${str}`));

// //   const results = [0, 0, 0, 0];

// //   const projects = legacyProjects();
// //   projects.forEach(project => {
// //     const legStrings = stripScripture(legacyTStrings(project));
// //     // legStrings.forEach(str => console.log(`LEG: ${str.src}`));
// //     findMatches(frenchStrings, legStrings).forEach(val => results[val]++);
// //   });

// //   console.log(JSON.stringify(results));
// // }

// // function findMatches(frenchStrings: string[], legacyStrings: LegacyTString[]) {
// //   return legacyStrings.map(legacyString =>
// //     letterMatch(frenchStrings, legacyString)
// //   );
// // }

// // function exactMatch(tString: TString, legacyString: LegacyTString) {
// //   return tString.text == legacyString.targetText;
// // }

// // function letterMatch(
// //   frenchStrings: string[],
// //   legacyString: LegacyTString
// // ): number {
// //   let state = NONE;
// //   const legStr = letterMatchTransform(legacyString.src);
// //   for (let i = 0; i < frenchStrings.length; ++i) {
// //     const frenchString = frenchStrings[i];
// //     if (frenchString == legStr) {
// //       // console.log(`Exact: ${legStr}`);
// //       return EXACT;
// //     }
// //     if (
// //       legStr.includes(frenchString) &&
// //       frenchString.length / legStr.length > 0.3 &&
// //       frenchString.length > 2
// //     ) {
// //       state = SUPER;
// //       // console.log(`${legStr} contains ${frenchString}`);
// //     }
// //     if (
// //       frenchString.includes(legStr) &&
// //       legStr.length / frenchString.length > 0.3 &&
// //       legStr.length > 2
// //     )
// //       state = SUB;
// //   }
// //   if (state == NONE) console.log(legacyString.src);
// //   return state;
// // }

// // function letterMatchTransform(str: string) {
// //   return str.replace(/\W/g, "").toLocaleLowerCase();
// // }

// function stripScripture(legacyStrings: LegacyTString[]) {
//   return legacyStrings.filter(
//     legacyString => !/^Luc \d+/.test(legacyString.src)
//   );
// }
