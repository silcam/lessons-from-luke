import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import DesktopApp from "../DesktopApp";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  ON_ERROR,
  OnErrorPayload
} from "../../core/api/IpcChannels";
import { NO_CONNECTION } from "./downSync";
import { asAppError } from "../../core/models/AppError";
import LocalStorage from "../LocalStorage";
import { localeByLanguageId } from "../../core/i18n/I18n";

export default function syncStateController(app: DesktopApp) {
  const { webClient, localStorage, getWindow } = app;
  addGetHandler("/api/syncState", async () => {
    return fullSyncState(localStorage, webClient);
  });

  addGetHandler("/api/readyToTranslate", async () => {
    return { readyToTranslate: readyToTranslate(app) };
  });

  addPostHandler("/api/syncState/code", async (_, data) => {
    const language = await webClient.get("/api/languages/code/:code", data);
    if (language) {
      const syncState = localStorage.getSyncState();
      localStorage.setSyncState(
        {
          language,
          locale:
            syncState.locale || localeByLanguageId(language.defaultSrcLang),
          syncLanguages: [
            { languageId: language.languageId, timestamp: 1 },
            { languageId: language.defaultSrcLang, timestamp: 1 }
          ]
        },
        null
      );
    }
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
}

// Should have language, lessons, and lessonStrings and tStrings for first lesson
function readyToTranslate(app: DesktopApp) {
  const { localStorage } = app;
  const language = localStorage.getSyncState().language;
  if (!language) return false;

  const lessons = localStorage.getLessons();
  if (lessons.length == 0) return false;

  const lessonStrings = localStorage.getLessonStrings(lessons[0].lessonId);
  if (lessonStrings.length == 0) return false;

  const srcTStrings = localStorage.getTStrings(
    language.defaultSrcLang,
    lessons[0].lessonId
  );

  return lessonStrings.every(lStr =>
    srcTStrings.some(tStr => tStr.masterId == lStr.masterId)
  );
}
