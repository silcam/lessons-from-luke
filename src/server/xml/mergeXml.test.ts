import docStorage from "../storage/docStorage";
import parse from "./parse";
import mergeXml from "./mergeXml";
import { unlinkSafe } from "../../core/util/fsUtils";

const odtPath = process.cwd() + "/cypress/fixtures/English_Luke-Q1-L06.odt";
const newOdtPath = odtPath.replace(".odt", "v02.odt");
let xmls: ReturnType<typeof docStorage.docXml>;

beforeAll(() => {
  xmls = docStorage.docXml(odtPath);
});

afterAll(() => {
  unlinkSafe(newOdtPath);
});

test("No-op XML merge", () => {
  const docStrings = parse(xmls.content, "content")
    .concat(parse(xmls.meta, "meta"))
    .concat(parse(xmls.styles, "styles"));
  mergeXml(odtPath, newOdtPath, docStrings);
  const newXmls = docStorage.docXml(newOdtPath);
  expect(compXml(newXmls.content)).toEqual(compXml(xmls.content));
  expect(compXml(newXmls.meta)).toEqual(compXml(xmls.meta));
  expect(compXml(newXmls.styles)).toBe(compXml(xmls.styles));
});

function compXml(xml: string) {
  return xml.replace(/\s+/g, "");
}
