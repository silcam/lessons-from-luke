import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import { DesktopApp } from "../DesktopApp";
import { ON_ERROR, OnErrorPayload } from "../../core/api/IpcChannels";
import { asAppError } from "../../core/models/AppError";
import { modelListMerge } from "../../core/util/arrayUtils";
import { TString, equal } from "../../core/models/TString";
import { SyncState } from "../../core/models/SyncState";
import produce from "immer";

export default function tStringsController(app: DesktopApp) {
  const { localStorage, webClient } = app;

  addGetHandler(
    "/api/languages/:languageId/lessons/:lessonId/tStrings",
    async ({ languageId, lessonId }) => {
      return localStorage.getTStrings(languageId, lessonId);
    }
  );

  addPostHandler("/api/tStrings", async ({}, { tStrings }) => {
    const allTStrings = localStorage.setProjectLanguageTStrings(tStrings);
    upSyncTStrings(app, tStrings);
    return allTStrings;
  });

  // Run upSync on reconnect
  webClient.onConnectionChange(connected => {
    if (connected) {
      upSyncTStrings(app, []);
    }
  });
}

async function upSyncTStrings(app: DesktopApp, tStrings: TString[]) {
  const { localStorage } = app;

  try {
    const upSync = updateUpSync(app, upSync => {
      upSync.dirtyTStrings = modelListMerge(
        upSync.dirtyTStrings,
        tStrings,
        equal
      );
    });

    const code = localStorage.getSyncState().language?.code;
    if (!code) return;

    const tStringsToSave = upSync.dirtyTStrings;
    const savedTStrings = await app.webClient.post(
      "/api/tStrings",
      {},
      { code, tStrings: tStringsToSave }
    );
    if (savedTStrings) {
      app.localStorage.setProjectLanguageTStrings(savedTStrings);
      updateUpSync(app, upSync => {
        // Other TStrings may have been added, filter out the ones we saved
        // Filter checks matching text, since a newer version of the same string could have been added since
        upSync.dirtyTStrings = upSync.dirtyTStrings.filter(
          tString =>
            !tStringsToSave.find(
              tStr => equal(tStr, tString) && tStr.text == tString.text
            )
        );
      });
    }
  } catch (err) {
    console.error(err);
    const payload: OnErrorPayload = asAppError(err);
    app.getWindow().webContents.send(ON_ERROR, payload);
  }
}

function updateUpSync(
  app: DesktopApp,
  update: (upSync: SyncState["upSync"]) => void
) {
  const upSync = produce(app.localStorage.getSyncState().upSync, update);
  app.localStorage.setSyncState({ upSync }, app);
  return upSync;
}
