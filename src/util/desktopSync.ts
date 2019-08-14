import Axios from "axios";
import * as Manifest from "./Manifest";
import * as Storage from "./Storage";
import { unlinkSafe, touch } from "./fsUtils";
import fs from "fs";

const NEED_TO_SYNC_FILENAME = ".need-to-sync";
const WRITE_LOCK_INVALID_FILENAME = ".write-lock-invalid";

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

export async function push(): Promise<SyncStatus> {
  const project = Manifest.readDesktopProject();
  const lessons = project.lessons
    .filter(lesson => !!lesson.progress)
    .map(lesson => ({
      lesson: lesson.lesson,
      strings: Storage.getTStrings(project, lesson.lesson)
    }));
  const syncPackage: SyncPackage = { project, lessons };
  try {
    await Axios.put(`${serverUrl}/desktop/push`, syncPackage);
    unlinkSafe(NEED_TO_SYNC_FILENAME);
    return { needToSync: false, writeLockInvalid: false };
  } catch (err) {
    touch(NEED_TO_SYNC_FILENAME);
    if (err.response && err.response.status == 403) {
      touch(WRITE_LOCK_INVALID_FILENAME);
      return { needToSync: true, writeLockInvalid: true };
    } else {
      return { needToSync: true, writeLockInvalid: false };
    }
  }
}

export function getSyncStatus(): SyncStatus {
  return {
    needToSync: fs.existsSync(NEED_TO_SYNC_FILENAME),
    writeLockInvalid: fs.existsSync(WRITE_LOCK_INVALID_FILENAME)
  };
}
