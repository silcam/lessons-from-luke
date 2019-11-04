import libxmljs2, { Document, Element } from "libxmljs2";
import { extractNamespaces, Namespaces } from "./mergeXml";

export interface DocString {
  xpath: string;
  text: string;
  mtString?: boolean;
}

export default function parse(contentXml: string) {
  const xmlDoc = libxmljs2.parseXml(contentXml);
  const namespaces = extractNamespaces(xmlDoc);

  removeTrackedChanges(xmlDoc, namespaces);

  const knownStyleNames = [
    "Lesson_20_Title",
    "Langue_20_Maternelle",
    "Coloring_20_Page_20_-_20_Memory_20_Verse",
    "Coloring_20_Page_20_-_20_Truth"
  ];
  const knownStyleNamePatterns = ["M.T._20_Text", "L.M."];

  const allStyleNames = knownStyleNames
    .concat(
      knownStyleNames.reduce(
        (styles, styleName) =>
          styles.concat(findStylesToMatch(xmlDoc, namespaces, styleName)),
        [] as string[]
      )
    )
    .concat(
      knownStyleNamePatterns.reduce(
        (styles, pattern) =>
          styles.concat(findStylesToMatch(xmlDoc, namespaces, "", pattern)),
        [] as string[]
      )
    );

  const xPath =
    knownStyleNamePatterns
      .map(pattern => xPathForPWithStyleNameContains(pattern))
      .join(" | ") +
    " | " +
    allStyleNames.map(name => xPathForPWithStyle(name)).join(" | ");

  const nodes = xmlDoc.root()!.find(xPath, namespaces);

  const translatableStrings = parseNodes(nodes as Element[]);
  const allStrings = parseNode(xmlDoc.root()!);
  const mergedStrings = allStrings.map(docString => {
    if (translatableStrings.some(mtString => mtString.xpath == docString.xpath))
      return { ...docString, mtString: true };
    return docString;
  });

  return mergedStrings;
}

export function parseMeta(metaXml: string) {
  const xmlDoc = libxmljs2.parseXml(metaXml);
  const namespaces = extractNamespaces(xmlDoc);

  const xPath = "//dc:subject";
  const nodes = xmlDoc.root()!.find(xPath, namespaces);
  return parseNodes(nodes as Element[]);
}

export function parseStyles(stylesXml: string) {
  const xmlDoc = libxmljs2.parseXml(stylesXml);
  const docStrings = parseNode(xmlDoc.root()!);
  const justNumberPattern = /^\d+$/;
  return docStrings.filter(docStr => !justNumberPattern.test(docStr.text));
}

// parentStyleName is ignored if parentStylePattern is provided
function findStylesToMatch(
  xmlDoc: Document,
  namespaces: Namespaces,
  parentStyleName: string,
  parentStylePattern?: string
) {
  const xPath = parentStylePattern
    ? xPathForParentStyleNameContains(parentStylePattern)
    : xPathForParentStyle(parentStyleName);

  const nodes = xmlDoc.root()!.find(xPath, namespaces) as Element[];
  let styles: string[] = [];
  for (let i = 0; i < nodes.length; ++i) {
    let style = nodes[i].attr("name")!.value();
    styles.push(style);
    let childStyles = findStylesToMatch(xmlDoc, namespaces, style);
    styles = styles.concat(childStyles);
  }
  return styles;
}

function xPathForPWithStyleNameContains(stylePattern: string) {
  return `//text:p[contains(@text:style-name, '${stylePattern}')]`;
}

function xPathForParentStyleNameContains(stylePattern: string) {
  return `//style:style[contains(@style:parent-style-name, '${stylePattern}')]`;
}

function xPathForPWithStyle(styleName: string) {
  return `//text:p[@text:style-name='${styleName}']`;
}

function xPathForParentStyle(parentStyleName: string) {
  return `//style:style[@style:parent-style-name='${parentStyleName}']`;
}

function parseNode(node: Element): DocString[] {
  if (node.type() == "text") {
    // Node must have at least one non-space character
    if (/\S/.test(node.text())) {
      return [
        {
          xpath: node.path(),
          text: node.text().trim()
        }
      ];
    }
    return [];
  }

  return parseNodes(node.childNodes() as Element[]);
}

function parseNodes(nodes: Element[]) {
  let docStrings: DocString[] = [];
  for (let i = 0; i < nodes.length; ++i) {
    docStrings = docStrings.concat(parseNode(nodes[i]));
  }
  return docStrings;
}

// function extractStrings(docStrings: DocString[]) {
//   return docStrings.map(strObject => strObject.text);
// }

// function removeDuplicates(strings) {
//   return strings.reduce((accumStrings, string) => {
//     if (!accumStrings.includes(string)) return accumStrings.concat([string]);
//     return accumStrings;
//   }, []);
// }

function removeTrackedChanges(doc: Document, namespaces: Namespaces) {
  const trackedChangesNodes = doc
    .root()!
    .find("//text:tracked-changes", namespaces);
  trackedChangesNodes.forEach(node => node.remove());
}
