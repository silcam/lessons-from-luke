import { DesktopApp } from "../DesktopApp";
import {
  OnSyncStateChangePayload,
  ON_SYNC_STATE_CHANGE
} from "../../core/api/IpcChannels";
import { StoredSyncState } from "../../core/models/SyncState";
import produce from "immer";
import waitFor from "../../core/util/waitFor";

export const NO_CONNECTION = "NoConnection";

export async function downSyncBase(app: DesktopApp) {
  const { localStorage, webClient } = app;
  let syncState = localStorage.getSyncState();

  try {
    if (!syncState.downSync.languages) {
      const languages = await throwsNoConnection(() =>
        webClient.get("/api/languages", {})
      );
      localStorage.setLanguages(languages);
      syncState = updateSyncState(app, syncState => {
        syncState.downSync.languages = true;
      });
    }

    if (!syncState.downSync.lessons) {
      const lessons = await throwsNoConnection(() =>
        webClient.get("/api/lessons", {})
      );
      const allFalse = () => new Array(lessons.length).fill(false);
      localStorage.setLessons(lessons);
      syncState = updateSyncState(app, syncState => {
        (syncState.downSync.lessons = true),
          (syncState.downSync.lessonStrings = allFalse()),
          (syncState.downSync.tStrings = allFalse()),
          (syncState.downSync.docPreviews = allFalse());
      });
    }

    const lessons = localStorage.getLessons();
    for (let lessonIndex = 0; lessonIndex < lessons.length; ++lessonIndex) {
      if (!syncState.downSync.lessonStrings[lessonIndex]) {
        const lesson = await throwsNoConnection(() =>
          webClient.get("/api/lessons/:lessonId", {
            lessonId: lessons[lessonIndex].lessonId
          })
        );
        localStorage.setLessonStrings(lesson.lessonId, lesson.lessonStrings);
        updateSyncState(app, syncState => {
          syncState.downSync.lessonStrings[lessonIndex] = true;
        });
      }
    }
  } catch (err) {
    throw err;
  }
}

export async function downSyncProject(app: DesktopApp) {
  const { localStorage, webClient } = app;
  let syncState = localStorage.getSyncState();
  if (!syncState.language)
    throw "Don't call downSyncProject without setting syncState.language!";

  if (!syncState.downSync.lessons) {
    // Unlikely but possible - they should be coming soon - otherwise throws
    await waitFor(() => localStorage.getSyncState().downSync.lessons);
    syncState = localStorage.getSyncState();
  }

  // TStrings
  const lessons = localStorage.getLessons();
  for (let lessonIndex = 0; lessonIndex < lessons.length; ++lessonIndex) {
    if (!syncState.downSync.tStrings[lessonIndex]) {
      const lessonId = lessons[lessonIndex].lessonId;
      const srcLangId = syncState.language!.defaultSrcLang;
      const targetLangId = syncState.language!.languageId;

      const srcTStrings = await throwsNoConnection(() =>
        webClient.get("/api/languages/:languageId/lessons/:lessonId/tStrings", {
          lessonId,
          languageId: srcLangId
        })
      );
      localStorage.setTStrings(srcLangId, srcTStrings);

      const targetTStrings = await throwsNoConnection(() =>
        webClient.get("/api/languages/:languageId/lessons/:lessonId/tStrings", {
          lessonId,
          languageId: targetLangId
        })
      );
      localStorage.setTStrings(targetLangId, targetTStrings);

      syncState = updateSyncState(app, syncState => {
        syncState.downSync.tStrings[lessonIndex] = true;
      });
    }
  }

  // Doc Previews
  for (let i = 0; i < syncState.downSync.docPreviews.length; ++i) {
    if (!syncState.downSync.docPreviews[i]) {
      try {
        const lessonId = lessons[i].lessonId;
        const preview = await throwsNoConnection(() =>
          webClient.get("/api/lessons/:lessonId/webified", { lessonId })
        );
        localStorage.setDocPreview(lessonId, preview.html);
        updateSyncState(app, syncState => {
          syncState.downSync.docPreviews[i] = true;
        });
      } catch (err) {
        if (err.status == 404) {
          // Continue - not an error
        } else {
          throw err;
        }
      }
    }
  }
} //

function updateSyncState(
  app: DesktopApp,
  update: (syncState: StoredSyncState) => void | StoredSyncState
): StoredSyncState {
  const syncState = produce(app.localStorage.getSyncState(), update);
  app.localStorage.setSyncState(syncState);

  const payload: OnSyncStateChangePayload = syncState;
  app.getWindow().webContents.send(ON_SYNC_STATE_CHANGE, payload);

  return syncState;
}

async function throwsNoConnection<T>(cb: () => Promise<T | null>): Promise<T> {
  const result = await cb();
  if (!result) throw NO_CONNECTION;
  return result;
}
