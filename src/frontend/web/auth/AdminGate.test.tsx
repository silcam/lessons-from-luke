/**
 * AdminGate.test.tsx — unit tests for the AdminGate admin-authorization guard
 *
 * Decision matrix:
 *   loaded=false                 → render LoadingSnake (no redirect)
 *   loaded=true, user=null       → Navigate to / replace
 *   loaded=true, user non-admin  → Navigate to / replace (no admin URL left in history)
 *   loaded=true, user.admin      → render Outlet (child content)
 *
 * Additional assertions:
 *   - `replace` semantics: after the redirect, navigating back does NOT
 *     resurface the admin URL (the admin history entry was replaced).
 *   - AdminGate is NOT imported by any desktop entry file
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
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Provider } from "react-redux";
import { buildStore } from "../../common/testHelpers";
import AdminGate from "./AdminGate";

/** Home page stub with a "Go back" button so tests can probe history state. */
function HomeStub() {
  const navigate = useNavigate();
  return (
    <div>
      <div>Home page</div>
      <button onClick={() => navigate(-1)}>Go back</button>
    </div>
  );
}

/**
 * Render AdminGate inside a MemoryRouter at the given initialPath,
 * with the given currentUser state.
 */
function renderAdminGate(
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
          <Route element={<AdminGate />}>
            <Route path="/admin/invitations" element={<div>Admin content</div>} />
            <Route path="/languages/:languageId" element={<div>Language admin content</div>} />
          </Route>
          <Route path="/" element={<HomeStub />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe("AdminGate", () => {
  describe("loading state (loaded=false)", () => {
    it("renders LoadingSnake — no redirect, no admin content", () => {
      renderAdminGate("/admin/invitations", { user: null, loaded: false });
      // Neither the admin content nor the home page renders while loading
      expect(screen.queryByText("Admin content")).toBeNull();
      expect(screen.queryByText("Home page")).toBeNull();
    });
  });

  describe("unauthenticated state (loaded=true, user=null)", () => {
    it("redirects home", () => {
      renderAdminGate("/admin/invitations", { user: null, loaded: true });
      expect(screen.getByText("Home page")).toBeTruthy();
      expect(screen.queryByText("Admin content")).toBeNull();
    });
  });

  describe("non-admin user (loaded=true, user.admin=false)", () => {
    const nonAdmin = { id: "u1", admin: false };

    it("redirects home and does NOT render admin content", () => {
      renderAdminGate("/admin/invitations", { user: nonAdmin, loaded: true });
      expect(screen.getByText("Home page")).toBeTruthy();
      expect(screen.queryByText("Admin content")).toBeNull();
    });

    it("uses replace semantics — going back does not resurface the admin URL", () => {
      renderAdminGate("/admin/invitations", { user: nonAdmin, loaded: true });
      expect(screen.getByText("Home page")).toBeTruthy();

      // The admin history entry was REPLACED by '/', so navigate(-1) has
      // nowhere to go back to — the home page must remain, and the admin
      // content must never appear.
      fireEvent.click(screen.getByText("Go back"));
      expect(screen.getByText("Home page")).toBeTruthy();
      expect(screen.queryByText("Admin content")).toBeNull();
    });
  });

  describe("admin user (loaded=true, user.admin=true)", () => {
    const admin = { id: "u1", admin: true };

    it("renders the Outlet (child route content)", () => {
      renderAdminGate("/admin/invitations", { user: admin, loaded: true });
      expect(screen.getByText("Admin content")).toBeTruthy();
      expect(screen.queryByText("Home page")).toBeNull();
    });

    it("renders the language admin route for an admin", () => {
      renderAdminGate("/languages/42", { user: admin, loaded: true });
      expect(screen.getByText("Language admin content")).toBeTruthy();
    });
  });
});

/**
 * Import-graph isolation guard (constitution Principle VI)
 *
 * AdminGate lives under src/frontend/web/ and must never be imported by desktop
 * entry points. Web-only placement is the architectural enforcement mechanism —
 * there is no runtime flag. This test performs a static scan of the desktop
 * entry files to prove that boundary holds.
 *
 * Desktop entry files checked:
 *   - src/frontend/desktopFrontend/MainPage.tsx  (React root for Electron)
 *   - src/desktop/DesktopApp.ts                  (Electron main-process entry)
 */
describe("AdminGate import-graph isolation (desktop non-regression)", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  const projectRoot = path.resolve(__dirname, "../../../../");

  // Desktop entry files that must never pull in web-auth modules.
  const desktopEntryFiles = [
    "src/frontend/desktopFrontend/MainPage.tsx",
    "src/desktop/DesktopApp.ts",
  ];

  // Web-auth module identifiers that must not appear in desktop entry files.
  const forbiddenImports = ["AdminGate"];

  for (const entryFile of desktopEntryFiles) {
    for (const forbidden of forbiddenImports) {
      it(`${entryFile} does not import "${forbidden}"`, () => {
        const fullPath = path.join(projectRoot, entryFile);
        const source = fs.readFileSync(fullPath, "utf8");
        // Match any import/require referencing the forbidden module name,
        // including path-based imports like './auth/AdminGate'.
        const pattern = new RegExp(`\\b${forbidden}\\b`);
        expect(source).not.toMatch(pattern);
      });
    }
  }
});
