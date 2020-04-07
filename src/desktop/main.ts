import { app, BrowserWindow, protocol } from "electron";
import contextMenu from "electron-context-menu";
import LocalStorage from "./LocalStorage";
import TestLocalStorage from "./localFixtures/TestLocalStorage";
import DesktopAPIServer from "./DesktopAPIServer";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import path from "path";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null;

const localStorage = new LocalStorage(app);
// const localStorage = new TestLocalStorage(app) //, "batanga-synced");

const webClient = new WebAPIClientForDesktop(app);

contextMenu();

console.log(`APP PATH: ${app.getAppPath()}`);
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });

  if (app.isPackaged) mainWindow.loadFile("web/desktop.html");
  else mainWindow.loadURL("http://localhost:8082/desktop.html");

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

app.on("ready", () => {
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
  createWindow();
  DesktopAPIServer.listen({
    localStorage,
    webClient,
    getWindow: () => mainWindow!,
    electronApp: app
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  app.quit();
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});
