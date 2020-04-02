import Store from "electron-store";
import { BaseLesson } from "../core/models/Lesson";
import produce from "immer";
import { LessonString } from "../core/models/LessonString";
import {
  StoredSyncState,
  initalStoredSyncState
} from "../core/models/SyncState";

export interface LocalStore {
  syncState: StoredSyncState;
  lessons: BaseLesson[];
  lessonStrings: {
    [lessonId: number]: LessonString[];
  };
}

export function defaultLocalStore(): LocalStore {
  return {
    syncState: initalStoredSyncState(),
    lessons: [],
    lessonStrings: {}
  };
}

export interface LocalStorageInterface {
  getStore: () => LocalStore;
  updateStore: (update: (draftStore: LocalStore) => void) => LocalStore;
}

export default class LocalStorage implements LocalStorageInterface {
  private store: Store<LocalStore>;

  constructor() {
    this.store = new Store({ defaults: defaultLocalStore() });
    // Reset the storage:
    // this.store.store = defaultLocalStore();
  }

  getStore(): LocalStore {
    return this.store.store;
  }

  updateStore(update: (draftStore: LocalStore) => void) {
    this.store.store = produce(this.store.store, update);
    return this.getStore();
  }
}
