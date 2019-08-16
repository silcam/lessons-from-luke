import Axios from "axios";
import * as Manifest from "./Manifest";
import * as Storage from "./Storage";
import { unlinkSafe, touch } from "./fsUtils";
import fs from "fs";

const SYNC_STATUS_FILENAME = ".syncStatus.json";

export interface SyncPackage {
  project: Manifest.Project;
  lessons: {
    lesson: string;
    strings: Storage.TDocString[];
  }[];
}

export interface SyncStatus {
  needToSync: boolean;
  writeLockInvalid: boolean;
  savedChanges: boolean;
}

const serverUrl =
  process.env.NODE_ENV == "development"
    ? "http://localhost:8080"
    : "http://lessonsfromluke.gospelcoding.org";

export async function fetch(code: string) {
  const response = await Axios.get(`${serverUrl}/desktop/fetch/${code}`);
  const data: SyncPackage = response.data;
  Manifest.writeDesktopProject(data.project);
  Storage.makeDesktopProjectDir(data);
}

export async function push(): Promise<void> {
  const project = Manifest.readDesktopProject();
  const lessons = project.lessons
    .filter(lesson => !!lesson.progress)
    .map(lesson => ({
      lesson: lesson.lesson,
      strings: Storage.getTStrings(project, lesson.lesson)
    }));
  const syncPackage: SyncPackage = { project, lessons };
  const newSyncStatus: SyncStatus = {
    needToSync: false,
    writeLockInvalid: false,
    savedChanges: true
  };
  try {
    await Axios.put(`${serverUrl}/desktop/push`, syncPackage);
  } catch (err) {
    newSyncStatus.needToSync = true;
    if (err.response && err.response.status == 403) {
      newSyncStatus.writeLockInvalid = true;
    }
  } finally {
    writeSyncStatus(newSyncStatus);
  }
}

export function getSyncStatus(): SyncStatus {
  if (fs.existsSync(SYNC_STATUS_FILENAME)) {
    return JSON.parse(fs.readFileSync(SYNC_STATUS_FILENAME).toString());
  }
  return {
    needToSync: false,
    writeLockInvalid: false,
    savedChanges: false
  };
}

function writeSyncStatus(syncStatus: SyncStatus) {
  fs.writeFileSync(SYNC_STATUS_FILENAME, JSON.stringify(syncStatus));
}
