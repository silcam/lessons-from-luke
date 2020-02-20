import libxmljs2, { Document } from "libxmljs2";
import fs from "fs";
import { mkdirSafe, zip, unlinkRecursive } from "../../core/util/fsUtils";
import { unzip } from "../../core/util/fsUtils";
import { DocString } from "../../core/models/DocString";

export default function mergeXml(
  inDocPath: string,
  outDocPath: string,
  translations: DocString[]
) {
  const extractDirPath = inDocPath.replace(/\.odt$/, "_odt");
  mkdirSafe(extractDirPath);
  unzip(inDocPath, extractDirPath);

  const sortedDocStrings = sortDocStrings(translations);
  addSpacesForStylesStrings(sortedDocStrings);
  const xmlTypes: (keyof SortedDocStrings)[] = ["content", "meta", "styles"];
  xmlTypes.forEach(xmlType => {
    if (sortedDocStrings[xmlType].length > 0) {
      const xmlPath = `${extractDirPath}/${xmlType}.xml`;
      mergeTranslations(xmlPath, sortedDocStrings[xmlType]);
    }
  });

  zip(extractDirPath, outDocPath);
  unlinkRecursive(extractDirPath);
}

interface SortedDocStrings {
  content: DocString[];
  meta: DocString[];
  styles: DocString[];
}
function sortDocStrings(docStrings: DocString[]): SortedDocStrings {
  return docStrings.reduce(
    (sorted: SortedDocStrings, docStr) => {
      sorted[docStr.type].push(docStr);
      return sorted;
    },
    { content: [], meta: [], styles: [] }
  );
}

function mergeTranslations(
  contentXmlFilepath: string,
  translations: DocString[]
) {
  const xmlDoc = getXmlDoc(contentXmlFilepath);
  const namespaces = extractNamespaces(xmlDoc);
  for (let i = 0; i < translations.length; ++i) {
    const translation = translations[i];
    const element = xmlDoc.get(translation.xpath, namespaces);
    if (element) element.text(translation.text);
  }
  const docStr = cleanOpenDocXml(xmlDoc.toString(false));
  fs.writeFileSync(contentXmlFilepath, docStr);
}

function getXmlDoc(xmlFilpath: string) {
  const xml = fs.readFileSync(xmlFilpath).toString();
  return libxmljs2.parseXml(xml);
}

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

function addSpacesForStylesStrings(sortedTStrings: SortedDocStrings) {
  sortedTStrings.styles = sortedTStrings.styles.map(str => ({
    ...str,
    text: str.text + " "
  }));
}

function cleanOpenDocXml(str: string) {
  return str
    .replace(/&amp;quot;/g, "&quot;")
    .replace(/&amp;lt;/g, "&lt;")
    .replace(/&amp;gt;/g, "&gt;")
    .replace(/&amp;amp;/g, "&amp;")
    .replace(/'/g, "&apos;");
}
