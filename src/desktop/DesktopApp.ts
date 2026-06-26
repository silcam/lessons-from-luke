import { readFileSync } from "fs";
import LocalStorage from "./LocalStorage";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import {
  BrowserWindow,
  app,
  protocol,
  Menu,
  shell,
  dialog,
  ipcMain,
  MenuItemConstructorOptions,
} from "electron";
import contextMenu from "electron-context-menu";
import windowStateKeeper from "electron-window-state";
import DesktopAPIServer from "./DesktopAPIServer";
import path from "path";
import TestLocalStorage from "./localFixtures/TestLocalStorage";
import { downSync, fetchMissingPreviews } from "./controllers/downSync";
import defaultMenu from "electron-default-menu";
import { dataUsageReport } from "./util/DataUsage";
import { I18nKey } from "../core/i18n/locales/en";
import { resync } from "../core/models/SyncState";
import { tForLocale } from "../core/i18n/I18n";
import { CredentialStore } from "./auth/CredentialStore";
import { DevicePairing } from "./auth/DevicePairing";
import Axios from "axios";
import {
  DEVICE_STATE,
  ON_PAIRING_ERROR,
  ON_SYNC_STATE_CHANGE,
  PAIRING_CANCEL,
  PAIRING_DISCONNECT,
  PAIRING_START,
  PAIRING_USER_CODE,
} from "../core/api/IpcChannels";

/**
 * Duration of better-auth's `updateAge` (1 day). The session keep-alive call
 * is rate-limited to at most one request per this window so a desktop that
 * syncs regularly never lets its session expire.
 */
const SESSION_UPDATE_AGE_MS = 60 * 60 * 24 * 1000; // 24 hours in ms

export default class DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  mainWindow: BrowserWindow | null = null;

  private credentialStore: CredentialStore;
  private devicePairing: DevicePairing;
  private paired: boolean = false;
  private pairedUserName: string | undefined = undefined;
  private pairedUserId: string | undefined = undefined;
  private lastSessionRefresh: number = 0;
  private readonly baseUrl: string;

  /**
   * Promise that resolves when the async pairing initialisation triggered by
   * `appReady()` completes. Tests can await this to observe startup state.
   */
  protected pairingInit: Promise<void> = Promise.resolve();

  constructor(
    localStorage: LocalStorage = new LocalStorage(),
    credentialStore?: CredentialStore,
    devicePairing?: DevicePairing
  ) {
    this.localStorage = localStorage;
    this.baseUrl = app.isPackaged ? "https://luke.silcameroon.org" : "http://localhost:8081";

    this.credentialStore = credentialStore ?? new CredentialStore();

    this.devicePairing =
      devicePairing ??
      new DevicePairing({
        baseUrl: this.baseUrl,
        // onUserCode fires after startPairing() obtains the code; mainWindow
        // is guaranteed to exist by then (user must interact with the UI).
        // The event is advisory — the renderer also gets the code as the
        // return value of its invoke(PAIRING_START) call.
        onUserCode: (code) => this.mainWindow?.webContents.send(PAIRING_USER_CODE, code),
      });

    this.webClient = new WebAPIClientForDesktop(
      localStorage,
      this.credentialStore,
      undefined,
      undefined,
      this.baseUrl
    );
    this.init();
  }

  getWindow = () => {
    if (!this.mainWindow) throw "Tried to get Window before it was created!";
    return this.mainWindow;
  };

  private init() {
    contextMenu();

    app.on("ready", () => {
      this.appReady();
    });
  }

  protected appReady() {
    protocol.handle("file", (request) => {
      try {
        const filename = new URL(request.url).pathname.replace(/^.*\//, "");
        const filePath = path.join(__dirname, "..", "web", filename);
        const data = readFileSync(filePath);
        const ext = path.extname(filename).toLowerCase().slice(1);
        const mimeTypes: Record<string, string> = {
          html: "text/html",
          js: "application/javascript",
          css: "text/css",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          svg: "image/svg+xml",
          woff: "font/woff",
          woff2: "font/woff2",
        };
        return new Response(data, {
          headers: {
            "content-type": mimeTypes[ext] || "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    });

    DesktopAPIServer.listen(this);
    this.registerDeviceIpcHandlers();
    this.startDownSync();
    this.setupMenu();
    this.createWindow();

    // Kick off async pairing init. Store the promise so tests (and subclasses)
    // can await it to observe the settled state.
    this.pairingInit = this.initPairing();
  }

  /**
   * Load any persisted credential, set the initial paired state, and fetch
   * the user's session to populate `pairedUserName` and slide session expiry.
   *
   * Called once per app launch from `appReady()`. Never throws — failures are
   * treated as "no credential / not paired" so the app always starts up.
   */
  private async initPairing(): Promise<void> {
    const token = await this.credentialStore.load();
    if (!token) {
      return;
    }

    // Credential found — mark as paired and fetch session details.
    this.paired = true;
    this.webClient.setPaired(true);
    await this.refreshSession();

    // Mirror webClient's 401 handling back to DesktopApp state so that
    // `device:state` always reflects the current credential validity.
    this.webClient.onPairedChange((paired) => {
      this.paired = paired;
      if (!paired) {
        this.pairedUserName = undefined;
        this.pairedUserId = undefined;
      }
    });
  }

  /**
   * Fetch `/api/auth/get-session` to populate `pairedUserName` and to slide
   * the session's `expiresAt` forward via better-auth's `updateAge` mechanism.
   *
   * Rate-limited to at most one call per `SESSION_UPDATE_AGE_MS` (~24 h).
   * Best-effort: failures are silently swallowed to prevent startup breakage.
   */
  private async refreshSession(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSessionRefresh < SESSION_UPDATE_AGE_MS) {
      return;
    }
    this.lastSessionRefresh = now;

    try {
      const session = await this.webClient.get("/api/auth/get-session", {});
      if (session?.user) {
        this.pairedUserName = session.user.name ?? session.user.email;
        this.pairedUserId = session.user.id;
      }
    } catch {
      // Best-effort — a network failure during startup must not crash the app.
    }
  }

  /**
   * Expose the current pairing state for external consumers (e.g.
   * syncStateController) without leaking private fields.
   */
  getPairedState(): { paired: boolean; pairedUserName: string | undefined } {
    return { paired: this.paired, pairedUserName: this.pairedUserName };
  }

  /**
   * Register device pairing IPC channels (channel names match IpcChannels.ts):
   *   - `pairingStart`      — begin the RFC 8628 flow; returns { userCode }
   *                           immediately; saves token on background approval.
   *   - `pairingCancel`     — acknowledge a cancel request (best-effort).
   *   - `pairingDisconnect` — sign out (best-effort) then clear credential.
   *   - `device:state`      — return current `{ paired, pairedUserName }`.
   */
  private registerDeviceIpcHandlers(): void {
    // pairingStart: starts the RFC 8628 flow and returns { userCode } as soon
    // as the code is available.  The polling loop continues in the background;
    // the renderer is notified via ON_SYNC_STATE_CHANGE (approval) or
    // ON_PAIRING_ERROR (declined/expired/error).
    ipcMain.handle(PAIRING_START, async () => {
      const handle = await this.devicePairing.startPairing();

      // Handle the polling completion in the background so we can return
      // { userCode } to the renderer immediately.
      handle.completion
        .then(async (result) => {
          if (result.status === "approved") {
            await this.credentialStore.save(result.token);
            this.paired = true;
            this.webClient.setPaired(true);
            // Fetch session so the UI can immediately show "connected as <user>".
            // Reset lastSessionRefresh so this call is never skipped.
            this.lastSessionRefresh = 0;
            await this.refreshSession();

            // Notify the renderer so Redux syncState.paired flips to true.
            this.mainWindow?.webContents.send(ON_SYNC_STATE_CHANGE, {
              paired: true,
              pairedUserName: this.pairedUserName,
            });
          } else {
            // declined or expired — notify renderer via the error channel.
            this.mainWindow?.webContents.send(ON_PAIRING_ERROR, {
              reason: result.status,
            });
          }
        })
        .catch(() => {
          this.mainWindow?.webContents.send(ON_PAIRING_ERROR, { reason: "error" });
        });

      return { userCode: handle.userCode };
    });

    // pairingCancel: acknowledges a cancel request from the UI.  Full
    // cancellation of the in-flight polling loop is a future improvement;
    // for now registering the channel prevents "no handler" rejections.
    ipcMain.handle(PAIRING_CANCEL, async () => {
      // No-op stub — polling will terminate naturally on expiry.
    });

    ipcMain.handle(PAIRING_DISCONNECT, async () => {
      // Capture userId before clearing state for the audit log.
      const userId = this.pairedUserId;

      // Best-effort online sign-out (US4.3). Always clear locally regardless.
      if (this.webClient.isConnected()) {
        try {
          const token = await this.credentialStore.load();
          if (token) {
            await Axios.post(
              `${this.baseUrl}/api/auth/sign-out`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } catch {
          // Sign-out failure must not prevent local credential removal.
          // Server-side session will be invalidated via expiry or admin revoke.
          console.warn(
            "[DesktopApp] sign-out request failed; server-side session " +
              "will be invalidated via session expiry or admin revoke"
          );
        }
      }

      await this.credentialStore.clear();
      this.paired = false;
      this.pairedUserName = undefined;
      this.pairedUserId = undefined;
      this.webClient.setPaired(false);

      // FR-021 audit log: structured disconnect event (no token value logged).
      console.log(
        JSON.stringify({ event: "device:disconnect", userId, timestamp: new Date().toISOString() })
      );
    });

    ipcMain.handle(DEVICE_STATE, async () => {
      return { paired: this.paired, pairedUserName: this.pairedUserName };
    });
  }

  private startDownSync() {
    this.webClient.watch(() => downSync(this));
    fetchMissingPreviews(this);
  }

  private setupMenu() {
    const menu = defaultMenu(app, shell);

    menu.splice(4, 0, {
      label: "Admin",
      submenu: [
        {
          label: "App Version",
          click: () => {
            dialog.showMessageBox({
              message: app.getVersion(),
              buttons: ["OK"],
            });
          },
        },
        {
          label: "Data Usage",
          click: () => {
            const usageLog = this.localStorage.readDataUsed();
            dialog.showMessageBox({
              message: dataUsageReport(usageLog),
              buttons: ["OK"],
            });
          },
        },
        {
          label: "Resync",
          click: async () => {
            const choice = await dialog.showMessageBox({
              message: this.t("Resync_explanation"),
              buttons: [this.t("Yes_resync"), this.t("Cancel")],
            });
            if (choice.response == 0)
              this.localStorage.setSyncState(resync(this.localStorage.getSyncState()), this);
          },
        },
      ],
    });

    const viewMenuTop: MenuItemConstructorOptions[] = app.isPackaged
      ? []
      : [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
        ];
    const viewMenuBottom: MenuItemConstructorOptions[] = [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ];
    menu[2].submenu = viewMenuTop.concat(viewMenuBottom);

    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  }

  private createWindow() {
    const windowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    this.mainWindow = new BrowserWindow({
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    windowState.manage(this.mainWindow);

    if (app.isPackaged) this.mainWindow.loadFile("web/desktop.html");
    else this.mainWindow.loadURL("http://localhost:8082/desktop.html");

    this.mainWindow.on("closed", () => {
      app.quit();
    });
  }

  private t(key: I18nKey, subs?: { [key: string]: string }): string {
    const locale = this.localStorage.getSyncState().locale || "en";
    return tForLocale(locale)(key, subs);
  }
}

export class TestDesktopApp extends DesktopApp {
  localStorage: TestLocalStorage;

  constructor() {
    // TestLocalStorage.loadFixtures(); // Load app with a blank slate
    // TestLocalStorage.loadFixtures("batanga-synced"); // Load app with Batanga synced
    const localStorage = new TestLocalStorage();
    super(localStorage);
    this.localStorage = localStorage;
  }
}
