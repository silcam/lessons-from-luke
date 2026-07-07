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
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import PublicHome from "./PublicHome";

// authClient is mapped to src/frontend/__mocks__/authClient.ts via jest moduleNameMapper
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authClient } = require("../../web/auth/authClient") as {
  authClient: { getSession: jest.Mock; signIn: { email: jest.Mock }; signOut: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: successful login
  authClient.signIn.email.mockResolvedValue({
    data: { user: { id: "u1", email: "admin@example.com" } },
    error: null,
  });
});

describe("PublicHome", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });
    expect(container).toBeTruthy();
  });

  it("shows the app title", () => {
    const { getByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });
    expect(getByText("Lessons from Luke")).toBeTruthy();
  });

  it("renders a login button", () => {
    const { getAllByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });
    const buttons = getAllByText(/log.?in/i);
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows login failed alert when credentials are invalid (401 error)", async () => {
    const { fireEvent, act } = require("@testing-library/react");
    // Simulate a 401 error from the authClient
    authClient.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 401, message: "Invalid credentials" },
    });

    const { container, getByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false, error: null },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(getByText(/log.?in failed/i)).toBeTruthy();
  });

  it("calls authClient.signIn.email when login button is clicked", async () => {
    const { fireEvent, act } = require("@testing-library/react");

    const { container } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(authClient.signIn.email).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/" })
    );
  });

  it("renders a 'Forgot password?' link that points to /forgot-password", () => {
    const { getByText } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });

    const link = getByText("Forgot password?");
    expect(link).toBeTruthy();
    expect(link.closest("a")?.getAttribute("href")).toBe("/forgot-password");
  });

  it("renders email and password inputs", () => {
    const { container } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });

    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not crash on successful login", async () => {
    const { fireEvent, act } = require("@testing-library/react");

    const { container } = renderWithProviders(<PublicHome />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(container).toBeTruthy();
  });
});
