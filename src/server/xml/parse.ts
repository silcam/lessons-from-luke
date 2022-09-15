import libxmljs2, { Document, Element } from "libxmljs2";
import { extractNamespaces, Namespaces } from "./mergeXml";
import { DocString } from "../../core/models/DocString";
import { LessonStringType } from "../../core/models/LessonString";

interface BaseDocString {
  xpath: string;
  text: string;
}

export default function parse(
  xml: string,
  xmlType: LessonStringType
): DocString[] {
  switch (xmlType) {
    case "meta":
      return parseMeta(xml);
    case "styles":
      return parseStyles(xml);
    case "content":
    default:
      return parseContent(xml);
  }
}

function parseContent(contentXml: string) {
  const xmlDoc = libxmljs2.parseXml(contentXml);
  const namespaces = extractNamespaces(xmlDoc);

  removeTrackedChanges(xmlDoc, namespaces);

  const knownStyleNames = [
    "Lesson_20_Title",
    "Langue_20_Maternelle",
    "Coloring_20_Page_20_-_20_Memory_20_Verse",
    "Coloring_20_Page_20_-_20_Truth",
    "M.T._20_Table_20_of_20_Contents",
    "M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse",
    "M.T._20_Coloring_20_Page_20_-_20_Truth",
    "M.T._20_Lesson_20_Title",
    "M.T._20_Front_20_matter_20_Title",
    "M.T._20_Front_20_matter_20_subtitle",
    "M.T._20_Lesson_20_title_20_-_20_invisible",
    "M.T._20_Cover_20_title",
    "M.T._20_Cover_20_subtitle",
    "M.T._20_Example_20_text"
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
    allStyleNames.map(name => xPathForPWithStyle(name)).join(" | ") + " | " +
    allStyleNames.map(name => xPathForHWithStyle(name)).join(" | ");
    
  const nodes = xmlDoc.root()!.find(xPath, namespaces);

  const translatableStrings: DocString[] = parseNodes(
    nodes as Element[]
  ).map(str => ({ ...str, type: "content", motherTongue: true }));
  const allStrings: DocString[] = parseNode(xmlDoc.root()!).map(str => ({
    ...str,
    type: "content",
    motherTongue: false
  }));
  const mergedStrings = allStrings.map(
    docString =>
      translatableStrings.find(mtStr => mtStr.xpath == docString.xpath) ||
      docString
  );

  return mergedStrings;
}

function parseMeta(metaXml: string): DocString[] {
  const xmlDoc = libxmljs2.parseXml(metaXml);
  const namespaces = extractNamespaces(xmlDoc);

  const xPath = "//dc:subject | //dc:title";
  const nodes = xmlDoc.root()!.find(xPath, namespaces);
  return parseNodes(nodes as Element[]).map(str => ({
    ...str,
    type: "meta",
    motherTongue: false
  }));
}

function parseStyles(stylesXml: string): DocString[] {
  const xmlDoc = libxmljs2.parseXml(stylesXml);
  const docStrings = parseNode(xmlDoc.root()!);
  const justNumberPattern = /^\d+$/;
  return docStrings
    .filter(docStr => !justNumberPattern.test(docStr.text))
    .map(docStr => ({ ...docStr, type: "styles", motherTongue: false }));
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

function xPathForHWithStyle(styleName: string) {
  return `//text:h[@text:style-name='${styleName}']`;
}

function xPathForParentStyle(parentStyleName: string) {
  return `//style:style[@style:parent-style-name='${parentStyleName}']`;
}

function parseNode(node: Element): BaseDocString[] {
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
  let docStrings: BaseDocString[] = [];
  for (let i = 0; i < nodes.length; ++i) {
    docStrings = docStrings.concat(parseNode(nodes[i]));
  }
  return docStrings;
}

// function extractStrings(docStrings: SrcStrings) {
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
