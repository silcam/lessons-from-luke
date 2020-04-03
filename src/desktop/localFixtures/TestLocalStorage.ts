import LocalStorage, { defaultMemoryStore } from "../LocalStorage";
import { App } from "electron";
import fs from "fs";
import path from "path";

const TEST_DIR = "test";

export default class TestLocalStorage extends LocalStorage {
  constructor(app: App) {
    super(app);
    this.basePath = path.join(this.basePath, TEST_DIR);
    this.setupFixtures();
  }

  protected setupFixtures() {
    this.memoryStore = defaultMemoryStore();
    if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath);
    const filenames = fs.readdirSync(this.basePath);
    filenames.forEach(filename =>
      fs.unlinkSync(path.join(this.basePath, filename))
    );
  }
}
