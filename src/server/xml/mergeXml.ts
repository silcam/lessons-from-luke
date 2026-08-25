import libxmljs2, { Document, Element } from "libxmljs2";
import fs from "fs";
import { mkdirSafe, zip, unlinkRecursive } from "../../core/util/fsUtils";
import { unzip } from "../../core/util/fsUtils";
import { DocString } from "../../core/models/DocString";
import { removeParagraph } from "./removeParagraph";
import { removeCoverRepetitionParagraphs } from "./coverRepetitions";
import {
  collectFrontMatterExampleElements,
  removeFrontMatterExampleElements,
} from "./frontMatterExampleTable";

interface Opts {
  clearEmptyParagraphs?: boolean;
  removeCoverRepetitions?: boolean;
  removeFrontMatterExampleTable?: boolean;
}

export default function mergeXml(
  inDocPath: string,
  outDocPath: string,
  translations: DocString[],
  opts: Opts = {}
) {
  if (!fs.existsSync(inDocPath)) throw { status: 404 };

  const extractDirPath = inDocPath.replace(/\.odt$/, "_odt");
  try {
    mkdirSafe(extractDirPath);
    unzip(inDocPath, extractDirPath);

    const sortedDocStrings = sortDocStrings(translations);
    addSpacesForStylesStrings(sortedDocStrings);
    const xmlTypes: (keyof SortedDocStrings)[] = ["content", "meta", "styles"];
    xmlTypes.forEach((xmlType) => {
      if (sortedDocStrings[xmlType].length > 0) {
        const xmlPath = `${extractDirPath}/${xmlType}.xml`;
        // Repetition paragraphs live only in content.xml; meta.xml does not
        // even declare the text:/style: namespace prefixes the removal's
        // XPaths need, so the option must not leak to the other xml types.
        const removeCoverRepetitions = opts.removeCoverRepetitions && xmlType === "content";
        const removeFrontMatterExampleTable =
          opts.removeFrontMatterExampleTable && xmlType === "content";
        mergeTranslations(xmlPath, sortedDocStrings[xmlType], {
          ...opts,
          removeCoverRepetitions,
          removeFrontMatterExampleTable,
        });
      }
    });

    zip(extractDirPath, outDocPath);
  } finally {
    unlinkRecursive(extractDirPath);
  }
}

export interface SortedDocStrings {
  content: DocString[];
  meta: DocString[];
  styles: DocString[];
}
export function sortDocStrings(docStrings: DocString[]): SortedDocStrings {
  return docStrings.reduce(
    (sorted: SortedDocStrings, docStr) => {
      sorted[docStr.type].push(docStr);
      return sorted;
    },
    { content: [], meta: [], styles: [] }
  );
}

function mergeTranslations(contentXmlFilepath: string, translations: DocString[], opts: Opts) {
  const xmlDoc = getXmlDoc(contentXmlFilepath);
  const namespaces = extractNamespaces(xmlDoc);
  // Collect against the pristine tree (read-only); removal is deferred to
  // after the mutation passes below so positional xpaths stay valid.
  const frontMatterExampleElements = opts.removeFrontMatterExampleTable
    ? collectFrontMatterExampleElements(xmlDoc, namespaces)
    : [];
  for (let i = 0; i < translations.length; ++i) {
    const translation = translations[i];
    const element = xmlDoc.get<Element>(translation.xpath, namespaces);
    if (!element) continue;

    const toReplace = element.text().trim();
    element.text(element.text().replace(toReplace, translation.text));
  }
  if (opts.clearEmptyParagraphs) {
    translations
      .reverse() // Remove elements starting from the bottom to not mess up xpath addresses that depend on numbering paragraphs
      .filter((t) => t.text == "")
      .forEach((translation) => {
        const element = xmlDoc.get<Element>(translation.xpath, namespaces);
        if (element) {
          element.text("");
          removeParagraph(element);
        }
      });
  }
  // After clearEmptyParagraphs: position-based xpaths above must resolve
  // against the un-mutated tree (clearEmptyParagraphs re-resolves them at
  // removal time, so removing whole tables earlier would silently shift what
  // those lookups hit); these removals are style-driven and safe last.
  if (opts.removeCoverRepetitions) {
    removeCoverRepetitionParagraphs(xmlDoc, namespaces);
  }
  removeFrontMatterExampleElements(frontMatterExampleElements);
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

export function addSpacesForStylesStrings(sortedTStrings: SortedDocStrings) {
  sortedTStrings.styles = sortedTStrings.styles.map((str) => ({
    ...str,
    text: str.text + " ",
  }));
}

export function cleanOpenDocXml(str: string) {
  return str
    .replace(/&amp;quot;/g, "&quot;")
    .replace(/&amp;lt;/g, "&lt;")
    .replace(/&amp;gt;/g, "&gt;")
    .replace(/&amp;amp;/g, "&amp;")
    .replace(/'/g, "&apos;");
}
