import libxmljs2, { Document } from "libxmljs2";
import fs from "fs";
// import { TStrings } from "../../core/TString";
import { mkdirSafe, zip, unlinkRecursive } from "../../core/util/fsUtils";
import { unzip } from "../../core/util/fsUtils";

// export default function mergeXml(
//   inDocPath: string,
//   outDocPath: string,
//   translations: TStrings
// ) {
//   const extractDirPath = inDocPath.replace(/\.odt$/, "_odt");
//   mkdirSafe(extractDirPath);
//   unzip(inDocPath, extractDirPath);

//   const sortedTStrings = sortTStrings(translations);
//   addSpacesForStylesStrings(sortedTStrings);
//   const xmlTypes: (keyof SortedTStrings)[] = ["content", "meta", "styles"];
//   xmlTypes.forEach(xmlType => {
//     if (sortedTStrings[xmlType].length > 0) {
//       const xmlPath = `${extractDirPath}/${xmlType}.xml`;
//       mergeTranslations(xmlPath, sortedTStrings[xmlType]);
//     }
//   });

//   zip(extractDirPath, outDocPath);
//   unlinkRecursive(extractDirPath);
// }

// interface SortedTStrings {
//   content: TStrings;
//   meta: TStrings;
//   styles: TStrings;
// }
// function sortTStrings(tStrings: TStrings): SortedTStrings {
//   return tStrings.reduce(
//     (sorted: SortedTStrings, tStr) => {
//       const key: keyof SortedTStrings = tStr.metaString
//         ? "meta"
//         : tStr.stylesString
//         ? "styles"
//         : "content";
//       sorted[key].push(tStr);
//       return sorted;
//     },
//     { content: [], meta: [], styles: [] }
//   );
// }

// function mergeTranslations(contentXmlFilepath: string, translations: TStrings) {
//   const xmlDoc = getXmlDoc(contentXmlFilepath);
//   const namespaces = extractNamespaces(xmlDoc);
//   for (let i = 0; i < translations.length; ++i) {
//     const translation = translations[i];
//     const element = xmlDoc.get(translation.xpath, namespaces);
//     if (element) element.text(translation.targetText);
//   }
//   const docStr = cleanOpenDocXml(xmlDoc.toString(false));
//   fs.writeFileSync(contentXmlFilepath, docStr);
// }

// function getXmlDoc(xmlFilpath: string) {
//   const xml = fs.readFileSync(xmlFilpath).toString();
//   return libxmljs2.parseXml(xml);
// }

export type Namespaces = { [key: string]: string };

export function extractNamespaces(xmlDoc: Document) {
  return xmlDoc
    .root()!
    .namespaces()
    .reduce((accum, ns) => {
      accum[ns.prefix()] = ns.href();
      return accum;
    }, {} as Namespaces);
}

// function addSpacesForStylesStrings(sortedTStrings: SortedTStrings) {
//   sortedTStrings.styles = sortedTStrings.styles.map(str => ({
//     ...str,
//     targetText: str.targetText + " "
//   }));
// }

// function cleanOpenDocXml(str: string) {
//   return str
//     .replace(/&amp;quot;/g, "&quot;")
//     .replace(/&amp;lt;/g, "&lt;")
//     .replace(/&amp;gt;/g, "&gt;")
//     .replace(/&amp;amp;/g, "&amp;")
//     .replace(/'/g, "&apos;");
// }
