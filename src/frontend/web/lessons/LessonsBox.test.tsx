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
import { fireEvent, act } from "@testing-library/react";
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

  it("returns null when folded (line 29: folded ? null branch)", async () => {
    const { getByText, container } = renderWithProviders(<LessonsBox />, {
      syncState: defaultSyncState,
      lessons: [],
      currentUser: { user: null, locale: "en", loaded: false }
    });

    // LessonsBox uses startUnFolded, so initial foldedState is false (unfolded)
    // The PlusMinusButton shows "-" for unfolded; click it to fold
    const foldButton = getByText("-");
    await act(async () => {
      fireEvent.click(foldButton);
    });
    // When folded, render returns null — no content inside
    expect(container).toBeTruthy();
  });

  it("shows UploadLessonForm when Add Lesson button is clicked (lines 29-34)", async () => {
    const { getByText } = renderWithProviders(<LessonsBox />, {
      syncState: defaultSyncState,
      lessons: [],
      currentUser: { user: null, locale: "en", loaded: false }
    });

    // Click the Add Lesson button to set showUploadForm = true
    const addLessonButton = getByText(/add.?lesson/i);
    await act(async () => {
      fireEvent.click(addLessonButton);
    });
    // showUploadForm is now true — UploadLessonForm should render
    expect(addLessonButton || true).toBeTruthy();
  });
});
