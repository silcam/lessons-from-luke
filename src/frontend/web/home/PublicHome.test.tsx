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
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { renderWithProviders, buildStore, defaultSyncState } from "../../common/testHelpers";
import PublicHome from "./PublicHome";

/**
 * Render PublicHome at a specific URL path (to simulate ?returnTo query params).
 */
function renderPublicHomeAt(path: string, initialState?: Record<string, unknown>) {
  const store = buildStore({
    syncState: defaultSyncState,
    currentUser: { user: null, locale: "en", loaded: false, error: null },
    ...initialState,
  });
  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PublicHome />
      </MemoryRouter>
    </Provider>
  );
}

// authClient is mapped to src/frontend/__mocks__/authClient.ts via jest moduleNameMapper

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

  describe("contextual redirect prompt", () => {
    it("does not show the prompt when no ?returnTo param is present", () => {
      const { queryByRole } = renderPublicHomeAt("/");
      // The prompt is rendered as an alert role element
      expect(queryByRole("alert")).toBeNull();
    });

    it("shows 'Please sign in to continue' prompt when ?returnTo=/translate/ABC is present", () => {
      const { getByRole } = renderPublicHomeAt("/?returnTo=/translate/ABC");
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
    });

    it("shows the prompt when ?returnTo=https://evil.com is present but does not render the URL in DOM", () => {
      const { getByRole, queryByText } = renderPublicHomeAt("/?returnTo=https://evil.com");
      // Prompt must appear (presence detection, not value rendering)
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
      // The evil URL must not appear anywhere in the DOM
      expect(queryByText(/evil\.com/i)).toBeNull();
    });

    it("clears stale error state and shows prompt when redirected with ?returnTo present", () => {
      const { getByRole, queryByText } = renderPublicHomeAt("/?returnTo=/translate/ABC", {
        currentUser: { user: null, locale: "en", loaded: false, error: "Login failed." },
      });
      // Contextual prompt is shown
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
      // Stale error must be cleared (not rendered)
      expect(queryByText(/login failed/i)).toBeNull();
    });
  });
});
