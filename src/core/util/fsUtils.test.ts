import { unzip, unlinkRecursive } from "./fsUtils";

const zipPath = "test/docs/serverDocs/Luke-1-01v03.odt";
const dirPath = "test/docs/serverDocs/Luke-1-01v03.odt_FILES";

afterAll(() => {
  unlinkRecursive(dirPath);
});
test("Unzip overwrites", () => {
  unzip(zipPath, dirPath);
  expect(() => {
    // This will fail if the overwrite flag is not set
    unzip(zipPath, dirPath);
  }).not.toThrow();
});
