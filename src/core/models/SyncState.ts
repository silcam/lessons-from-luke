import { Language } from "./Language";

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
    dirtyTStrings: number[];
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
