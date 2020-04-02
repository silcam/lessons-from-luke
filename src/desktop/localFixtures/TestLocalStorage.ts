import {
  LocalStorageInterface,
  LocalStore,
  defaultLocalStore
} from "../LocalStorage";
import produce from "immer";

type FixturesOptions = "none" | "fresh-install";

export class TestLocalStorage implements LocalStorageInterface {
  private testStore: LocalStore;

  constructor(fixtures: FixturesOptions) {
    this.testStore = getFixtures(fixtures);
  }

  getStore(): LocalStore {
    return this.testStore;
  }

  updateStore(update: (draftStore: LocalStore) => void) {
    this.testStore = produce(this.testStore, update);
    return this.getStore();
  }
}

export function getFixtures(fixtures: FixturesOptions): LocalStore {
  switch (fixtures) {
    case "fresh-install":
    default:
      return defaultLocalStore();
  }
}
