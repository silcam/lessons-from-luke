import libxmljs2, { Document, Element } from "libxmljs2";
import fs from "fs";
import { mkdirSafe, zip, unlinkRecursive } from "../../core/util/fsUtils";
import { unzip } from "../../core/util/fsUtils";
import { DocString } from "../../core/models/DocString";

interface Opts {
  clearEmptyParagraphs?: boolean;
}

export default function mergeXml(
  inDocPath: string,
  outDocPath: string,
  translations: DocString[],
  opts: Opts = {}
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
      mergeTranslations(xmlPath, sortedDocStrings[xmlType], opts);
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
  translations: DocString[],
  opts: Opts
) {
  const xmlDoc = getXmlDoc(contentXmlFilepath);
  const namespaces = extractNamespaces(xmlDoc);
  for (let i = 0; i < translations.length; ++i) {
    const translation = translations[i];
    const element = xmlDoc.get(translation.xpath, namespaces);
    if (!element) continue;

    const toReplace = element.text().trim();
    element.text(element.text().replace(toReplace, translation.text));
  }
  if (opts.clearEmptyParagraphs) {
    translations
      .reverse() // Remove elements starting from the bottom to not mess up xpath addresses that depend on numbering paragraphs
      .filter(t => t.text == "")
      .forEach(translation => {
        const element = xmlDoc.get(translation.xpath, namespaces);
        if (element) {
          element.text("");
          removeParagraph(element);
        }
      });
  }
  const docStr = cleanOpenDocXml(xmlDoc.toString(false));
  fs.writeFileSync(contentXmlFilepath, docStr);
}

function removeParagraph(element: Element) {
  const parent = element.parent();
  if (isAnElement(parent) && !parent.text()) removeParagraph(parent);
  else element.remove();
}

function isAnElement(element: Element | Document): element is Element {
  return "text" in element;
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
