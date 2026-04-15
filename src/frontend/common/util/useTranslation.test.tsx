import React from "react";
import { renderHook } from "../testRenderHook";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import useTranslation from "./useTranslation";
import currentUserSlice from "../state/currentUserSlice";
import syncStateSlice from "../state/syncStateSlice";
import PlatformContext from "../PlatformContext";
import { tForLocale } from "../../../core/i18n/I18n";
import { initalStoredSyncState } from "../../../core/models/SyncState";

// Avoid circular dependency in networkSlice
jest.mock("../state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn()
  }),
  networkConnectionLostAction: jest.fn(() => ({ type: "NetworkConnectionLost" }))
}));

const baseSyncState = {
  ...initalStoredSyncState(),
  connected: false,
  loaded: false
};

const createTestStore = (preloadedState?: any) =>
  configureStore({
    reducer: combineReducers({
      currentUser: currentUserSlice.reducer,
      syncState: syncStateSlice.reducer
    }),
    preloadedState
  });

describe("useTranslation", () => {
  it("returns a translation function for the current user locale (web)", () => {
    const store = createTestStore({
      currentUser: { user: null, locale: "en", loaded: false }
    });

    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>
        <PlatformContext.Provider value="web">
          {children}
        </PlatformContext.Provider>
      </Provider>
    );

    const { result } = renderHook(() => useTranslation(), { wrapper: Wrapper });

    expect(typeof result.current).toBe("function");
    const expected = tForLocale("en");
    expect(result.current("Luke")).toBe(expected("Luke"));
  });

  it("uses syncState locale for desktop platform", () => {
    const store = createTestStore({
      syncState: {
        ...baseSyncState,
        locale: "fr"
      }
    });

    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>
        <PlatformContext.Provider value="desktop">
          {children}
        </PlatformContext.Provider>
      </Provider>
    );

    const { result } = renderHook(() => useTranslation(), { wrapper: Wrapper });

    const expected = tForLocale("fr");
    expect(result.current("Luke")).toBe(expected("Luke"));
  });

  it("falls back to English when syncState locale is not set on desktop", () => {
    const store = createTestStore({
      syncState: {
        ...baseSyncState,
        locale: undefined
      }
    });

    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>
        <PlatformContext.Provider value="desktop">
          {children}
        </PlatformContext.Provider>
      </Provider>
    );

    const { result } = renderHook(() => useTranslation(), { wrapper: Wrapper });

    const expected = tForLocale("en");
    expect(result.current("Luke")).toBe(expected("Luke"));
  });

  it("uses currentUser locale when on web platform", () => {
    const store = createTestStore({
      currentUser: { user: null, locale: "fr", loaded: false }
    });

    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>
        <PlatformContext.Provider value="web">
          {children}
        </PlatformContext.Provider>
      </Provider>
    );

    const { result } = renderHook(() => useTranslation(), { wrapper: Wrapper });

    const expected = tForLocale("fr");
    expect(result.current("Luke")).toBe(expected("Luke"));
  });
});
