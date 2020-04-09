import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import DesktopApp from "../DesktopApp";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  ON_ERROR,
  OnErrorPayload
} from "../../core/api/IpcChannels";
import { downSyncBase, downSyncProject, NO_CONNECTION } from "./downSync";
import { asAppError } from "../../core/models/AppError";
import LocalStorage from "../LocalStorage";
import { localeByLanguageId } from "../../core/i18n/I18n";

export default function syncStateController(app: DesktopApp) {
  const { webClient, localStorage, getWindow } = app;
  addGetHandler("/api/syncState", async () => {
    return fullSyncState(localStorage, webClient);
  });

  addPostHandler("/api/syncState/code", async (_, data) => {
    const language = await webClient.get("/api/languages/code/:code", data);
    if (language) {
      const syncState = localStorage.getSyncState();
      localStorage.setSyncState(
        {
          language,
          locale:
            syncState.locale || localeByLanguageId(language.defaultSrcLang)
        },
        null
      );
    }
    persistentlyDownSync(app, downSyncProject);
    return fullSyncState(localStorage, webClient);
  });

  addPostHandler("/api/syncState/locale", async (_, { locale }) => {
    localStorage.setSyncState({ locale }, null);
    return fullSyncState(localStorage, webClient);
  });

  addPostHandler("/api/syncState/progress", async (_, lessonProgress) => {
    const language = localStorage.getSyncState().language;
    if (!language) return;

    const progress = language.progress.filter(
      pr => pr.lessonId != lessonProgress.lessonId
    );
    progress.push(lessonProgress);
    localStorage.setSyncState({ language: { ...language, progress } }, null);
  });

  // Update connection status in interface
  webClient.onConnectionChange(connected => {
    const payload: OnSyncStateChangePayload = fullSyncState(
      localStorage,
      webClient
    );
    getWindow().webContents.send(ON_SYNC_STATE_CHANGE, payload);
  });

  persistentlyDownSync(app, downSyncBase);
  if (localStorage.getSyncState().language)
    persistentlyDownSync(app, downSyncProject);
}

function persistentlyDownSync(
  app: DesktopApp,
  downSync: (app: DesktopApp) => Promise<void>
) {
  const startDownSync = () => {
    downSync(app).catch(err => {
      if (err == NO_CONNECTION) {
        const listener = (connected: boolean) => {
          if (connected) {
            app.webClient.removeOnConnectionChangeListener(listener);
            startDownSync();
          }
        };
        app.webClient.onConnectionChange(listener);
      } else {
        console.error(err);
        const payload: OnErrorPayload = asAppError(err);
        console.log("SEND ERROR");
        app.getWindow().webContents.send(ON_ERROR, payload);
      }
    });
  };
  startDownSync();
}

function fullSyncState(
  localStorage: LocalStorage,
  webClient: WebAPIClientForDesktop
) {
  return {
    ...localStorage.getSyncState(),
    connected: webClient.isConnected(),
    loaded: true
  };
} //
