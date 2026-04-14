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
import PublicHome from "./PublicHome";

describe("PublicHome", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(container).toBeTruthy();
  });

  it("shows the app title", () => {
    const { getByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(getByText("Lessons from Luke")).toBeTruthy();
  });

  it("renders a login button", () => {
    const { getAllByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    const buttons = getAllByText(/log.?in/i);
    expect(buttons.length).toBeGreaterThan(0);
  });
});
