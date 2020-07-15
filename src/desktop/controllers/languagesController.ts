import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import DesktopApp from "../DesktopApp";

export default function languagesController(app: DesktopApp) {
  const { localStorage } = app;

  addGetHandler("/api/languages", async () => {
    // Only return languages that are being synced
    const syncLangIds = localStorage
      .getSyncState()
      .syncLanguages.map(lt => lt.languageId);
    const languages = localStorage.getLanguages();
    return languages.filter(lang => syncLangIds.includes(lang.languageId));
  });

  addGetHandler("/api/languages/code/:code", async ({ code }) => {
    const syncState = localStorage.getSyncState();
    if (syncState.language?.code === code) {
      return syncState.language;
    }
    throw { status: 404 };
  });
}
