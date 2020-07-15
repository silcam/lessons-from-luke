import LocalStorage from "./LocalStorage";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { BrowserWindow, app, protocol } from "electron";
import contextMenu from "electron-context-menu";
import windowStateKeeper from "electron-window-state";
import DesktopAPIServer from "./DesktopAPIServer";
import path from "path";
import TestLocalStorage from "./localFixtures/TestLocalStorage";
import { downSync, fetchMissingPreviews } from "./controllers/downSync";

export default class DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  mainWindow: BrowserWindow | null = null;

  constructor(localStorage: LocalStorage = new LocalStorage()) {
    this.localStorage = localStorage;
    this.webClient = new WebAPIClientForDesktop();
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
    this.createWindow();
  }

  private startDownSync() {
    this.webClient.watch(() => downSync(this));
    fetchMissingPreviews(this);
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
