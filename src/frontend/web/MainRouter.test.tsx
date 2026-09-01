/**
 * MainRouter.test.tsx
 *
 * MainRouter wires public routes (login, forgot/reset-password, invitation
 * redemption) alongside a gated home route. Post-login return-to navigation
 * now lives in LoginPage (see LoginPage.test.tsx) — these tests cover only
 * MainRouter's own routing/gating responsibilities:
 *   - the auth-loading state never flashes the login form
 *   - anonymous visitors land on the login form
 *   - loaded admin/non-admin users see the right home
 *   - /login renders directly, ungated
 *   - unknown paths redirect to / (then follow gating)
 *   - admin deep-links never flash the sign-in page while auth resolves
 *     (AdminGate regression coverage)
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

// Mock useClearBannersOnNavigation (uses hooks that may depend on store shape)
jest.mock("../common/banners/useClearBannersOnNavigation", () => ({
  useClearBannersOnNavigation: () => {},
}));

// Mock InvitationsList — the real component fetches invitations on mount.
jest.mock("./invitations/InvitationsList", () => ({
  __esModule: true,
  default: () => {
    const React = jest.requireActual("react");
    return React.createElement("div", null, "Invitations list page");
  },
}));

// Mock UsersPage — the real component fetches the user list on mount.
jest.mock("./users/UsersPage", () => ({
  __esModule: true,
  default: () => {
    const React = jest.requireActual("react");
    return React.createElement("div", null, "Users page");
  },
}));

// Mock DeviceLinkPage — the real component polls the pairing API on mount.
// Echo the current query string so tests can assert user_code survived routing.
jest.mock("./deviceLink/DeviceLinkPage", () => {
  const React = jest.requireActual("react");
  const { useLocation } = jest.requireActual("react-router-dom");
  function MockDeviceLinkPage() {
    const location = useLocation();
    return React.createElement("div", null, `Device link page ${location.search}`);
  }
  return { __esModule: true, default: MockDeviceLinkPage };
});

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { buildStore, mockGet, mockPost } from "../common/testHelpers";
import RequestContext from "../common/api/RequestContext";
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

describe("MainRouter", () => {
  describe("/ while auth state is loading", () => {
    it("shows the loading state and does not flash the login form", () => {
      renderMainRouter("/", { user: null, loaded: false });

      expect(screen.queryAllByText("Log In")).toHaveLength(0);
      // No login form fields either — pins the original "flash of login" bug.
      expect(screen.queryByPlaceholderText("Email")).toBeNull();
      expect(screen.queryByPlaceholderText("Password")).toBeNull();
    });
  });

  describe("/ anonymous and loaded", () => {
    it("redirects to /login?returnTo=%2F and renders the login form", () => {
      renderMainRouter("/", { user: null, loaded: true });

      expect(screen.getAllByText("Log In").length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });
  });

  describe("/ loaded and signed in", () => {
    it("renders AdminHome for a loaded admin user", () => {
      renderMainRouter("/", { user: { id: "u1", admin: true }, loaded: true });

      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    it("renders SignedInHome for a loaded non-admin user", () => {
      renderMainRouter("/", { user: { id: "u1", admin: false }, loaded: true });

      expect(screen.getByText("You're signed in.")).toBeTruthy();
    });
  });

  describe("/login", () => {
    it("renders the login form directly, without gating", () => {
      renderMainRouter("/login", { user: null, loaded: true });

      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });
  });

  describe("unknown path", () => {
    it("redirects to / and then follows gating (loading state, no login flash)", () => {
      renderMainRouter("/nonsense", { user: null, loaded: false });

      expect(screen.queryAllByText("Log In")).toHaveLength(0);
      expect(screen.queryByPlaceholderText("Email")).toBeNull();
    });

    it("redirects to / and renders the signed-in home once loaded", () => {
      renderMainRouter("/nonsense", { user: { id: "u1", admin: false }, loaded: true });

      expect(screen.getByText("You're signed in.")).toBeTruthy();
    });
  });

  describe("/ with web auth enforcement off (ENFORCE_WEB_AUTH disabled)", () => {
    // With enforcement off, AuthGate passes straight through to GatedHome,
    // so GatedHome must handle loading/anonymous states itself — an anonymous
    // visitor to "/" must land on the login form, never a white screen.
    afterEach(() => {
      document.head.innerHTML = "";
    });

    function disableEnforcement() {
      document.head.innerHTML = '<meta name="enforce-web-auth" content="0">';
    }

    it("anonymous and loaded: lands on the login form (no white screen)", () => {
      disableEnforcement();
      renderMainRouter("/", { user: null, loaded: true });

      expect(screen.getAllByText("Log In").length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });

    it("auth state still loading: shows the loading state, not the login form", () => {
      disableEnforcement();
      renderMainRouter("/", { user: null, loaded: false });

      // Positive assertion: LoadingSnake renders its bouncy "o" spans.
      expect(screen.getAllByText("o").length).toBeGreaterThan(0);
      expect(screen.queryByPlaceholderText("Email")).toBeNull();
      expect(screen.queryByPlaceholderText("Password")).toBeNull();
    });

    it("signed-in admin: renders AdminHome (as before)", () => {
      disableEnforcement();
      renderMainRouter("/", { user: { id: "u1", admin: true }, loaded: true });

      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    it("signed-in non-admin: renders SignedInHome (as before)", () => {
      disableEnforcement();
      renderMainRouter("/", { user: { id: "u1", admin: false }, loaded: true });

      expect(screen.getByText("You're signed in.")).toBeTruthy();
    });
  });

  describe("/link route returnTo round-trip (US1.8)", () => {
    it("redirects an unauthenticated /link visit to /login with returnTo encoding the full path+search", () => {
      // Step 1+2 of the round-trip: AuthGate sends the anonymous visitor to
      // the login page, preserving path AND search so user_code survives.
      renderMainRouter("/link?user_code=WDJB-MJHT", { user: null, loaded: true });
      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });

    it("navigates to /link?user_code=WDJB-MJHT after login when returnTo encodes the full path+search", async () => {
      // Simulates the sign-in round-trip:
      //   1. Unauthenticated visitor opens /link?user_code=WDJB-MJHT
      //   2. AuthGate redirects to /login?returnTo=%2Flink%3Fuser_code%3DWDJB-MJHT
      //   3. User signs in — currentUser.setUser fires
      //   4. LoginPage's <Navigate> sends the user to safeReturnTo(returnTo)
      // The user_code MUST survive the round-trip so DeviceLinkPage can auto-claim.
      const store = renderMainRouter("/login?returnTo=%2Flink%3Fuser_code%3DWDJB-MJHT", {
        user: null,
        loaded: true,
      });

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: false }));
      });

      // safeReturnTo('/link?user_code=WDJB-MJHT') must pass validation and
      // return the full path+search — the user_code query param is NOT in a
      // path segment, so the authority-confusion guard leaves it intact.
      expect(screen.getByText("Device link page ?user_code=WDJB-MJHT")).toBeTruthy();
    });
  });

  describe("admin deep-link cold load — no sign-in flash (AdminGate regression)", () => {
    /**
     * Render MainRouter with a RequestContext provider (AdminHome's child
     * boxes call useLoad on mount, which reads the request context).
     */
    function renderMainRouterWithApi(
      initialPath: string,
      preloadedCurrentUser: { user: { id: string; admin: boolean } | null; loaded: boolean }
    ) {
      const store = buildStore({
        currentUser: { ...preloadedCurrentUser, locale: "en", error: null },
      });

      const utils = render(
        <Provider store={store}>
          <RequestContext.Provider value={{ get: mockGet, post: mockPost }}>
            <MemoryRouter
              initialEntries={[initialPath]}
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <MainRouter />
            </MemoryRouter>
          </RequestContext.Provider>
        </Provider>
      );

      return { store, ...utils };
    }

    it("cold-loading /admin/invitations never flashes the sign-in page; admin content appears once resolved", async () => {
      // Cold load: auth state unknown — the admin route must be REGISTERED
      // (not conditionally omitted), so the catch-all sign-in page never renders.
      const { store } = renderMainRouterWithApi("/admin/invitations", {
        user: null,
        loaded: false,
      });

      // No sign-in heading ("Log In") flash while auth state resolves
      expect(screen.queryAllByText("Log In")).toHaveLength(0);
      expect(screen.queryByText("Invitations list page")).toBeNull();

      // Auth resolves to an admin user (loaded: false → true)
      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: true }));
      });

      // Admin content renders; still no sign-in page
      expect(screen.getByText("Invitations list page")).toBeTruthy();
      expect(screen.queryAllByText("Log In")).toHaveLength(0);
    });

    it("cold-loading /admin/users never flashes the sign-in page; the Users page appears once resolved", async () => {
      const { store } = renderMainRouterWithApi("/admin/users", {
        user: null,
        loaded: false,
      });

      expect(screen.queryAllByText("Log In")).toHaveLength(0);
      expect(screen.queryByText("Users page")).toBeNull();

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: true }));
      });

      expect(screen.getByText("Users page")).toBeTruthy();
      expect(screen.queryAllByText("Log In")).toHaveLength(0);
    });

    it("redirects a loaded non-admin visiting /admin/users home", () => {
      renderMainRouterWithApi("/admin/users", {
        user: { id: "u1", admin: false },
        loaded: true,
      });

      // AdminGate Navigates to /, where GatedHome renders SignedInHome
      expect(screen.queryByText("Users page")).toBeNull();
      expect(screen.getByText("You're signed in.")).toBeTruthy();
    });

    it("cold-loading /languages/42 never flashes the sign-in page; AdminHome appears once resolved", async () => {
      const { store } = renderMainRouterWithApi("/languages/42", {
        user: null,
        loaded: false,
      });

      expect(screen.queryAllByText("Log In")).toHaveLength(0);

      await act(async () => {
        store.dispatch(currentUserSlice.actions.setUser({ id: "u1", admin: true }));
      });

      // AdminHome (the /languages/:languageId element) renders its header bar
      expect(screen.getByText("Log Out")).toBeTruthy();
      expect(screen.queryAllByText("Log In")).toHaveLength(0);
    });
  });
});
