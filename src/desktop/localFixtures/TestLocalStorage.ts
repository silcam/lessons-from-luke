import LocalStorage, {
  defaultMemoryStore,
  MEMORY_STORE
} from "../LocalStorage";
import { App } from "electron";
import fs from "fs";
import path from "path";

const TEST_DIR = "test";

export default class TestLocalStorage extends LocalStorage {
  constructor(app: App, fixtures?: string) {
    super(app);
    this.basePath = path.join(this.basePath, TEST_DIR);
    this.setupFixtures(fixtures);
  }

  protected setupFixtures(fixtures?: string) {
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
