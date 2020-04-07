import { BaseLesson } from "../core/models/Lesson";
import { LessonString } from "../core/models/LessonString";
import {
  StoredSyncState,
  initalStoredSyncState
} from "../core/models/SyncState";
import { PublicLanguage } from "../core/models/Language";
import { TString, equal } from "../core/models/TString";
import { App } from "electron";
import fs from "fs";
import path from "path";
import { modelListMerge } from "../core/util/arrayUtils";
import {
  OnSyncStateChangePayload,
  ON_SYNC_STATE_CHANGE
} from "../core/api/IpcChannels";
import { DesktopApp } from "./DesktopApp";

const LOCAL_STORAGE_VERSION = 1;

export interface MemoryStore {
  syncState: StoredSyncState;
  languages: PublicLanguage[];
  lessons: BaseLesson[];
  localStorageVersion: number;
}

export function defaultMemoryStore(): MemoryStore {
  return {
    syncState: initalStoredSyncState(),
    languages: [],
    lessons: [],
    localStorageVersion: LOCAL_STORAGE_VERSION
  };
}

export const MEMORY_STORE = "memoryStore.json";

function lessonStringsFilename(id: number) {
  return `lessonStrings_${id}.json`;
}

function tStringsFilename(languageId: number) {
  return `tStrings_${languageId}.json`;
}

function docPreviewFilename(lessonId: number) {
  return `docPreview_${lessonId}.html`;
}

export default class LocalStorage {
  protected memoryStore: MemoryStore;
  protected basePath: string;

  constructor(app: App) {
    this.basePath = app.getPath("userData");
    console.log(`Local storage in ${this.basePath}`);
    if (!fs.existsSync(this.basePath))
      fs.mkdirSync(this.basePath, { recursive: true });

    this.memoryStore = this.readFile(MEMORY_STORE, defaultMemoryStore());
    if (this.memoryStore.localStorageVersion < LOCAL_STORAGE_VERSION)
      this.migrateLocalStorage();
  }

  getSyncState() {
    return this.memoryStore.syncState;
  }

  getLanguages() {
    return this.memoryStore.languages;
  }

  getLessons() {
    return this.memoryStore.lessons;
  }

  getLessonStrings(lessonId: number): LessonString[] {
    return this.readFile(lessonStringsFilename(lessonId), []);
  }

  getAllTStrings(languageId: number): TString[] {
    return this.readFile(tStringsFilename(languageId), []);
  }

  getTStrings(languageId: number, lessonId: number) {
    const lessonStrings = this.getLessonStrings(lessonId);
    const masterIds = lessonStrings.map(ls => ls.masterId);
    const tStrings = this.getAllTStrings(languageId);
    return tStrings.filter(ts => masterIds.includes(ts.masterId));
  }

  getDocPreview(lessonId: number) {
    return this.readTextFile(docPreviewFilename(lessonId));
  }

  setSyncState(syncState: Partial<StoredSyncState>, app: DesktopApp) {
    this.memoryStore.syncState = {
      ...this.memoryStore.syncState,
      ...syncState
    };
    this.writeMemoryStore();

    const payload: OnSyncStateChangePayload = syncState;
    app.getWindow().webContents.send(ON_SYNC_STATE_CHANGE, payload);
    return this.memoryStore.syncState;
  }

  setLanguages(languages: PublicLanguage[]) {
    this.memoryStore.languages = languages;
    this.writeMemoryStore();
    return languages;
  }

  setLessons(lessons: BaseLesson[]) {
    this.memoryStore.lessons = lessons;
    this.writeMemoryStore();
    return lessons;
  }

  setLessonStrings(lessonId: number, lessonStrings: LessonString[]) {
    this.writeFile(lessonStringsFilename(lessonId), lessonStrings);
    return lessonStrings;
  }

  setTStrings(languageId: number, tStrings: TString[]) {
    const existingTStrings = this.getAllTStrings(languageId);
    const finalTStrings = modelListMerge(existingTStrings, tStrings, equal);
    this.writeFile(tStringsFilename(languageId), finalTStrings);
    return finalTStrings;
  }

  setProjectLanguageTStrings(tStrings: TString[]) {
    const languageId = this.memoryStore.syncState.language?.languageId;
    if (!languageId)
      throw "setProjectLanguageTStrings called without set Project Language!";

    return this.setTStrings(languageId, tStrings);
  }

  setDocPreview(lessonId: number, preview: string) {
    this.writeTextFile(docPreviewFilename(lessonId), preview);
  }

  protected migrateLocalStorage() {
    console.log(
      `Migrate local storage from version ${this.memoryStore.localStorageVersion} to version ${LOCAL_STORAGE_VERSION}`
    );

    this.memoryStore.localStorageVersion = LOCAL_STORAGE_VERSION;
    this.writeMemoryStore();
  }

  protected readTextFile(filename: string) {
    const filepath = path.join(this.basePath, filename);
    return fs.existsSync(filepath) ? fs.readFileSync(filepath).toString() : "";
  }

  protected readFile<T>(filename: string, defaultValue: T): T {
    const text = this.readTextFile(filename);
    return text ? JSON.parse(text) : defaultValue;
  }

  protected writeTextFile(filename: string, value: string) {
    // Using an intermediate tmp file to prevent corruption from incomplete writes
    const filepath = path.join(this.basePath, filename);
    const tmpFilepath = filepath + "_tmp";
    fs.writeFileSync(tmpFilepath, value);
    fs.renameSync(tmpFilepath, filepath);
  }

  protected writeFile(filename: string, value: any) {
    this.writeTextFile(filename, JSON.stringify(value));
  }

  protected writeMemoryStore() {
    this.writeFile(MEMORY_STORE, this.memoryStore);
  }
}
