// Break networkSlice → appState → networkSlice circular dep
jest.mock("../../common/state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state,
    actions: {}
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn()
  }),
  networkConnectionLostAction: jest.fn()
}));

import React from "react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import LessonsBox from "./LessonsBox";

const sampleLesson = {
  lessonId: 1,
  book: "Luke" as const,
  series: 1,
  lesson: 1
};

describe("LessonsBox", () => {
  it("renders without crashing with no lessons", () => {
    const { container } = renderWithProviders(<LessonsBox />, {
      syncState: defaultSyncState,
      lessons: [],
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(container).toBeTruthy();
  });

  it("renders Lessons heading", () => {
    const { getByText } = renderWithProviders(<LessonsBox />, {
      syncState: defaultSyncState,
      lessons: [],
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(getByText(/lessons/i)).toBeTruthy();
  });

  it("renders lesson names when lessons are provided", () => {
    const { container } = renderWithProviders(<LessonsBox />, {
      syncState: defaultSyncState,
      lessons: [sampleLesson],
      currentUser: { user: null, locale: "en", loaded: false }
    });
    // Should have rendered the lesson link
    expect(container.querySelector("a")).toBeTruthy();
  });
});
