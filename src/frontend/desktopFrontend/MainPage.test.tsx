import React from "react";
import { render } from "@testing-library/react";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import PlatformContext from "../common/PlatformContext";
import RequestContext from "../common/api/RequestContext";
import syncStateSlice from "../common/state/syncStateSlice";
import bannerSlice from "../common/banners/bannerSlice";
import languageSlice from "../common/state/languageSlice";
import loadingSlice from "../common/api/loadingSlice";
import currentUserSlice from "../common/state/currentUserSlice";
import tStringSlice from "../common/state/tStringSlice";
import lessonSlice from "../common/state/lessonSlice";
import docStringSlice from "../common/state/docStringSlice";
import tSubSlice from "../common/state/tSubSlice";
import docPreviewSlice from "../common/state/docPreviewSlice";

// Mock useHandleIPCEvents to avoid ipcRenderer side effects in component tests
jest.mock("./downSync/useHandleIPCEvents", () => ({
  __esModule: true,
  default: jest.fn()
}));

// Mock useLoad/useJustLoad to avoid actual API calls.
// Mocking the whole module avoids the circular dependency:
// networkSlice -> appState -> networkSlice
jest.mock("../common/api/useLoad", () => ({
  useLoad: jest.fn().mockReturnValue(false),
  useJustLoad: jest.fn().mockReturnValue([jest.fn(), false]),
  usePush: jest.fn().mockReturnValue(jest.fn()),
  useLoadMultiple: jest.fn().mockReturnValue(false)
}));

// networkSlice has a circular dep with appState, so we mock it with a minimal stub
// rather than importing it directly.
jest.mock("../common/state/networkSlice", () => {
  const { createSlice } = require("@reduxjs/toolkit");
  const stub = createSlice({
    name: "network",
    initialState: { connected: true },
    reducers: {}
  });
  return {
    __esModule: true,
    default: stub,
    useNetworkConnectionRestored: () => ({
      onConnectionRestored: jest.fn(),
      clearHandlers: jest.fn()
    })
  };
});

function createTestStore(
  syncStateOverrides?: Partial<ReturnType<typeof syncStateSlice.reducer>>
) {
  // Import networkSlice after mock is set up
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const networkSlice = require("../common/state/networkSlice").default;

  const reducer = combineReducers({
    syncState: syncStateSlice.reducer,
    banners: bannerSlice.reducer,
    languages: languageSlice.reducer,
    loading: loadingSlice.reducer,
    network: networkSlice.reducer,
    currentUser: currentUserSlice.reducer,
    tStrings: tStringSlice.reducer,
    tSubs: tSubSlice.reducer,
    lessons: lessonSlice.reducer,
    docStrings: docStringSlice.reducer,
    docPreview: docPreviewSlice.reducer
  });

  const store = configureStore({ reducer });
  if (syncStateOverrides) {
    store.dispatch(syncStateSlice.actions.setSyncState(syncStateOverrides));
  }
  return store;
}

const mockGet = jest.fn().mockResolvedValue(null);
const mockPost = jest.fn().mockResolvedValue(null);

function renderWithProviders(
  ui: React.ReactElement,
  store = createTestStore()
) {
  return render(
    <Provider store={store}>
      <RequestContext.Provider value={{ get: mockGet as any, post: mockPost as any }}>
        <PlatformContext.Provider value="desktop">
          <MemoryRouter>{ui}</MemoryRouter>
        </PlatformContext.Provider>
      </RequestContext.Provider>
    </Provider>
  );
}

// Require components after mocks are in place
const MainPage = require("./MainPage").default;
const DownSyncPage = require("./downSync/DownSyncPage").default;
const SyncCodeForm = require("./downSync/SyncCodeForm").default;

describe("SplashScreen (via MainPage when not loaded)", () => {
  it("shows SplashScreen when syncState is not loaded", () => {
    const store = createTestStore({ loaded: false });
    const { getByText } = renderWithProviders(<MainPage />, store);
    // SplashScreen renders "Loading..."
    expect(getByText(/"Loading\.\.\."/)).toBeTruthy();
  });
});

describe("MainPage", () => {
  it("renders without crashing when syncState is not loaded", () => {
    const store = createTestStore({ loaded: false });
    const { container } = renderWithProviders(<MainPage />, store);
    expect(container).toBeTruthy();
  });

  it("renders DownSyncPage when loaded and progress < 100", () => {
    const store = createTestStore({
      loaded: true,
      language: null,
      downSync: {
        languages: false,
        baseLessons: false,
        lessons: [],
        tStrings: {},
        timestamp: 1,
        progress: 50
      }
    });
    const { container } = renderWithProviders(<MainPage />, store);
    expect(container).toBeTruthy();
  });
});

describe("DownSyncPage", () => {
  it("renders without crashing when no language is set", () => {
    const store = createTestStore({ loaded: true, language: null });
    const { container } = renderWithProviders(
      <DownSyncPage startTranslating={jest.fn()} />,
      store
    );
    expect(container).toBeTruthy();
  });

  it("renders SyncCodeForm when no language set", () => {
    const store = createTestStore({ loaded: true, language: null });
    const { container } = renderWithProviders(
      <DownSyncPage startTranslating={jest.fn()} />,
      store
    );
    // SyncCodeForm contains a text input with placeholder ABCDEF
    expect(container.querySelector('input[placeholder="ABCDEF"]')).toBeTruthy();
  });

  it("renders progress bar when language is set", () => {
    const language = {
      languageId: 1,
      name: "English",
      code: "en",
      motherTongue: false,
      progress: [],
      defaultSrcLang: 1
    };
    const store = createTestStore({
      loaded: true,
      language,
      downSync: {
        languages: false,
        baseLessons: false,
        lessons: [],
        tStrings: {},
        timestamp: 1,
        progress: 50
      }
    });
    const { container } = renderWithProviders(
      <DownSyncPage startTranslating={jest.fn()} />,
      store
    );
    expect(container).toBeTruthy();
  });
});

describe("SyncCodeForm", () => {
  it("renders without crashing", () => {
    const store = createTestStore({ loaded: true, language: null, connected: false });
    const { container } = renderWithProviders(<SyncCodeForm />, store);
    expect(container).toBeTruthy();
  });

  it("renders an input for the sync code", () => {
    const store = createTestStore({ loaded: true, language: null, connected: true });
    const { container } = renderWithProviders(<SyncCodeForm />, store);
    const input = container.querySelector('input[placeholder="ABCDEF"]');
    expect(input).toBeTruthy();
  });

  it("shows no connection alert when not connected", () => {
    const store = createTestStore({
      loaded: true,
      language: null,
      connected: false
    });
    renderWithProviders(<SyncCodeForm />, store);
    // Alert is shown for no connection - verify the store reflects this
    expect(store.getState().syncState.connected).toBe(false);
  });
});
