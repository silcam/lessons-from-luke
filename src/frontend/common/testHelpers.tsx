/**
 * Shared test helpers for frontend component tests.
 *
 * NOTE: networkSlice has a circular dependency with appState.
 * We break it here by providing a minimal network reducer inline rather
 * than importing networkSlice (which would trigger appState → networkSlice
 * circular evaluation).
 */
import React from "react";
import { render } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import RequestContext from "./api/RequestContext";
import languageSlice from "./state/languageSlice";
import lessonSlice from "./state/lessonSlice";
import tStringSlice from "./state/tStringSlice";
import tSubSlice from "./state/tSubSlice";
import currentUserSlice from "./state/currentUserSlice";
import bannerSlice from "./banners/bannerSlice";
import loadingSlice from "./api/loadingSlice";
import docStringSlice from "./state/docStringSlice";
import docPreviewSlice from "./state/docPreviewSlice";
import syncStateSlice from "./state/syncStateSlice";

// Minimal network reducer that avoids importing networkSlice (circular dep)
function networkReducer(
  state = { connected: true },
  _action: { type: string }
) {
  return state;
}

export const mockGet = jest.fn().mockResolvedValue(null);
export const mockPost = jest.fn().mockResolvedValue(null);

export function buildStore(initialState?: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (configureStore as any)({
    reducer: {
      languages: languageSlice.reducer,
      tStrings: tStringSlice.reducer,
      tSubs: tSubSlice.reducer,
      currentUser: currentUserSlice.reducer,
      banners: bannerSlice.reducer,
      loading: loadingSlice.reducer,
      lessons: lessonSlice.reducer,
      docStrings: docStringSlice.reducer,
      network: networkReducer,
      docPreview: docPreviewSlice.reducer,
      syncState: syncStateSlice.reducer
    },
    preloadedState: initialState
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  initialState?: Record<string, any>
) {
  const store = buildStore(initialState);

  return render(
    <Provider store={store}>
      <RequestContext.Provider value={{ get: mockGet, post: mockPost }}>
        <MemoryRouter>{ui}</MemoryRouter>
      </RequestContext.Provider>
    </Provider>
  );
}

/** A minimal Language fixture */
export const sampleLanguage = {
  languageId: 42,
  name: "Test Language",
  code: "tst",
  motherTongue: false,
  progress: [],
  defaultSrcLang: 1
};

/** A minimal TString fixture */
export const sampleTString = {
  masterId: 1,
  languageId: 42,
  text: "Hello world",
  history: []
};

/** A minimal LessonString fixture */
export const sampleLessonString = {
  lessonStringId: 10,
  masterId: 1,
  lessonId: 5,
  lessonVersion: 1,
  type: "content" as const,
  xpath: "/doc/p[1]",
  motherTongue: true
};

/** Default syncState preloaded state */
export const defaultSyncState = {
  language: null,
  locale: "en" as const,
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
  },
  connected: false,
  loaded: false
};
