import DesktopApp from "../DesktopApp";
import {
  ContinuousSyncPackage,
  T_STRING_BATCH_SIZE,
  downSyncProgress,
  updateLanguageTimestamps
} from "../../core/models/SyncState";
import { encodeLanguageTimestamps } from "../../core/interfaces/Api";

export const NO_CONNECTION = "NoConnection";
export const EXPIRED_SYNC = "ExpiredSync";

export async function downSync(app: DesktopApp) {
  try {
    await getDownSync(app);

    const langSyncPromise = syncLanguages(app);
    const baseLessonSyncPromise = syncBaseLessons(app);
    const lessonSyncPromise = syncLessons(app);
    const tStringSyncPromise = syncTStrings(app);

    await Promise.all([
      langSyncPromise,
      baseLessonSyncPromise,
      lessonSyncPromise,
      tStringSyncPromise
    ]);
  } catch (err) {
    catchSyncError(err);
  }
}

// Should be called when languages have been added
// and the intial sync of lessons may still be in progress
export async function downSyncTStrings(app: DesktopApp) {
  try {
    const syncState = app.localStorage.getSyncState();
    const newDownSync = await throwsNoConnection(() =>
      app.webClient.get("/api/sync/:timestamp/languages/:languageTimestamps?", {
        timestamp: syncState.downSync.timestamp,
        languageTimestamps: encodeLanguageTimestamps(syncState.syncLanguages)
      })
    );
    const newDownSyncTstrings = Object.keys(newDownSync.tStrings).reduce(
      (accum: { [id: number]: number[] }, key) => {
        const langId = parseInt(key);
        accum[langId] = (accum[langId] || []).concat(
          newDownSync.tStrings[langId]
        );
        return accum;
      },
      syncState.downSync.tStrings
    );
    updateDownSync(app, syncState.downSync.timestamp, {
      tStrings: newDownSyncTstrings
    });
    app.localStorage.setSyncState(
      updateLanguageTimestamps(
        app.localStorage.getSyncState(),
        syncState.syncLanguages.map(lt => lt.languageId),
        newDownSync.timestamp
      ),
      app
    );

    await syncTStrings(app);
  } catch (err) {
    catchSyncError(err);
  }
}

async function getDownSync(app: DesktopApp) {
  const syncState = app.localStorage.getSyncState();
  const downSync = syncState.downSync;
  if (!downSync.progress || downSync.progress == 100) {
    const newDownSync = await throwsNoConnection(() =>
      app.webClient.get("/api/sync/:timestamp/languages/:languageTimestamps?", {
        timestamp: downSync.timestamp,
        languageTimestamps: encodeLanguageTimestamps(syncState.syncLanguages)
      })
    );
    newDownSync.progress = downSyncProgress(
      newDownSync,
      app.localStorage.getLessonCount(),
      app.localStorage.getTStringCount()
    );
    app.localStorage.setSyncState({ downSync: newDownSync }, app);
    app.localStorage.setSyncState(
      updateLanguageTimestamps(
        app.localStorage.getSyncState(),
        syncState.syncLanguages.map(lt => lt.languageId),
        newDownSync.timestamp
      ),
      app
    );
  }
}

async function syncLanguages(app: DesktopApp) {
  const downSync = app.localStorage.getSyncState().downSync;
  if (downSync.languages) {
    const languages = await throwsNoConnection(() =>
      app.webClient.get("/api/languages", {})
    );
    app.localStorage.setLanguages(languages);
    updateDownSync(app, downSync.timestamp, { languages: false });
  }
}

async function syncBaseLessons(app: DesktopApp) {
  const downSync = app.localStorage.getSyncState().downSync;
  if (downSync.baseLessons) {
    const lessons = await throwsNoConnection(() =>
      app.webClient.get("/api/lessons", {})
    );
    app.localStorage.setLessons(lessons);
    updateDownSync(app, downSync.timestamp, { baseLessons: false });
  }
}

async function syncLessons(app: DesktopApp) {
  const downSync = app.localStorage.getSyncState().downSync;
  const lessonIds = downSync.lessons;

  for (let i = 0; i < lessonIds.length; ++i) {
    const id = lessonIds[i];
    const lesson = await throwsNoConnection(() =>
      app.webClient.get("/api/lessons/:lessonId", { lessonId: id })
    );
    app.localStorage.setLessonStrings(lesson.lessonId, lesson.lessonStrings);
    app.localStorage.removeDocPreview(id);
    updateDownSync(app, downSync.timestamp, {
      lessons: app.localStorage
        .getSyncState()
        .downSync.lessons.filter(_id => _id != id)
    });

    await fetchDocPreview(app, id);
  }
}

async function syncTStrings(app: DesktopApp) {
  const downSync = app.localStorage.getSyncState().downSync;
  const languageIds = Object.keys(downSync.tStrings);
  for (let i = 0; i < languageIds.length; ++i) {
    const languageId = parseInt(languageIds[i]);
    const masterIds = downSync.tStrings[languageId];
    let batch = 0;
    while (masterIds.length > batch * T_STRING_BATCH_SIZE) {
      const tStrings = await throwsNoConnection(() =>
        app.webClient.get("/api/languages/:languageId/tStrings/:ids", {
          languageId,
          ids: masterIds
            .slice(
              T_STRING_BATCH_SIZE * batch,
              T_STRING_BATCH_SIZE * (batch + 1)
            )
            .join(",")
        })
      );
      app.localStorage.setTStrings(languageId, tStrings);
      ++batch;
    }
    updateDownSync(app, downSync.timestamp, {
      tStrings: {
        ...app.localStorage.getSyncState().downSync.tStrings,
        [languageId]: []
      }
    });
  }
}

export async function fetchMissingPreviews(app: DesktopApp) {
  try {
    const lessons = app.localStorage.getLessons();
    for (let i = 0; i < lessons.length; ++i) {
      const lesson = lessons[i];
      if (!app.localStorage.getDocPreview(lesson.lessonId)) {
        await fetchDocPreview(app, lesson.lessonId);
      }
    }
  } catch (err) {
    catchSyncError(err);
  }
}

async function fetchDocPreview(app: DesktopApp, lessonId: number) {
  try {
    const preview = await throwsNoConnection(() =>
      app.webClient.get("/api/lessons/:lessonId/webified", { lessonId })
    );
    app.localStorage.setDocPreview(lessonId, preview.html);
  } catch (err) {
    if (err.status == 404) {
      // We'll try again later
    } else {
      throw err;
    }
  }
}

function updateDownSync(
  app: DesktopApp,
  timestamp: number,
  downSync: Partial<ContinuousSyncPackage>
) {
  const oldDownSync = app.localStorage.getSyncState().downSync;
  if (oldDownSync.timestamp != timestamp) throw EXPIRED_SYNC;
  const newDownSync = { ...oldDownSync, ...downSync };
  newDownSync.progress = downSyncProgress(
    newDownSync,
    app.localStorage.getLessonCount(),
    app.localStorage.getTStringCount()
  );
  app.localStorage.setSyncState(
    {
      downSync: newDownSync
    },
    app
  );
}

async function throwsNoConnection<T>(cb: () => Promise<T | null>): Promise<T> {
  const result = await cb();
  if (!result) throw NO_CONNECTION;
  return result;
}

function catchSyncError(err: any) {
  if (err == NO_CONNECTION || err == EXPIRED_SYNC) {
    console.log(err);
  } else {
    throw err;
  }
}
