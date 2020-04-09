import LocalStorage from "./LocalStorage";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { BrowserWindow, app, protocol } from "electron";
import contextMenu from "electron-context-menu";
import DesktopAPIServer from "./DesktopAPIServer";
import path from "path";
import TestLocalStorage from "./localFixtures/TestLocalStorage";

export default class DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  mainWindow: BrowserWindow | null = null;

  constructor() {
    this.localStorage = new LocalStorage();
    this.webClient = new WebAPIClientForDesktop();
    this.init();
  }

  getWindow(): BrowserWindow {
    if (!this.mainWindow) throw "Tried to get Window before it was created!";
    return this.mainWindow;
  }

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
        callback(path.join(__dirname, "web", filename));
      },
      err => {
        if (err) console.error("Failed to register protocol");
      }
    );
    DesktopAPIServer.listen(this);
    this.createWindow();
  }

  private createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true
      }
    });

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
    super();
    this.localStorage = new TestLocalStorage();
  }
}
