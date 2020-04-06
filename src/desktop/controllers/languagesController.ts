import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import { DesktopApp } from "../DesktopApp";

export default function languagesController(app: DesktopApp) {
  const { localStorage } = app;

  addGetHandler("/api/languages", async () => {
    return localStorage.getLanguages();
  });

  addGetHandler("/api/languages/code/:code", async ({ code }) => {
    const syncState = localStorage.getSyncState();
    if (syncState.language?.code === code) {
      return syncState.language;
    }
    throw { status: 404 };
  });
}
