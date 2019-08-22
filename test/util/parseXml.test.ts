import { resetTestStorage } from "../testHelper";
import parse from "../../src/xml/parse";

beforeAll(() => {
  resetTestStorage();
});

test("Remove tracked changes", () => {
  // We should ignore the <text:tracked-changes> block. That block has many strings with the text "Unkown Author"
  const srcXmlPath = "test/strings/src/English/Luke-Q1-L01_1/odt/content.xml";
  const srcStrings = parse(srcXmlPath);
  const unkownAuthorStrings = srcStrings.filter(str =>
    str.text.includes("Unknown Author")
  );
  expect(unkownAuthorStrings.length).toBe(0);
});
