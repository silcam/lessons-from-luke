/**
 * AuthGate.test.tsx — unit tests for the AuthGate route guard
 *
 * Decision matrix:
 *   loaded=false               → render LoadingSnake (no redirect)
 *   loaded=true, user=null     → Navigate to /?returnTo=<encoded-path> replace
 *   loaded=true, user!=null    → render Outlet (child content)
 *
 * Additional assertions:
 *   - Public paths do NOT trigger a redirect (no redirect loop)
 *   - AuthGate is NOT imported by any desktop entry file
 *     (structural isolation — web-only placement is the architectural enforcement,
 *     not a runtime flag; see constitution Principle VI)
 */

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
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { buildStore } from "../../common/testHelpers";
import AuthGate from "./AuthGate";

/**
 * Render AuthGate inside a MemoryRouter at the given initialPath,
 * with the given currentUser state.
 */
function renderAuthGate(
  initialPath: string,
  currentUser: { user: { id: string; admin: boolean } | null; loaded: boolean }
) {
  const store = buildStore({ currentUser: { ...currentUser, locale: "en", error: null } });

  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/translate/:code" element={<div>Gated content</div>} />
            <Route path="/lessons/:id" element={<div>Lesson content</div>} />
          </Route>
          <Route path="/" element={<div>Sign-in page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe("AuthGate", () => {
  describe("loading state (loaded=false)", () => {
    it("renders LoadingSnake when auth state is not yet loaded", () => {
      renderAuthGate("/translate/ABC123", { user: null, loaded: false });
      // LoadingSnake renders many 'o' characters inside bouncy spans
      // It does NOT render gated content or trigger a redirect
      expect(screen.queryByText("Gated content")).toBeNull();
      expect(screen.queryByText("Sign-in page")).toBeNull();
    });

    it("does NOT redirect to sign-in when still loading", () => {
      const { container } = renderAuthGate("/translate/ABC123", { user: null, loaded: false });
      // No sign-in page rendered
      expect(container.textContent).not.toMatch(/sign-in page/i);
    });
  });

  describe("unauthenticated state (loaded=true, user=null)", () => {
    it("redirects to / when user is not logged in", () => {
      renderAuthGate("/translate/ABC123", { user: null, loaded: true });
      expect(screen.getByText("Sign-in page")).toBeTruthy();
    });

    it("does NOT render the gated content when unauthenticated", () => {
      renderAuthGate("/translate/ABC123", { user: null, loaded: true });
      expect(screen.queryByText("Gated content")).toBeNull();
    });

    it("includes returnTo with the encoded original path in the redirect URL", () => {
      // Capture the MemoryRouter's in-memory location (not window.location)
      // by reading useLocation() from within the router context.
      let capturedSearch = "";
      function CaptureSearch() {
        const location = useLocation();
        capturedSearch = location.search;
        return <div>Sign-in page</div>;
      }

      const store = buildStore({
        currentUser: { user: null, loaded: true, locale: "en", error: null },
      });

      render(
        <Provider store={store}>
          <MemoryRouter
            initialEntries={["/translate/ABC123"]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route element={<AuthGate />}>
                <Route path="/translate/:code" element={<div>Gated content</div>} />
              </Route>
              <Route path="/" element={<CaptureSearch />} />
            </Routes>
          </MemoryRouter>
        </Provider>
      );

      // After redirect the sign-in page should be shown
      expect(screen.getByText("Sign-in page")).toBeTruthy();
      // The redirect URL must carry ?returnTo=%2Ftranslate%2FABC123
      expect(capturedSearch).toBe("?returnTo=%2Ftranslate%2FABC123");
    });
  });

  describe("authenticated state (loaded=true, user!=null)", () => {
    const authenticatedUser = { id: "u1", admin: false };

    it("renders the Outlet (child route content) when authenticated", () => {
      renderAuthGate("/translate/ABC123", { user: authenticatedUser, loaded: true });
      expect(screen.getByText("Gated content")).toBeTruthy();
    });

    it("does NOT redirect to sign-in when authenticated", () => {
      renderAuthGate("/translate/ABC123", { user: authenticatedUser, loaded: true });
      expect(screen.queryByText("Sign-in page")).toBeNull();
    });

    it("renders lesson content for an authenticated user", () => {
      renderAuthGate("/lessons/42", { user: authenticatedUser, loaded: true });
      expect(screen.getByText("Lesson content")).toBeTruthy();
    });
  });
});

/**
 * Import-graph isolation guard (constitution Principle VI)
 *
 * AuthGate lives under src/frontend/web/ and must never be imported by desktop
 * entry points. Web-only placement is the architectural enforcement mechanism —
 * there is no runtime flag. This test performs a static scan of the desktop
 * entry files to prove that boundary holds.
 *
 * Desktop entry files checked:
 *   - src/frontend/desktopFrontend/MainPage.tsx  (React root for Electron)
 *   - src/desktop/DesktopApp.ts                  (Electron main-process entry)
 */
describe("AuthGate import-graph isolation (desktop non-regression)", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  const projectRoot = path.resolve(__dirname, "../../../../");

  // Desktop entry files that must never pull in web-auth modules.
  const desktopEntryFiles = [
    "src/frontend/desktopFrontend/MainPage.tsx",
    "src/desktop/DesktopApp.ts",
  ];

  // Web-auth module identifiers that must not appear in desktop entry files.
  const forbiddenImports = ["AuthGate"];

  for (const entryFile of desktopEntryFiles) {
    for (const forbidden of forbiddenImports) {
      it(`${entryFile} does not import "${forbidden}"`, () => {
        const fullPath = path.join(projectRoot, entryFile);
        const source = fs.readFileSync(fullPath, "utf8");
        // Match any import/require referencing the forbidden module name,
        // including path-based imports like './auth/AuthGate'.
        const pattern = new RegExp(`\\b${forbidden}\\b`);
        expect(source).not.toMatch(pattern);
      });
    }
  }
});
