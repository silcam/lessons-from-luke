import { Language } from "./Language";
import { TString } from "./TString";
import { Locale } from "../i18n/I18n";
import { LanguageTimestamp } from "../interfaces/Api";

export const T_STRING_BATCH_SIZE = 100;

export interface StoredSyncState {
  language: Language | null;
  locale?: Locale;
  downSync: ContinuousSyncPackage;
  syncLanguages: LanguageTimestamp[];
  upSync: {
    dirtyTStrings: TString[];
  };
}

export interface SyncState extends StoredSyncState {
  loaded: boolean;
  connected: boolean;
}

export interface ContinuousSyncPackage {
  languages: boolean;
  baseLessons: boolean;
  lessons: number[];
  tStrings: {
    [languageId: number]: number[];
  };
  timestamp: number;
  progress?: number;
}

export function initalStoredSyncState(): StoredSyncState {
  return {
    language: null,
    downSync: {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: {},
      timestamp: 1
    },
    syncLanguages: [],
    upSync: {
      dirtyTStrings: []
    }
  };
}

export function downSyncProgress(
  downSync: ContinuousSyncPackage,
  storedLessonCount: number,
  storedTStringCount: number
) {
  const neededTStringCount = Object.values(downSync.tStrings).reduce(
    (sum, list) => sum + list.length,
    0
  );

  if (storedLessonCount == 0 || storedTStringCount + neededTStringCount == 0)
    return 0;

  let totalRequests = 2; // One for lessons, one for languages
  let neededRequests = 0;
  if (downSync.languages) ++neededRequests;
  if (downSync.lessons) ++neededRequests;

  totalRequests = storedLessonCount * 2; // One request for lessonStrings, one for docPreview
  neededRequests = downSync.lessons.length * 2;

  totalRequests +=
    (storedTStringCount + neededTStringCount) / T_STRING_BATCH_SIZE; // 100 tStrings per request
  neededRequests += neededTStringCount / T_STRING_BATCH_SIZE;

  return Math.round((100 * (totalRequests - neededRequests)) / totalRequests);
}
