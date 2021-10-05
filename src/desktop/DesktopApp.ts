import LocalStorage from "./LocalStorage";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import {
  BrowserWindow,
  app,
  protocol,
  Menu,
  shell,
  dialog,
  MenuItemConstructorOptions
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

export default class DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  mainWindow: BrowserWindow | null = null;

  constructor(localStorage: LocalStorage = new LocalStorage()) {
    this.localStorage = localStorage;
    this.webClient = new WebAPIClientForDesktop(localStorage);
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
    protocol.interceptFileProtocol(
      "file",
      (request, callback) => {
        const filename = request.url.replace(/^.*\//, "");
        callback(path.join(__dirname, "..", "web", filename));
      },
      err => {
        if (err) console.error("Failed to register protocol");
      }
    );
    DesktopAPIServer.listen(this);
    this.startDownSync();
    this.setupMenu();
    this.createWindow();
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
              buttons: ["OK"]
            });
          }
        },
        {
          label: "Data Usage",
          click: () => {
            const usageLog = this.localStorage.readDataUsed();
            dialog.showMessageBox({
              message: dataUsageReport(usageLog),
              buttons: ["OK"]
            });
          }
        },
        {
          label: "Resync",
          click: async () => {
            const choice = await dialog.showMessageBox({
              message: this.t("Resync_explanation"),
              buttons: [this.t("Yes_resync"), this.t("Cancel")]
            });
            if (choice.response == 0)
              this.localStorage.setSyncState(
                resync(this.localStorage.getSyncState()),
                this
              );
          }
        }
      ]
    });

    const viewMenuTop: MenuItemConstructorOptions[] = app.isPackaged
      ? []
      : [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" }
        ];
    const viewMenuBottom: MenuItemConstructorOptions[] = [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" }
    ];
    menu[2].submenu = viewMenuTop.concat(viewMenuBottom);

    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  }

  private createWindow() {
    const windowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800
    });
    this.mainWindow = new BrowserWindow({
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      webPreferences: {
        nodeIntegration: true
      }
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
