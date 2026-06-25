/**
 * MainRouter.test.tsx — post-login return-to navigation tests
 *
 * Tests that MainRouter navigates to safeReturnTo(returnTo) when an in-session
 * login occurs (loaded was already true, user was null, user is now set).
 *
 * The "initial resolution" edge (loaded: false → true) must NOT trigger navigation.
 *
 * All tests use the real Redux reducer via buildStore and dispatch real slice
 * actions — no mock 'login' action.
 */

// Break networkSlice → appState → networkSlice circular dep
jest.mock("../common/state/networkSlice", () => ({
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

// Mock loadCurrentUser so it does NOT trigger async auth calls
jest.mock("./auth/authThunks", () => ({
  loadCurrentUser: () => () => Promise.resolve(),
  pushLogin: jest.fn(),
  pushLogout: jest.fn(),
}));

// Mock useNavigate so we can observe calls
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// Mock useClearBannersOnNavigation (uses hooks that may depend on store shape)
jest.mock("../common/banners/useClearBannersOnNavigation", () => ({
  useClearBannersOnNavigation: () => {},
}));

import React from "react";
import { act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { buildStore } from "../common/testHelpers";
import currentUserSlice from "../common/state/currentUserSlice";
import MainRouter from "./MainRouter";

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Render MainRouter at the given initialPath, with the given preloaded
 * currentUser state. Returns the store so callers can dispatch actions.
 */
function renderMainRouter(
  initialPath: string,
  preloadedCurrentUser: { user: { id: string; admin: boolean } | null; loaded: boolean }
) {
  const store = buildStore({
    currentUser: { ...preloadedCurrentUser, locale: "en", error: null },
  });

  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <MainRouter />
      </MemoryRouter>
    </Provider>
  );

  return store;
}

describe("MainRouter post-login return-to navigation", () => {
  describe("initial resolution edge (loaded: false → true) — must NOT navigate", () => {
    it("does not navigate when loadCurrentUser resolves with a user (cold signed-in mount)", async () => {
      // Start with loaded=false (auth state unknown), user=null
      const store = renderMainRouter("/", { user: null, loaded: false });

      // Simulate loadCurrentUser completing and finding a logged-in user
      // This is the initial resolution edge: prevLoaded===false → loaded becomes true
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // No navigation should occur — the user is simply already signed in on load
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("does not navigate when cold mount has ?returnTo=/translate/x and user resolves via loadCurrentUser", async () => {
      // Deep link: visitor has ?returnTo= but is loading for the first time
      const store = renderMainRouter("/?returnTo=%2Ftranslate%2FABC123", {
        user: null,
        loaded: false,
      });

      // Simulate loadCurrentUser completing (loaded: false → true)
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // Must NOT navigate — this is initial resolution, not an in-session login
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("in-session login edge (loaded already true, user: null → user set) — MUST navigate", () => {
    it("navigates to safeReturnTo(returnTo) when ?returnTo=/translate/ABC123 and user is set in-session", async () => {
      // Start already loaded, user=null (gate showed sign-in page)
      const store = renderMainRouter("/?returnTo=%2Ftranslate%2FABC123", {
        user: null,
        loaded: true,
      });

      // In-session login: pushLogin fires setUser (loaded stays true, user goes null→set)
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // Should navigate to the sanitized returnTo path
      expect(mockNavigate).toHaveBeenCalledWith("/translate/ABC123", { replace: true });
    });

    it("navigates to '/' when ?returnTo points to an external URL (sanitizer honored)", async () => {
      const store = renderMainRouter("/?returnTo=" + encodeURIComponent("https://evil.com/steal"), {
        user: null,
        loaded: true,
      });

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // safeReturnTo should reject the external URL and fall back to '/'
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });

    it("navigates to '/' when no ?returnTo param is present", async () => {
      // Loaded, no user, no returnTo — user signs in directly from home page
      const store = renderMainRouter("/", { user: null, loaded: true });

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // With no returnTo, safeReturnTo('') or navigation to '/' is the expected fallback
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });

    it("returnTo survives a failed login attempt and is consumed on subsequent success", async () => {
      const store = renderMainRouter("/?returnTo=%2Ftranslate%2FABC123", {
        user: null,
        loaded: true,
      });

      // First attempt: login fails — setError is dispatched, user stays null
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setError("Invalid credentials"));
      });

      // No navigation on error
      expect(mockNavigate).not.toHaveBeenCalled();

      // Second attempt: login succeeds — setUser is dispatched
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // Now navigation should happen with the returnTo still in the URL
      expect(mockNavigate).toHaveBeenCalledWith("/translate/ABC123", { replace: true });
    });
  });

  describe("no spurious re-navigation", () => {
    it("does not navigate again when a re-render occurs after successful login", async () => {
      const store = renderMainRouter("/?returnTo=%2Ftranslate%2FABC123", {
        user: null,
        loaded: true,
      });

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // navigate was called once
      expect(mockNavigate).toHaveBeenCalledTimes(1);

      // Dispatch another unrelated action — no second navigation
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setLocale("fr"));
      });

      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
  });
});
