import { GetRoute, APIGet, APIPost, PostRoute } from "../core/interfaces/Api";
import { webGet, webPost } from "../core/api/WebAPIClient";
import { AppError, asAppError } from "../core/models/AppError";
import { app } from "electron";

const WATCH_INTERVAL = 3 * 1000;

export default class WebAPIClientForDesktop {
  private connected: boolean = false;
  private watchTimerId: number = 0;
  private watchLock: boolean = false; // Preventing running watch callback more than once at a time
  private onConnectionChangeListeners: Array<(connected: boolean) => void> = [];
  private baseUrl = "";

  constructor() {
    this.baseUrl = app.isPackaged
      ? "https://beta.lessonsfromluke.gospelcoding.org"
      : "http://localhost:8081";
    // this.baseUrl = "https://beta.lessonsfromluke.gospelcoding.org"; // For testing with real server
  }

  setConnected(connected: boolean) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.onConnectionChangeListeners.forEach(cb => cb(connected));
    }
  }

  async get<T extends GetRoute>(
    route: T,
    params: APIGet[T][0]
  ): Promise<APIGet[T][1] | null> {
    return this.trackConnection(() => webGet(route, params, this.baseUrl));
  }

  async post<T extends PostRoute>(
    route: T,
    params: APIPost[T][0],
    data: APIPost[T][1]
  ): Promise<APIPost[T][2] | null> {
    return this.trackConnection(() =>
      webPost(route, params, data, this.baseUrl)
    );
  }

  isConnected() {
    return this.connected;
  }

  onConnectionChange(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners.push(cb);
  }

  removeOnConnectionChangeListener(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners = this.onConnectionChangeListeners.filter(
      listener => listener !== cb
    );
  }

  watch(cb: (client: WebAPIClientForDesktop) => Promise<any>) {
    if (this.watchTimerId) clearInterval(this.watchTimerId);

    this.watchTimerId = setInterval(async () => {
      if (!this.watchLock) {
        this.watchLock = true;
        await cb(this);
        this.watchLock = false;
      }
    }, WATCH_INTERVAL);
  }

  private async trackConnection<T>(cb: () => Promise<T>): Promise<T | null> {
    try {
      const result = await cb();
      this.setConnected(true);
      return result;
    } catch (err) {
      const error = asAppError(err);
      if (error.type == "No Connection") {
        this.setConnected(false);
        return null;
      } else {
        this.setConnected(true);
        throw error;
      }
    }
  }
}
