import { Language } from "./Language";
import { TString } from "./TString";

export interface StoredSyncState {
  language: Language | null;
  downSync: {
    languages: boolean;
    lessons: boolean;
    lessonStrings: boolean[];
    tStrings: boolean[];
    docPreviews: boolean[];
  };
  upSync: {
    dirtyTStrings: TString[];
  };
}

export interface SyncState extends StoredSyncState {
  loaded: boolean;
  connected: boolean;
}

export function initalStoredSyncState(): StoredSyncState {
  return {
    language: null,
    downSync: {
      languages: false,
      lessons: false,
      lessonStrings: [],
      tStrings: [],
      docPreviews: []
    },
    upSync: {
      dirtyTStrings: []
    }
  };
}

export function downSyncComplete(syncState: StoredSyncState) {
  const ds = syncState.downSync;
  return (
    ds.languages &&
    ds.lessons &&
    ds.lessonStrings.every(ls => ls) &&
    ds.tStrings.every(ts => ts) &&
    ds.docPreviews.every(pr => pr)
  );
}

export function readyToTranslate(syncState: StoredSyncState) {
  return syncState.downSync.lessonStrings[0] && syncState.downSync.tStrings[0];
}
