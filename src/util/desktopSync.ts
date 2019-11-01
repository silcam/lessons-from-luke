import Axios from "axios";
import * as Manifest from "./Manifest";
import * as Storage from "./Storage";
import { unlinkSafe } from "./fsUtils";
import fs from "fs";
import { set, unset } from "./arraySet";

const UP_SYNC_STATUS_FILENAME = "upSyncStatus.json";
const DOWN_SYNC_STATUS_FILENAME = "downSyncStatus.json";

export interface UpSyncPackage {
  project: Manifest.Project;
  lesson: {
    lesson: string;
    strings: Storage.TDocString[];
  };
}

export interface UnlockPackage {
  datetime: number;
  lockCode: string;
}

export interface DownSyncStatus {
  neededLessons: string[];
  gotLessons: string[];
  project: Manifest.Project;
}

export interface UpSyncStatus {
  needToSync: string[]; // Lesson names
  writeLockInvalid: boolean;
  savedChanges: boolean;
}

const serverUrl =
  process.env.NODE_ENV == "development"
    ? "http://localhost:8080"
    : "https://lessonsfromluke.gospelcoding.org";

export async function fetch(code: string) {
  const response = await Axios.get(`${serverUrl}/desktop/fetch/${code}`);
  const project: Manifest.Project = response.data;
  Manifest.writeDesktopProject(project);
  Storage.makeDesktopProjectDir(project);
  writeDownSyncStatus({
    project,
    gotLessons: [],
    neededLessons: project.lessons.map(lesson => lesson.lesson)
  });
}

// Return var is TRUE for done
export async function fetchNextLesson(): Promise<boolean> {
  const syncStatus = getDownSyncStatus();
  if (syncStatus === null) return true;
  const project = syncStatus.project;
  const lesson = syncStatus.neededLessons.shift();
  if (!lesson) return downSyncDone();
  try {
    const response = await Axios.get(
      `${serverUrl}/desktop/fetch/${project.datetime}/lesson/${lesson}?lockCode=${project.lockCode}`
    );
    const tStrings: Storage.TDocString[] = response.data;
    Storage.saveTStrings(project, lesson, tStrings);
    if (syncStatus.neededLessons.length == 0) return downSyncDone();
    syncStatus.gotLessons.push(lesson);
    writeDownSyncStatus(syncStatus);
  } catch (err) {
    if (err.response && err.response.status == 403) {
      writeUpSyncStatus({
        savedChanges: false,
        needToSync: [],
        writeLockInvalid: true
      });
    }
    throw err;
  }
  return false;
}

export async function push(lesson: string): Promise<void> {
  const syncStatus = getUpSyncStatus();
  syncStatus.savedChanges = true;
  const project = Manifest.readDesktopProject();
  const tStrings = Storage.getTStrings(project, lesson);
  const syncPackage: UpSyncPackage = {
    project,
    lesson: {
      lesson,
      strings: tStrings
    }
  };
  try {
    await Axios.put(`${serverUrl}/desktop/push`, syncPackage);
    unset(syncStatus.needToSync, lesson); // if it was there
    writeUpSyncStatus(syncStatus);
    if (syncStatus.needToSync.length > 0) push(syncStatus.needToSync[0]); // But don't wait for it
  } catch (err) {
    if (err.response && err.response.status == 403) {
      syncStatus.writeLockInvalid = true;
    }
    set(syncStatus.needToSync, lesson);
    writeUpSyncStatus(syncStatus);
  }
}

// Returns true for success
export async function unlock(): Promise<void> {
  const project = Manifest.readDesktopProject();
  const body: UnlockPackage = {
    datetime: project.datetime,
    lockCode: project.lockCode || "" // Should always exist
  };
  try {
    await Axios.post(`${serverUrl}/desktop/unlock`, body);
    clearProject();
  } catch (err) {
    if (err.response && err.response.status == 403) {
      // Means our lock was invalid anyway
      clearProject();
    } else if (err.request && !err.response) {
      throw "NoConnection";
    } else {
      throw "UnknownError";
    }
  }
}

function clearProject() {
  Manifest.removeDesktopProject();
  removeUpSyncStatus();
}

function downSyncDone() {
  unlinkSafe(DOWN_SYNC_STATUS_FILENAME);
  return true;
}

export function getDownSyncStatus(): DownSyncStatus | null {
  if (fs.existsSync(DOWN_SYNC_STATUS_FILENAME)) {
    return JSON.parse(fs.readFileSync(DOWN_SYNC_STATUS_FILENAME).toString());
  } else {
    return null;
  }
}

export function getUpSyncStatus(): UpSyncStatus {
  if (fs.existsSync(UP_SYNC_STATUS_FILENAME)) {
    return JSON.parse(fs.readFileSync(UP_SYNC_STATUS_FILENAME).toString());
  }
  return {
    needToSync: [],
    writeLockInvalid: false,
    savedChanges: false
  };
}

function writeDownSyncStatus(syncStatus: DownSyncStatus) {
  fs.writeFileSync(DOWN_SYNC_STATUS_FILENAME, JSON.stringify(syncStatus));
}

function writeUpSyncStatus(syncStatus: UpSyncStatus) {
  fs.writeFileSync(UP_SYNC_STATUS_FILENAME, JSON.stringify(syncStatus));
}

function removeUpSyncStatus() {
  unlinkSafe(UP_SYNC_STATUS_FILENAME);
}
