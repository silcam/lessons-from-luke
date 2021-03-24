import { BaseLesson } from "../core/models/Lesson";
import { LessonString } from "../core/models/LessonString";
import {
  StoredSyncState,
  initalStoredSyncState
} from "../core/models/SyncState";
import {
  PublicLanguage,
  LessonProgress,
  calcLessonProgress
} from "../core/models/Language";
import { TString, equal } from "../core/models/TString";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { modelListMerge } from "../core/util/arrayUtils";
import {
  OnSyncStateChangePayload,
  ON_SYNC_STATE_CHANGE
} from "../core/api/IpcChannels";
import DesktopApp from "./DesktopApp";
import { zeroPad } from "../core/util/numberUtils";
import { lastMonthStr, todayStr } from "../core/util/dateUtils";
import { unlinkSafe } from "../core/util/fsUtils";

const LOCAL_STORAGE_VERSION = 2;

export type LogType = "Network" | "DataUsage" | "Error";
export type DataUsage = { [date: string]: number };
const DataUsageLog = "LOG-DataUsage";

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
  protected basePath: string = LocalStorage.getBasePath();

  constructor(basePath?: string) {
    if (basePath) this.basePath = basePath;
    console.log(`Local storage in ${this.basePath}`);
    if (!fs.existsSync(this.basePath))
      fs.mkdirSync(this.basePath, { recursive: true });

    this.memoryStore = this.readFile(MEMORY_STORE, defaultMemoryStore());
    if (this.memoryStore.localStorageVersion < LOCAL_STORAGE_VERSION)
      this.migrateLocalStorage();

    this.recalcProgress(null);
    this.manageLogs();
  }

  static getBasePath() {
    return app.getPath("userData");
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

  getLessonCount(): number {
    return this.memoryStore.lessons.length;
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

  getTStringCount(): number {
    return this.memoryStore.languages
      .map(lang => this.getAllTStrings(lang.languageId))
      .reduce((sum, list) => sum + list.length, 0);
  }

  getDocPreview(lessonId: number) {
    return this.readTextFile(docPreviewFilename(lessonId));
  }

  setSyncState(syncState: Partial<StoredSyncState>, app: DesktopApp | null) {
    this.memoryStore.syncState = {
      ...this.memoryStore.syncState,
      ...syncState
    };
    this.writeMemoryStore();

    if (app) {
      const payload: OnSyncStateChangePayload = syncState;
      app.getWindow().webContents.send(ON_SYNC_STATE_CHANGE, payload);
    }
    return this.memoryStore.syncState;
  }

  recalcProgress(app: DesktopApp | null) {
    // console.log(`RECALC PROGRESS`);
    const language = this.getSyncState().language;
    if (!language) return;

    const lessons = this.getLessons();
    const tStrings = this.getAllTStrings(language.languageId);

    const progress: LessonProgress[] = lessons.map(lesson =>
      calcLessonProgress(
        language.motherTongue,
        this.getLessonStrings(lesson.lessonId),
        tStrings
      )
    );
    this.setSyncState(
      { language: { ...this.getSyncState().language!, progress } },
      app
    );
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

    const existing = this.getAllTStrings(languageId);
    const newTStrings = tStrings.map(tStr => {
      const oldTStr = existing.find(
        oldTStr => oldTStr.masterId == tStr.masterId
      );
      return oldTStr
        ? { ...tStr, history: oldTStr.history.concat([oldTStr.text]) }
        : tStr;
    });
    return this.setTStrings(languageId, newTStrings);
  }

  setDocPreview(lessonId: number, preview: string) {
    this.writeTextFile(
      docPreviewFilename(lessonId),
      desktopifyDocPreview(preview)
    );
  }

  removeDocPreview(lessonId: number) {
    const filename = docPreviewFilename(lessonId);
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }

  logDataUsed(bytes: number) {
    const filename = this.logFileName("DataUsage", new Date(), { daily: true });
    this.appendTextFile(filename, `${bytes}`);
  }

  readDataUsed() {
    return this.readFile(DataUsageLog, {});
  }

  writeLogEntry(log: LogType, message: string) {
    const entryDate = new Date();
    const filename = this.logFileName(log, entryDate);
    this.appendTextFile(filename, `${entryDate.toJSON()}  ${message}`);
  }

  protected migrateLocalStorage() {
    console.log(
      `Migrate local storage from version ${this.memoryStore.localStorageVersion} to version ${LOCAL_STORAGE_VERSION}`
    );

    if (this.memoryStore.localStorageVersion < 2) {
      this.memoryStore.syncState.downSync = {
        languages: false,
        baseLessons: false,
        lessons: [],
        tStrings: {},
        timestamp: 1
      };

      const language = this.memoryStore.syncState.language;
      this.memoryStore.syncState.syncLanguages = language
        ? [
            { languageId: language.languageId, timestamp: 1 },
            { languageId: language.defaultSrcLang, timestamp: 1 }
          ]
        : [];
    }

    this.memoryStore.localStorageVersion = LOCAL_STORAGE_VERSION;
    this.writeMemoryStore();
  }

  protected logFileName(
    logType: LogType,
    date: Date = new Date(),
    opts: { daily?: boolean } = {}
  ) {
    let name = `LOG-${logType}-${date.getUTCFullYear()}-${zeroPad(
      date.getUTCMonth() + 1,
      2
    )}`;
    if (opts.daily) name += "-" + zeroPad(date.getUTCDate(), 2);
    return name;
  }

  protected manageLogs() {
    const logFileNames = fs
      .readdirSync(this.basePath)
      .filter(name => name.startsWith("LOG"));

    // Clean out old network logs
    const prefix = "LOG-Network";
    const lastMonth = lastMonthStr();
    logFileNames.forEach(filename => {
      if (filename.startsWith(prefix) && filename < `${prefix}-${lastMonth}`)
        unlinkSafe(path.join(this.basePath, filename));
    });

    // Consolidate data usage logs
    const dataUsage: DataUsage = this.readFile(DataUsageLog, {});
    const today = todayStr();
    const toDelete: string[] = [];
    logFileNames.forEach(filename => {
      if (
        filename.startsWith("LOG-DataUsage-") &&
        filename < `LOG-DataUsage-${today}`
      ) {
        const data = this.readTextFile(filename);
        const sum = data.split("\n").reduce((sum, val) => {
          return sum + (parseInt(val) || 0);
        }, 0);
        const dateStr = filename.substr(14, 10);
        dataUsage[dateStr] = sum;
        toDelete.push(filename);
      }
    });
    this.writeFile(DataUsageLog, dataUsage);
    toDelete.forEach(filename =>
      unlinkSafe(path.join(this.basePath, filename))
    );
  }

  protected readTextFile(filename: string) {
    const filepath = path.join(this.basePath, filename);
    return fs.existsSync(filepath) ? fs.readFileSync(filepath).toString() : "";
  }

  protected readFile<T>(filename: string, defaultValue: T): T {
    try {
      const text = this.readTextFile(filename);
      return text ? JSON.parse(text) : defaultValue;
    } catch (err) {
      console.log("JSON Parse Error");
      this.writeLogEntry(
        "Error",
        `[LocalStorage.readFile : ${filename}] ${err}`
      );
      throw err;
    }
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

  protected appendTextFile(filename: string, text: string) {
    const filepath = path.join(this.basePath, filename);
    fs.appendFileSync(filepath, `${text}\n`);
  }

  protected writeMemoryStore() {
    this.writeFile(MEMORY_STORE, this.memoryStore);
  }
}

// Update img ref's to point to server
function desktopifyDocPreview(html: string): string {
  return html.replace(
    /<img src="/g,
    '<img src="https://beta.lessonsfromluke.gospelcoding.org'
  );
}
