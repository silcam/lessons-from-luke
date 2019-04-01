import libxmljs, { Document, Element } from "libxmljs";
import fs from "fs";

const textNS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const styleNS = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";

export interface DocString {
  xpath: string;
  text: string;
}

export default function parse(contentXmlFilepath: string) {
  const xml = fs.readFileSync(contentXmlFilepath).toString();
  const xmlDoc = libxmljs.parseXml(xml);

  const otherStylesToMatch = findStylesToMatch(xmlDoc).concat(
    findStylesToMatch(xmlDoc, "Lesson_20_Title")
  );

  const xPath =
    "//xmlns:p[contains(@xmlns:style-name, 'M.T._20_Text')] | " +
    otherStylesToMatch
      .map(styleName => xPathForPWithStyle(styleName))
      .join(" | ");

  const nodes = xmlDoc.root().find(xPath, textNS);

  const translatableStrings = parseNodes(nodes as Element[]);

  return translatableStrings;
}

function findStylesToMatch(xmlDoc: Document, parentStyle?: string) {
  const xPath = parentStyle
    ? xPathForParentStyle(parentStyle)
    : "//xmlns:style[contains(@xmlns:parent-style-name, 'M.T._20_Text')]";

  const nodes = xmlDoc.root().find(xPath, styleNS) as Element[];
  let styles = parentStyle ? [parentStyle] : [];
  for (let i = 0; i < nodes.length; ++i) {
    let style = nodes[i].attr("name").value();
    let childStyles = findStylesToMatch(xmlDoc, style);
    styles = styles.concat(childStyles);
  }
  return styles;
}

function xPathForPWithStyle(styleName: string) {
  return `//xmlns:p[@xmlns:style-name='${styleName}']`;
}

function xPathForParentStyle(parentStyleName: string) {
  return `//xmlns:style[@xmlns:parent-style-name='${parentStyleName}']`;
}

function parseNode(node: Element): DocString[] {
  if (node.type() == "text") {
    // Node must have at least one word character
    if (/\w/.test(node.text())) {
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
