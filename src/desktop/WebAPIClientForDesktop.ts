import { GetRoute, APIGet, APIPost, PostRoute } from "../core/api/ApiContracts";
import { webGet, webPost } from "../core/api/WebAPIClient";
import { AppError, asAppError } from "../core/models/AppError";
import { app } from "electron";
import LocalStorage from "./LocalStorage";
import { CredentialStore } from "./auth/CredentialStore";

const WATCH_INTERVAL = 3 * 1000;

export default class WebAPIClientForDesktop {
  private connected: boolean = false;
  private paired: boolean = false;
  private watchTimerId: ReturnType<typeof setInterval> | undefined;
  private watchLock: boolean = false; // Preventing running watch callback more than once at a time
  private onConnectionChangeListeners: Array<(connected: boolean) => void> = [];
  private onPairedChangeListeners: Array<(paired: boolean) => void> = [];
  private baseUrl = "";
  private localStorage: LocalStorage;
  private credentialStore: CredentialStore | null;

  constructor(localStorage: LocalStorage, credentialStore?: CredentialStore) {
    this.baseUrl = app.isPackaged ? "https://luke.silcameroon.org" : "http://localhost:8081";
    // this.baseUrl = "https://luke.silcameroon.org"; // For testing with real server
    this.localStorage = localStorage;
    this.credentialStore = credentialStore ?? null;
  }

  setConnected(connected: boolean) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.onConnectionChangeListeners.forEach((cb) => cb(connected));
    }
  }

  setPaired(paired: boolean) {
    if (paired !== this.paired) {
      this.paired = paired;
      this.onPairedChangeListeners.forEach((cb) => cb(paired));
    }
  }

  async get<T extends GetRoute>(route: T, params: APIGet[T][0]): Promise<APIGet[T][1] | null> {
    const headers = await this.buildAuthHeaders();
    return this.trackConnection(() => webGet(route, params, this.baseUrl, (msg) => this.log(msg), headers));
  }

  async post<T extends PostRoute>(
    route: T,
    params: APIPost[T][0],
    data: APIPost[T][1]
  ): Promise<APIPost[T][2] | null> {
    const headers = await this.buildAuthHeaders();
    return this.trackConnection(() =>
      webPost(route, params, data, this.baseUrl, (msg) => this.log(msg), headers)
    );
  }

  isConnected() {
    return this.connected;
  }

  isPaired() {
    return this.paired;
  }

  onConnectionChange(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners.push(cb);
  }

  removeOnConnectionChangeListener(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners = this.onConnectionChangeListeners.filter(
      (listener) => listener !== cb
    );
  }

  onPairedChange(cb: (paired: boolean) => void) {
    this.onPairedChangeListeners.push(cb);
  }

  removeOnPairedChangeListener(cb: (paired: boolean) => void) {
    this.onPairedChangeListeners = this.onPairedChangeListeners.filter(
      (listener) => listener !== cb
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

  private async buildAuthHeaders(): Promise<Record<string, string> | undefined> {
    if (!this.credentialStore) return undefined;
    const token = await this.credentialStore.load();
    if (!token) return undefined;
    // Token is placed in a header only — never passed to log()
    return { Authorization: `Bearer ${token}` };
  }

  private async trackConnection<T>(cb: () => Promise<T>): Promise<T | null> {
    try {
      const result = await cb();
      this.setConnected(true);
      return result;
    } catch (err) {
      this.log(`Attempted ${this.baseUrl}`);
      this.log(`ERROR  ${err.log || err}`);
      const isNetworkError =
        err?.code && ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(err.code);
      const error = isNetworkError ? ({ type: "No Connection" } as AppError) : asAppError(err);
      if (error.type == "No Connection") {
        this.setConnected(false);
        return null;
      } else if (error.type === "HTTP" && error.status === 401) {
        // Unauthorized: clear credential and drop the paired state.
        // Do NOT log the error — it could contain response text with session info.
        if (this.credentialStore) {
          await this.credentialStore.clear();
        }
        this.setPaired(false);
        return null;
      } else {
        this.setConnected(true);
        throw error;
      }
    }
  }

  private log(message: string) {
    if (message.startsWith("RESPONSE SIZE")) {
      const size = parseInt(message.slice(14));
      if (size) this.localStorage.logDataUsed(size);
    } else this.localStorage.writeLogEntry("Network", message);
  }
}
