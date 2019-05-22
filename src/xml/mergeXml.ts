import libxmljs2, { Document } from "libxmljs2";
import fs from "fs";
import { TDocString } from "../util/Storage";

export default function mergeXml(
  contentXmlFilepath: string,
  translations: TDocString[]
) {
  const xmlDoc = getXmlDoc(contentXmlFilepath);
  const namespaces = extractNamespaces(xmlDoc);
  for (let i = 0; i < translations.length; ++i) {
    const translation = translations[i];
    const element = xmlDoc.get(translation.xpath, namespaces);
    element.text(translation.targetText);
  }
  fs.writeFileSync(contentXmlFilepath, xmlDoc.toString());
}

function getXmlDoc(xmlFilpath: string) {
  const xml = fs.readFileSync(xmlFilpath).toString();
  return libxmljs2.parseXml(xml);
}

function extractNamespaces(xmlDoc: Document) {
  return xmlDoc
    .root()
    .namespaces()
    .reduce(
      (accum, ns) => {
        accum[ns.prefix()] = ns.href();
        return accum;
      },
      {} as { [key: string]: string }
    );
}
