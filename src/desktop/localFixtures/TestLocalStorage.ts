import LocalStorage from "../LocalStorage";
import fs from "fs";
import path from "path";

const TEST_DIR = "test";
type Fixtures = "batanga-synced" | "add others here...";

export default class TestLocalStorage extends LocalStorage {
  constructor() {
    super(TestLocalStorage.getBasePath());
  }

  static getBasePath() {
    return path.join(LocalStorage.getBasePath(), TEST_DIR);
  }

  static loadFixtures(fixtures?: Fixtures) {
    const basePath = TestLocalStorage.getBasePath();
    console.log(`LOAD FIXTURES TO ${basePath}`);
    // Clear Test JSON folder
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath);
    const filenames = fs.readdirSync(basePath);
    filenames.forEach(filename => fs.unlinkSync(path.join(basePath, filename)));

    // Copy if requred
    if (fixtures) {
      const srcPath = "src/desktop/localFixtures/" + fixtures;
      const filenames = fs.readdirSync(srcPath);
      filenames.forEach(filename =>
        fs.copyFileSync(`${srcPath}/${filename}`, `${basePath}/${filename}`)
      );
    }
  }
}
//
