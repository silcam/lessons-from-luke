import React from "react";
import { renderHook } from "../testRenderHook";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import useTSubs from "./useTSubs";
import tStringSlice from "./tStringSlice";
import tSubSlice from "./tSubSlice";
import { TString } from "../../../core/models/TString";
import { TSubLite } from "../../../core/models/TSub";
import { ENGLISH_ID } from "../../../core/models/Language";

// Avoid circular dependency in networkSlice
jest.mock("./networkSlice", () => ({
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

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      tStrings: tStringSlice.reducer,
      tSubs: tSubSlice.reducer
    })
  });

const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

const FRENCH_ID = 2;

const mockTStrings: TString[] = [
  { masterId: 10, languageId: ENGLISH_ID, text: "Old text", history: [] },
  { masterId: 20, languageId: ENGLISH_ID, text: "New text", history: [] },
  { masterId: 10, languageId: FRENCH_ID, text: "Vieux texte", history: [] },
  { masterId: 20, languageId: FRENCH_ID, text: "Nouveau texte", history: [] }
];

const mockTSubsLite: TSubLite[] = [
  {
    languageId: FRENCH_ID,
    from: [10],
    to: [20]
  }
];

describe("useTSubs", () => {
  it("returns empty array when no tSubs for lessonId", () => {
    const store = createTestStore();
    const Wrapper = createWrapper(store);

    const { result } = renderHook(() => useTSubs(999), { wrapper: Wrapper });

    expect(result.current).toEqual([]);
  });

  it("returns combined TSubs when data exists for the lessonId", () => {
    const store = createTestStore();
    store.dispatch(tStringSlice.actions.add(mockTStrings));
    store.dispatch(
      tSubSlice.actions.set({ lessonId: 1, tSubsLite: mockTSubsLite })
    );

    const Wrapper = createWrapper(store);

    const { result } = renderHook(() => useTSubs(1), { wrapper: Wrapper });

    expect(result.current.length).toBe(1);
    expect(result.current[0].languageId).toBe(FRENCH_ID);
  });

  it("inflates engFrom and engTo from tStrings", () => {
    const store = createTestStore();
    store.dispatch(tStringSlice.actions.add(mockTStrings));
    store.dispatch(
      tSubSlice.actions.set({ lessonId: 1, tSubsLite: mockTSubsLite })
    );

    const Wrapper = createWrapper(store);

    const { result } = renderHook(() => useTSubs(1), { wrapper: Wrapper });

    const tSub = result.current[0];
    expect(tSub.engFrom[0]?.masterId).toBe(10);
    expect(tSub.engFrom[0]?.text).toBe("Old text");
    expect(tSub.engTo[0]?.masterId).toBe(20);
    expect(tSub.engTo[0]?.text).toBe("New text");
  });

  it("returns empty array for a different lessonId with no data", () => {
    const store = createTestStore();
    store.dispatch(tStringSlice.actions.add(mockTStrings));
    store.dispatch(
      tSubSlice.actions.set({ lessonId: 1, tSubsLite: mockTSubsLite })
    );

    const Wrapper = createWrapper(store);

    const { result } = renderHook(() => useTSubs(2), { wrapper: Wrapper });

    expect(result.current).toEqual([]);
  });
});
