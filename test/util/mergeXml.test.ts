import { resetTestStorage } from "../testHelper";
import fs from "fs";
import { TDocString } from "../../src/util/Storage";
import mergeXml from "../../src/xml/mergeXml";

beforeAll(() => {
  resetTestStorage();
});

test("No-op XML merge", () => {
  const xmlFilepath = "test/strings/src/English/Luke-Q1-L01_1/odt/content.xml";
  const startXml = compXml(xmlFilepath);
  let tStrings: TDocString[] = JSON.parse(
    fs
      .readFileSync(
        "test/strings/translations/Pidgin_1555081479425/Luke-Q1-L01.json"
      )
      .toString()
  );
  tStrings = tStrings.map(s => ({ ...s, targetText: s.src }));
  mergeXml(xmlFilepath, tStrings);
  const finalXml = compXml(xmlFilepath);
  expect(finalXml).toEqual(startXml);
});

function compXml(xmlFilepath: string) {
  fs.readFileSync(xmlFilepath)
    .toString()
    .replace(/\s+/, "");
}
