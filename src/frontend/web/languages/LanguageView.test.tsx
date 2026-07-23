// Break networkSlice → appState → networkSlice circular dep
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
import { fireEvent, waitFor } from "@testing-library/react";
import Axios from "axios";
import { renderWithProviders, sampleLanguage, defaultSyncState } from "../../common/testHelpers";
import LanguageView from "./LanguageView";

const mockedAxios = Axios as jest.Mocked<typeof Axios>;

beforeEach(() => {
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
});

const lessons = [
  { lessonId: 1, book: "Luke" as const, series: 1, lesson: 1, version: 1, lessonStrings: [] },
  { lessonId: 2, book: "Luke" as const, series: 1, lesson: 2, version: 1, lessonStrings: [] },
  { lessonId: 3, book: "Luke" as const, series: 2, lesson: 1, version: 1, lessonStrings: [] },
];

const language = {
  ...sampleLanguage,
  progress: [
    { lessonId: 1, progress: 50 },
    { lessonId: 2, progress: 50 },
    { lessonId: 3, progress: 50 },
  ],
};

function renderLanguageView() {
  return renderWithProviders(<LanguageView language={language} done={() => {}} />, {
    syncState: defaultSyncState,
    languages: { languages: [], adminLanguages: [] },
    currentUser: { user: null, locale: "en", loaded: false },
    lessons,
  });
}

describe("LanguageView — assemble quarter control cluster (US1)", () => {
  it("renders one Assemble Quarter row per unique quarter (book/series), not per lesson", () => {
    const { getAllByText } = renderLanguageView();

    // Two lessons share Luke series 1, one lesson is Luke series 2 — expect
    // exactly two quarter rows, not three (one per lesson) or one.
    expect(
      getAllByText((_content, element) =>
        (element?.textContent ?? "").startsWith("Assemble Quarter")
      )
    ).toHaveLength(2);
  });

  it("leaves the existing per-lesson download controls unaffected", () => {
    const { getAllByText } = renderLanguageView();

    // Existing per-lesson GetDocumentButton controls (one per lesson row)
    // plus the per-quarter Bilingual/Single-Language assemble controls
    // (US2) added below (one pair per quarter row).
    expect(getAllByText("Bilingual")).toHaveLength(3 + 2);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 2);
  });
});

describe("LanguageView — Bilingual | Single-Language assemble actions (US2)", () => {
  it("offers both a Bilingual and a Single-Language assemble action per quarter", () => {
    const { getAllByText } = renderLanguageView();

    // Two distinct quarters (Luke series 1 and Luke series 2) each get one
    // Bilingual and one Single-Language assemble control.
    expect(getAllByText("Bilingual")).toHaveLength(3 + 2);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 2);
  });

  it("triggers assembleQuarter with mode=bilingual when the Bilingual assemble action is clicked", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { getAllByText } = renderLanguageView();

    fireEvent.click(getAllByText("Bilingual")[0]);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/languages/42/quarters/Luke/1/assembly", {
        mode: "bilingual",
      });
    });
  });

  it("triggers assembleQuarter with mode=single-language when the Single-Language assemble action is clicked", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { getAllByText } = renderLanguageView();

    fireEvent.click(getAllByText("Single-Language")[0]);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/languages/42/quarters/Luke/1/assembly", {
        mode: "single-language",
      });
    });
  });
});
