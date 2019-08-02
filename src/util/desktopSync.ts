import Axios from "axios";
import * as Manifest from "./Manifest";
import * as Storage from "./Storage";

export interface SyncFetchResponse {
  project: Manifest.Project;
  lessons: {
    lesson: string;
    strings: Storage.TDocString[];
  }[];
}

const serverUrl =
  process.env.NODE_ENV == "development"
    ? "http://localhost:8080"
    : "http://lessonsfromluke.gospelcoding.org";

export async function fetch(code: string) {
  const response = await Axios.get(`${serverUrl}/desktop/fetch/${code}`);
  const data: SyncFetchResponse = response.data;
  Manifest.writeDesktopProject(data.project);
  Storage.makeDesktopProjectDir(data);
}
