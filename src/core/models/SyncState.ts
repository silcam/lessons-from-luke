import { Language } from "./Language";

export type DownSyncStages = "zero" | "essential" | "optional" | "done";

export interface StoredSyncState {
  language: Language | null;
  downSync: {
    stage: DownSyncStages;
    currentLessonIndex: number;
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
      stage: "zero",
      currentLessonIndex: 0
    },
    upSync: {
      dirtyTStrings: []
    }
  };
}
