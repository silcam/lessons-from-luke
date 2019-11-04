import libxmljs2, { Document } from "libxmljs2";
import fs from "fs";
import { TDocString } from "../util/Storage";
import { mkdirSafe, zip, unlinkRecursive } from "../util/fsUtils";
import { unzip } from "../util/fsUtils";

export default function mergeXml(
  inDocPath: string,
  outDocPath: string,
  translations: TDocString[]
) {
  const extractDirPath = inDocPath.replace(/\.odt$/, "_odt");
  mkdirSafe(extractDirPath);
  unzip(inDocPath, extractDirPath);

  const contentXmlPath = `${extractDirPath}/content.xml`;
  mergeTranslations(contentXmlPath, translations);

  zip(extractDirPath, outDocPath);
  unlinkRecursive(extractDirPath);
}

function mergeTranslations(
  contentXmlFilepath: string,
  translations: TDocString[]
) {
  const xmlDoc = getXmlDoc(contentXmlFilepath);
  const namespaces = extractNamespaces(xmlDoc);
  for (let i = 0; i < translations.length; ++i) {
    const translation = translations[i];
    const element = xmlDoc.get(translation.xpath, namespaces);
    if (element) element.text(translation.targetText);
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
    .reduce(
      (accum, ns) => {
        accum[ns.prefix()] = ns.href();
        return accum;
      },
      {} as Namespaces
    );
}

function cleanOpenDocXml(str: string) {
  return str
    .replace(/&amp;quot;/g, "&quot;")
    .replace(/&amp;lt;/g, "&lt;")
    .replace(/&amp;gt;/g, "&gt;")
    .replace(/&amp;amp;/g, "&amp;")
    .replace(/'/g, "&apos;");
}
