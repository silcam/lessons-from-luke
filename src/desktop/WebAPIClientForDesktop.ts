import {
  SharedAPIGet,
  SharedAPIPost,
  SharedGetRoute,
  SharedPostRoute,
} from "../core/api/ApiContracts";
import { webGet, webPost } from "../core/api/WebAPIClient";
import { AppError, asAppError } from "../core/models/AppError";
import LocalStorage from "./LocalStorage";
import { CredentialStore } from "./auth/CredentialStore";

const WATCH_INTERVAL = 3 * 1000;

/** Called to slide the session expiry by hitting the get-session endpoint. Injectable for tests. */
type SessionFetcher = (url: string, token: string) => Promise<void>;

const defaultSessionFetcher: SessionFetcher = async (url, token) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    const err: AppError = { type: "HTTP", status: 401 };
    throw err;
  }
};

export default class WebAPIClientForDesktop {
  private connected: boolean = false;
  private paired: boolean = false;
  private syncAborted: boolean = false;
  private lastKeepAliveAt: number | null = null;
  private readonly keepAliveIntervalMs: number; // ~daily by default, matches better-auth updateAge
  private watchTimerId: ReturnType<typeof setInterval> | undefined;
  private watchLock: boolean = false; // Preventing running watch callback more than once at a time
  private onConnectionChangeListeners: Array<(connected: boolean) => void> = [];
  private onPairedChangeListeners: Array<(paired: boolean) => void> = [];
  private baseUrl = "";
  private localStorage: LocalStorage;
  private credentialStore: CredentialStore | null;
  private sessionFetcher: SessionFetcher;

  constructor(
    localStorage: LocalStorage,
    credentialStore?: CredentialStore,
    sessionFetcher?: SessionFetcher,
    keepAliveIntervalMs = 24 * 60 * 60 * 1000,
    baseUrl = ""
  ) {
    this.baseUrl = baseUrl;
    this.localStorage = localStorage;
    this.credentialStore = credentialStore ?? null;
    this.sessionFetcher = sessionFetcher ?? defaultSessionFetcher;
    this.keepAliveIntervalMs = keepAliveIntervalMs;
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

  async get<T extends SharedGetRoute>(
    route: T,
    params: SharedAPIGet[T][0]
  ): Promise<SharedAPIGet[T][1] | null> {
    if (this.syncAborted) return null;
    const headers = await this.buildAuthHeaders();
    return this.trackConnection(() =>
      webGet(route, params, this.baseUrl, (msg) => this.log(msg), headers)
    );
  }

  async post<T extends SharedPostRoute>(
    route: T,
    params: SharedAPIPost[T][0],
    data: SharedAPIPost[T][1]
  ): Promise<SharedAPIPost[T][2] | null> {
    if (this.syncAborted) return null;
    const headers = await this.buildAuthHeaders();
    return this.trackConnection(() =>
      webPost(route, params, data, this.baseUrl, (msg) => this.log(msg), headers)
    );
  }

  /**
   * Lightweight reachability probe for the un-paired state. Issues a single GET
   * to the public `/api/languages` endpoint, routed through `trackConnection` so
   * `connected` reflects whether the server is reachable — WITHOUT pulling any
   * project data or polling the `/api/sync` route. This lets the desktop keep an
   * accurate online/offline gate (to show the "Connect to account" prompt) while
   * an un-paired device stays off the sync API entirely (FR-015 / FR-016).
   */
  async probeConnection(): Promise<void> {
    await this.get("/api/languages", {});
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
        this.syncAborted = false; // Reset abort flag for each new sync pass
        await this.maybeKeepAlive();
        await cb(this);
        this.watchLock = false;
      }
    }, WATCH_INTERVAL);
  }

  private async maybeKeepAlive(): Promise<void> {
    if (!this.connected || !this.paired) return;
    if (this.credentialStore === null) return;

    const now = Date.now();
    if (this.lastKeepAliveAt !== null && now - this.lastKeepAliveAt < this.keepAliveIntervalMs) {
      return; // Already refreshed within the updateAge window
    }

    const token = await this.credentialStore.load();
    if (!token) return;

    try {
      await this.sessionFetcher(`${this.baseUrl}/api/auth/get-session`, token);
      this.lastKeepAliveAt = now;
    } catch (err) {
      const error = asAppError(err);
      if (error.type === "HTTP" && error.status === 401) {
        await this.credentialStore.clear();
        this.setPaired(false);
      }
      // Other errors (network, server): silently ignore — will retry on next watch tick
    }
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
        // Unauthorized: abort remaining sync requests, clear credential, drop paired state.
        // Do NOT log the error — it could contain response text with session info.
        this.syncAborted = true;
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
