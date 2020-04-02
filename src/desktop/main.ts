import { app, BrowserWindow } from "electron";
import contextMenu from "electron-context-menu";
import LocalStorage from "./LocalStorage";
import { TestLocalStorage } from "./localFixtures/TestLocalStorage";
import DesktopAPIServer from "./DesktopAPIServer";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null;
// const localStorage = new LocalStorage();
const localStorage = new TestLocalStorage("fresh-install");
contextMenu();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });
  mainWindow.loadURL("http://localhost:8082/desktop.html");

  mainWindow.on("closed", function() {
    mainWindow = null;
  });
}

app.on("ready", () => {
  DesktopAPIServer.listen(localStorage);
  createWindow();
});

// Quit when all windows are closed.
app.on("window-all-closed", function() {
  app.quit();
});

app.on("activate", function() {
  if (mainWindow === null) createWindow();
});
