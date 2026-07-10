/// <reference types="jest" />

/**
 * Guard test for FR-010: `useGetDocument` names the saved file via
 * `documentName` from `core/models/Lesson`, so a cover lesson (A4/A3)
 * downloads as `<Language>_<Book>-Q<series>-Cover-<A4|A3>.odt`.
 *
 * Spec: specs/008-covers-in-platform/spec.md §FR-010
 * Plan: specs/008-covers-in-platform/plan.md contracts/covers-surface.md §2
 */

// Break networkSlice → appState → networkSlice circular dep (see
// LanguageView.test.tsx for the same workaround).
jest.mock("../../common/state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state,
    actions: {},
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn(),
  }),
  networkConnectionLostAction: jest.fn(),
}));

jest.mock("axios");
jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

import React from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import Axios from "axios";
import { saveAs } from "file-saver";
import useGetDocument from "./useGetDocument";
import { PublicLanguage } from "../../../core/models/Language";
import { BaseLesson, COVER_A4_LESSON, COVER_A3_LESSON } from "../../../core/models/Lesson";
import { buildStore } from "../../common/testHelpers";

const mockedAxios = Axios as jest.Mocked<typeof Axios>;
const mockedSaveAs = saveAs as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const store = buildStore();
  return <Provider store={store}>{children}</Provider>;
}

const language: PublicLanguage = {
  languageId: 1,
  name: "Espanol",
  motherTongue: false,
  progress: [],
  defaultSrcLang: 0,
};

const coverLessonA4: BaseLesson = {
  lessonId: 42,
  book: "Luke",
  series: 1,
  lesson: COVER_A4_LESSON,
  version: 1,
};

const coverLessonA3: BaseLesson = {
  lessonId: 43,
  book: "Luke",
  series: 1,
  lesson: COVER_A3_LESSON,
  version: 1,
};

beforeEach(() => {
  mockedAxios.get.mockReset();
  mockedSaveAs.mockReset();
});

describe("useGetDocument", () => {
  it("downloads an A4 cover with the documentName filename convention", async () => {
    mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });

    const { result } = renderHook(() => useGetDocument(), { wrapper });

    await act(async () => {
      result.current.getDocument(language, coverLessonA4, 2);
      await Promise.resolve();
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      `/api/languages/${language.languageId}/lessons/${coverLessonA4.lessonId}/document?majorityLanguageId=2`,
      { responseType: "blob" }
    );
    expect(mockedSaveAs).toHaveBeenCalledWith(expect.any(Blob), "Espanol_Luke-Q1-Cover-A4.odt");
  });

  it("downloads an A3 cover with the documentName filename convention", async () => {
    mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });

    const { result } = renderHook(() => useGetDocument(), { wrapper });

    await act(async () => {
      result.current.getDocument(language, coverLessonA3, 2);
      await Promise.resolve();
    });

    expect(mockedSaveAs).toHaveBeenCalledWith(expect.any(Blob), "Espanol_Luke-Q1-Cover-A3.odt");
  });
});
