import React from "react";
import { renderHook } from "../testRenderHook";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import useLessonTStrings from "./useLessonTStrings";
import languageSlice from "../state/languageSlice";
import tStringSlice from "../state/tStringSlice";
import lessonSlice from "../state/lessonSlice";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "../api/loadingSlice";
import tSubSlice from "../state/tSubSlice";
import docStringSlice from "../state/docStringSlice";
import docPreviewSlice from "../state/docPreviewSlice";
import syncStateSlice from "../state/syncStateSlice";
import currentUserSlice from "../state/currentUserSlice";
import PlatformContext from "../PlatformContext";
import RequestContext from "../api/RequestContext";
import { Lesson } from "../../../core/models/Lesson";
import { Language } from "../../../core/models/Language";
import { TString } from "../../../core/models/TString";

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

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      languages: languageSlice.reducer,
      tStrings: tStringSlice.reducer,
      tSubs: tSubSlice.reducer,
      currentUser: currentUserSlice.reducer,
      banners: bannerSlice.reducer,
      loading: loadingSlice.reducer,
      lessons: lessonSlice.reducer,
      docStrings: docStringSlice.reducer,
      network: (state = { connected: true }) => state,
      docPreview: docPreviewSlice.reducer,
      syncState: syncStateSlice.reducer
    })
  });

const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  const Wrapper: React.FC = ({ children }) => (
    <Provider store={store}>
      <PlatformContext.Provider value="web">
        <RequestContext.Provider
          value={{ get: jest.fn() as any, post: jest.fn() as any }}
        >
          {children}
        </RequestContext.Provider>
      </PlatformContext.Provider>
    </Provider>
  );
  return Wrapper;
};

const mockLesson: Lesson = {
  lessonId: 1,
  book: "Luke",
  series: 1,
  lesson: 1,
  version: 1,
  lessonStrings: [
    {
      lessonStringId: 10,
      masterId: 100,
      lessonId: 1,
      lessonVersion: 1,
      type: "content",
      xpath: "/body/p[1]",
      motherTongue: false
    },
    {
      lessonStringId: 11,
      masterId: 101,
      lessonId: 1,
      lessonVersion: 1,
      type: "content",
      xpath: "/body/p[2]",
      motherTongue: false
    }
  ]
};

const ENGLISH_ID = 1;
const FRENCH_ID = 2;

const mockTStrings: TString[] = [
  { masterId: 100, languageId: ENGLISH_ID, text: "Hello", history: [] },
  { masterId: 101, languageId: ENGLISH_ID, text: "World", history: [] },
  { masterId: 100, languageId: FRENCH_ID, text: "Bonjour", history: [] }
];

const mockLanguage: Language = {
  languageId: FRENCH_ID,
  name: "French",
  code: "fr",
  motherTongue: false,
  defaultSrcLang: ENGLISH_ID,
  progress: []
};

describe("useLessonTStrings", () => {
  it("returns empty lessonTStrings when lesson does not exist", () => {
    const store = createTestStore();
    const Wrapper = createWrapper(store);

    const { result } = renderHook(
      () => useLessonTStrings(999, [ENGLISH_ID, FRENCH_ID]),
      { wrapper: Wrapper }
    );

    expect(result.current.lesson).toBeUndefined();
    expect(result.current.lessonTStrings).toEqual([]);
  });

  it("returns lessonTStrings for a known lesson", () => {
    const store = createTestStore();
    store.dispatch(lessonSlice.actions.add([mockLesson]));
    store.dispatch(tStringSlice.actions.add(mockTStrings));

    const Wrapper = createWrapper(store);

    const { result } = renderHook(
      () => useLessonTStrings(1, [ENGLISH_ID, FRENCH_ID]),
      { wrapper: Wrapper }
    );

    expect(result.current.lesson).toBeDefined();
    expect(result.current.lessonTStrings.length).toBe(2);
  });

  it("maps tStrings to lesson strings by masterId and languageId", () => {
    const store = createTestStore();
    store.dispatch(lessonSlice.actions.add([mockLesson]));
    store.dispatch(tStringSlice.actions.add(mockTStrings));

    const Wrapper = createWrapper(store);

    const { result } = renderHook(
      () => useLessonTStrings(1, [ENGLISH_ID, FRENCH_ID]),
      { wrapper: Wrapper }
    );

    const ltStrings = result.current.lessonTStrings;
    expect(ltStrings[0].tStrs[0]?.text).toBe("Hello");
    expect(ltStrings[0].tStrs[1]?.text).toBe("Bonjour");
    expect(ltStrings[1].tStrs[0]?.text).toBe("World");
    expect(ltStrings[1].tStrs[1]).toBeUndefined();
  });

  it("filters to contentOnly when that option is set", () => {
    const lessonWithMeta: Lesson = {
      ...mockLesson,
      lessonStrings: [
        ...mockLesson.lessonStrings,
        {
          lessonStringId: 12,
          masterId: 102,
          lessonId: 1,
          lessonVersion: 1,
          type: "meta",
          xpath: "/meta",
          motherTongue: false
        }
      ]
    };

    const store = createTestStore();
    store.dispatch(lessonSlice.actions.add([lessonWithMeta]));
    store.dispatch(tStringSlice.actions.add(mockTStrings));

    const Wrapper = createWrapper(store);

    const { result } = renderHook(
      () =>
        useLessonTStrings(1, [ENGLISH_ID, FRENCH_ID], { contentOnly: true }),
      { wrapper: Wrapper }
    );

    const types = result.current.lessonTStrings.map(
      (lt: { lStr: { type: string } }) => lt.lStr.type
    );
    expect(types.every((t: string) => t === "content")).toBe(true);
    expect(result.current.lessonTStrings.length).toBe(2);
  });

  it("dispatches progress update when updateProgress is true", () => {
    const store = createTestStore();
    store.dispatch(lessonSlice.actions.add([mockLesson]));
    store.dispatch(tStringSlice.actions.add(mockTStrings));
    store.dispatch(languageSlice.actions.setTranslating(mockLanguage));

    const Wrapper = createWrapper(store);
    const dispatchSpy = jest.spyOn(store, "dispatch");

    renderHook(
      () =>
        useLessonTStrings(1, [ENGLISH_ID, FRENCH_ID], {
          updateProgress: true
        }),
      { wrapper: Wrapper }
    );

    const setProgressCalls = dispatchSpy.mock.calls.filter(
      (call: any[]) =>
        call[0] &&
        typeof call[0] === "object" &&
        "type" in call[0] &&
        (call[0] as any).type === "languages/setProgress"
    );
    expect(setProgressCalls.length).toBeGreaterThan(0);
  });
});
