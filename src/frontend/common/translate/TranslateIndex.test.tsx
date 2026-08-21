// Break networkSlice → appState → networkSlice circular dep
jest.mock("../state/networkSlice", () => ({
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
import { renderWithProviders, defaultSyncState } from "../testHelpers";
import TranslateIndex from "./TranslateIndex";
import { sampleLanguage } from "../testHelpers";

const coverA4Lesson = {
  lessonId: 97,
  book: "Luke" as const,
  series: 1,
  lesson: 97,
  version: 1,
};

const coverA3Lesson = {
  lessonId: 98,
  book: "Luke" as const,
  series: 1,
  lesson: 98,
  version: 1,
};

describe("TranslateIndex", () => {
  it("renders cover lessons as 'Cover (A4)'/'Cover (A3)', never the raw lesson number", () => {
    const { container, queryByText } = renderWithProviders(
      <TranslateIndex language={sampleLanguage} />,
      {
        syncState: defaultSyncState,
        lessons: [coverA4Lesson, coverA3Lesson],
        currentUser: { user: null, locale: "en", loaded: false },
      }
    );

    expect(queryByText(/Cover \(A4\)/)).toBeTruthy();
    expect(queryByText(/Cover \(A3\)/)).toBeTruthy();

    const text = container.textContent || "";
    expect(text).not.toMatch(/\b97\b/);
    expect(text).not.toMatch(/\b98\b/);
    expect(text).not.toMatch(/Lesson 97/);
    expect(text).not.toMatch(/Lesson 98/);
  });
});
