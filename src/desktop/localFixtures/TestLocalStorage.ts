import LocalStorage, {
  defaultMemoryStore,
  MEMORY_STORE
} from "../LocalStorage";
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

  loadFixtures(fixtures?: Fixtures) {
    console.log(`LOAD FIXTURES TO ${this.basePath}`);
    // Clear Test JSON folder
    if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath);
    const filenames = fs.readdirSync(this.basePath);
    filenames.forEach(filename =>
      fs.unlinkSync(path.join(this.basePath, filename))
    );

    // Copy if requred
    if (fixtures) {
      const srcPath = "src/desktop/localFixtures/" + fixtures;
      const filenames = fs.readdirSync(srcPath);
      filenames.forEach(filename =>
        fs.copyFileSync(
          `${srcPath}/${filename}`,
          `${this.basePath}/${filename}`
        )
      );
    }

    // Memory Store
    this.memoryStore = this.readFile(MEMORY_STORE, defaultMemoryStore());
  }
}
//
