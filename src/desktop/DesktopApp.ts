import LocalStorage from "./LocalStorage";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { BrowserWindow, App } from "electron";

export interface DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  getWindow: () => BrowserWindow;
  electronApp: App;
}
