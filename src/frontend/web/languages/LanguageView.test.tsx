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

import React from "react";
import { renderWithProviders, sampleLanguage, defaultSyncState } from "../../common/testHelpers";
import LanguageView from "./LanguageView";

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
  it("renders one Assemble Quarter control per unique quarter (book/series), not per lesson", () => {
    const { getAllByText } = renderLanguageView();

    // Two lessons share Luke series 1, one lesson is Luke series 2 — expect
    // exactly two quarter controls, not three (one per lesson) or one.
    expect(getAllByText("Assemble Quarter")).toHaveLength(2);
  });

  it("leaves the existing per-lesson download controls unaffected", () => {
    const { getAllByText } = renderLanguageView();

    // Existing per-lesson GetDocumentButton controls (one per lesson row).
    expect(getAllByText("Bilingual")).toHaveLength(3);
    expect(getAllByText("Single-Language")).toHaveLength(3);
  });
});
