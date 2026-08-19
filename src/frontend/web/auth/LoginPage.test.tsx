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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { renderWithProviders, buildStore, defaultSyncState } from "../../common/testHelpers";
import LoginPage from "./LoginPage";

/**
 * Render LoginPage at a specific URL path (to simulate ?returnTo query params).
 */
function renderLoginPageAt(path: string, initialState?: Record<string, unknown>) {
  const store = buildStore({
    syncState: defaultSyncState,
    currentUser: { user: null, locale: "en", loaded: true, error: null },
    ...initialState,
  });
  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <LoginPage />
      </MemoryRouter>
    </Provider>
  );
}

// authClient is mapped to src/frontend/__mocks__/authClient.ts via jest moduleNameMapper

const { authClient } = require("./authClient") as {
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

describe("LoginPage", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });
    expect(container).toBeTruthy();
  });

  it("shows the app title", () => {
    const { getByText } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });
    expect(getByText("Lessons from Luke")).toBeTruthy();
  });

  it("renders a login button", () => {
    const { getAllByText } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
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

    const { container, getByText } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true, error: null },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(getByText(/log.?in failed/i)).toBeTruthy();
  });

  it("calls authClient.signIn.email when login button is clicked", async () => {
    const { fireEvent, act } = require("@testing-library/react");

    const { container } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(authClient.signIn.email).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.any(String), password: expect.any(String) })
    );
    // No callbackURL: it would trigger a hard redirect that drops ?returnTo=.
    expect((authClient.signIn.email as jest.Mock).mock.calls[0][0]).not.toHaveProperty(
      "callbackURL"
    );
  });

  it("renders a 'Forgot password?' link that points to /forgot-password", () => {
    const { getByText } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });

    const link = getByText("Forgot password?");
    expect(link).toBeTruthy();
    expect(link.closest("a")?.getAttribute("href")).toBe("/forgot-password");
  });

  it("renders email and password inputs", () => {
    const { container } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });

    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not crash on successful login", async () => {
    const { fireEvent, act } = require("@testing-library/react");

    const { container } = renderWithProviders(<LoginPage />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: true },
    });

    const loginButton = container.querySelector("button");
    await act(async () => {
      fireEvent.click(loginButton!);
    });

    expect(container).toBeTruthy();
  });

  describe("security upgrade notice banner", () => {
    it("shows the notice in English and French with a mailto link", () => {
      const { getByText, getAllByText } = renderWithProviders(<LoginPage />, {
        syncState: defaultSyncState,
        currentUser: { user: null, locale: "en", loaded: true },
      });

      expect(getByText(/upgraded the security requirements/i)).toBeTruthy();
      expect(getByText(/renforcé les exigences de sécurité/i)).toBeTruthy();

      const links = getAllByText("chris_jackson@sil.org");
      expect(links.length).toBe(2);
      for (const link of links) {
        expect(link.closest("a")?.getAttribute("href")).toBe("mailto:chris_jackson@sil.org");
      }
    });

    it("is also shown when arriving via an auth-gate redirect (?returnTo present)", () => {
      const { getByText } = renderLoginPageAt("/login?returnTo=/translate/ABC");
      expect(getByText(/upgraded the security requirements/i)).toBeTruthy();
      expect(getByText(/renforcé les exigences de sécurité/i)).toBeTruthy();
    });
  });

  describe("contextual redirect prompt", () => {
    it("does not show the prompt when no ?returnTo param is present", () => {
      const { queryByRole } = renderLoginPageAt("/login");
      // The prompt is rendered as an alert role element
      expect(queryByRole("alert")).toBeNull();
    });

    it("shows 'Please sign in to continue' prompt when ?returnTo=/translate/ABC is present", () => {
      const { getByRole } = renderLoginPageAt("/login?returnTo=/translate/ABC");
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
    });

    it("shows the prompt when ?returnTo=https://evil.com is present but does not render the URL in DOM", () => {
      const { getByRole, queryByText } = renderLoginPageAt("/login?returnTo=https://evil.com");
      // Prompt must appear (presence detection, not value rendering)
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
      // The evil URL must not appear anywhere in the DOM
      expect(queryByText(/evil\.com/i)).toBeNull();
    });

    it("clears stale error state and shows prompt when redirected with ?returnTo present", () => {
      const { getByRole, queryByText } = renderLoginPageAt("/login?returnTo=/translate/ABC", {
        currentUser: { user: null, locale: "en", loaded: true, error: "Login failed." },
      });
      // Contextual prompt is shown
      const alert = getByRole("alert");
      expect(alert.textContent).toMatch(/please sign in to continue/i);
      // Stale error must be cleared (not rendered)
      expect(queryByText(/login failed/i)).toBeNull();
    });

    it("shows the login-failed alert for a NEW failed login after mount, even with ?returnTo present", async () => {
      const { fireEvent, act } = require("@testing-library/react");
      authClient.signIn.email.mockResolvedValue({
        data: null,
        error: { status: 401, message: "Invalid credentials" },
      });

      const { container, getByText } = renderLoginPageAt("/login?returnTo=/translate/ABC");

      const loginButton = container.querySelector("button");
      await act(async () => {
        fireEvent.click(loginButton!);
      });

      expect(getByText(/log.?in failed/i)).toBeTruthy();
    });
  });

  describe("three-state render matrix", () => {
    /**
     * Render LoginPage at /login (optionally with a query string appended by
     * the caller) inside a Routes tree that also registers marker routes for
     * "/" and "/translate/:code", so Navigate destinations can be asserted.
     */
    function renderLoginPageMatrix(path: string, initialState?: Record<string, unknown>) {
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
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>Home marker</div>} />
              <Route path="/translate/:code" element={<div>Translate marker</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      );
    }

    it("renders LoadingSnake (not the login form) when currentUser is not loaded", () => {
      const { queryByText } = renderLoginPageMatrix("/login", {
        currentUser: { user: null, locale: "en", loaded: false, error: null },
      });
      expect(queryByText("Log In")).toBeNull();
      expect(queryByText("Lessons from Luke")).toBeNull();
    });

    it("navigates to the translate marker route when authenticated with a safe returnTo", () => {
      const { getByText } = renderLoginPageMatrix("/login?returnTo=%2Ftranslate%2FABC123", {
        currentUser: { user: { id: "u1", admin: false }, locale: "en", loaded: true, error: null },
      });
      expect(getByText("Translate marker")).toBeTruthy();
    });

    it("navigates to the home marker route when authenticated with an unsafe returnTo", () => {
      const { getByText } = renderLoginPageMatrix(
        "/login?returnTo=" + encodeURIComponent("https://evil.com"),
        {
          currentUser: {
            user: { id: "u1", admin: false },
            locale: "en",
            loaded: true,
            error: null,
          },
        }
      );
      expect(getByText("Home marker")).toBeTruthy();
    });

    it("navigates to the home marker route when authenticated with no returnTo", () => {
      const { getByText } = renderLoginPageMatrix("/login", {
        currentUser: { user: { id: "u1", admin: false }, locale: "en", loaded: true, error: null },
      });
      expect(getByText("Home marker")).toBeTruthy();
    });

    it("navigates to the home marker route (not a loop) when returnTo is self-referential (/login)", () => {
      const { getByText } = renderLoginPageMatrix("/login?returnTo=%2Flogin", {
        currentUser: { user: { id: "u1", admin: false }, locale: "en", loaded: true, error: null },
      });
      expect(getByText("Home marker")).toBeTruthy();
    });
  });
});
