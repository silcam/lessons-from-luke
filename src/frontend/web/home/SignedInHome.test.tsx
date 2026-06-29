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
import { renderWithProviders, defaultSyncState, mockGet } from "../../common/testHelpers";
import SignedInHome from "./SignedInHome";

// authClient is mapped to src/frontend/__mocks__/authClient.ts via jest moduleNameMapper

const { authClient } = require("../../web/auth/authClient") as {
  authClient: { getSession: jest.Mock; signIn: { email: jest.Mock }; signOut: jest.Mock };
};

const nonAdminUser = { user: { id: "u2", admin: false }, locale: "en", loaded: true, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  authClient.signOut.mockResolvedValue({ data: null, error: null });
});

describe("SignedInHome", () => {
  it("shows the Home heading", () => {
    const { getByText } = renderWithProviders(<SignedInHome />, {
      syncState: defaultSyncState,
      currentUser: nonAdminUser,
    });
    expect(getByText("Home")).toBeTruthy();
  });

  it("shows the signed-in message", () => {
    const { getByText } = renderWithProviders(<SignedInHome />, {
      syncState: defaultSyncState,
      currentUser: nonAdminUser,
    });
    expect(getByText("You're signed in.")).toBeTruthy();
  });

  it("renders a Log Out button", () => {
    const { getByText } = renderWithProviders(<SignedInHome />, {
      syncState: defaultSyncState,
      currentUser: nonAdminUser,
    });
    expect(getByText("Log Out")).toBeTruthy();
  });

  it("does not make any admin API calls", () => {
    renderWithProviders(<SignedInHome />, {
      syncState: defaultSyncState,
      currentUser: nonAdminUser,
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("logs out when the Log Out button is clicked", async () => {
    const { fireEvent, act } = require("@testing-library/react");

    const { getByText } = renderWithProviders(<SignedInHome />, {
      syncState: defaultSyncState,
      currentUser: nonAdminUser,
    });

    await act(async () => {
      fireEvent.click(getByText("Log Out"));
    });

    expect(authClient.signOut).toHaveBeenCalled();
  });
});
