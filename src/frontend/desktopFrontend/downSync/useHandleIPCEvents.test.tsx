import React from "react";
import { render, act } from "@testing-library/react";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { ipcRenderer } from "electron";
import useHandleIPCEvents from "./useHandleIPCEvents";
import syncStateSlice from "../../common/state/syncStateSlice";
import bannerSlice from "../../common/banners/bannerSlice";
import languageSlice from "../../common/state/languageSlice";
import loadingSlice from "../../common/api/loadingSlice";
import {
  ON_SYNC_STATE_CHANGE,
  ON_ERROR
} from "../../../core/api/IpcChannels";

const mockOn = ipcRenderer.on as jest.Mock;
const mockRemoveListener = ipcRenderer.removeListener as jest.Mock;

// Build a minimal store with only the slices that useHandleIPCEvents dispatches to
function createTestStore() {
  return configureStore({
    reducer: combineReducers({
      syncState: syncStateSlice.reducer,
      banners: bannerSlice.reducer,
      languages: languageSlice.reducer,
      loading: loadingSlice.reducer
    })
  });
}

// A minimal component that invokes the hook so we can test its side effects
function HookHarness() {
  useHandleIPCEvents();
  return null;
}

function renderHarnessWithStore(store: ReturnType<typeof createTestStore>) {
  return render(
    <Provider store={store}>
      <HookHarness />
    </Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useHandleIPCEvents", () => {
  it("registers IPC listeners for ON_SYNC_STATE_CHANGE and ON_ERROR on mount", () => {
    const store = createTestStore();
    renderHarnessWithStore(store);

    expect(mockOn).toHaveBeenCalledWith(
      ON_SYNC_STATE_CHANGE,
      expect.any(Function)
    );
    expect(mockOn).toHaveBeenCalledWith(ON_ERROR, expect.any(Function));
  });

  it("removes IPC listeners on unmount", () => {
    const store = createTestStore();
    const { unmount } = renderHarnessWithStore(store);
    unmount();

    expect(mockRemoveListener).toHaveBeenCalledWith(
      ON_SYNC_STATE_CHANGE,
      expect.any(Function)
    );
    expect(mockRemoveListener).toHaveBeenCalledWith(
      ON_ERROR,
      expect.any(Function)
    );
  });

  it("dispatches setSyncState when ON_SYNC_STATE_CHANGE fires", () => {
    const store = createTestStore();
    renderHarnessWithStore(store);

    // Extract the registered syncStateChange listener
    const syncStateChangeCall = mockOn.mock.calls.find(
      ([channel]: [string]) => channel === ON_SYNC_STATE_CHANGE
    );
    expect(syncStateChangeCall).toBeDefined();
    const listener = syncStateChangeCall![1];

    const syncStateUpdate = { connected: true, loaded: true };
    act(() => {
      listener({} /* event */, syncStateUpdate);
    });

    const state = store.getState().syncState;
    expect(state.connected).toBe(true);
    expect(state.loaded).toBe(true);
  });

  it("dispatches setTranslating when ON_SYNC_STATE_CHANGE includes a language", () => {
    const store = createTestStore();
    renderHarnessWithStore(store);

    const syncStateChangeCall = mockOn.mock.calls.find(
      ([channel]: [string]) => channel === ON_SYNC_STATE_CHANGE
    );
    const listener = syncStateChangeCall![1];

    const language = {
      languageId: 1,
      name: "English",
      code: "en",
      motherTongue: false,
      progress: [],
      defaultSrcLang: 1
    };

    act(() => {
      listener({}, { language });
    });

    const langState = store.getState().languages;
    expect(langState.translating).toEqual(language);
  });

  it("dispatches a banner error when ON_ERROR fires", () => {
    const store = createTestStore();
    renderHarnessWithStore(store);

    const errorCall = mockOn.mock.calls.find(
      ([channel]: [string]) => channel === ON_ERROR
    );
    expect(errorCall).toBeDefined();
    const errorListener = errorCall![1];

    const error = { type: "Unknown" };
    act(() => {
      errorListener({}, error);
    });

    const banners = store.getState().banners;
    expect(banners.length).toBeGreaterThan(0);
    expect(banners[0].type).toBe("Error");
    expect((banners[0] as any).error).toEqual(error);
  });
});
