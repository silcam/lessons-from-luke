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
import { renderWithProviders, sampleLanguage, defaultSyncState } from "../../common/testHelpers";
import LanguagesBox from "./LanguagesBox";

describe("LanguagesBox", () => {
  it("renders without crashing with empty languages", () => {
    const { container } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(container).toBeTruthy();
  });

  it("renders languages header", () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(getByText(/languages/i)).toBeTruthy();
  });

  it("renders a list of languages when provided", () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: {
        languages: [],
        adminLanguages: [sampleLanguage]
      },
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(getByText("Test Language")).toBeTruthy();
  });
});
