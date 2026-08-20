/**
 * AdminHome.test.tsx — unit tests for the admin home page header
 *
 * The Users management UI moved to its own page at /admin/users (see
 * src/frontend/web/users/UsersPage.test.tsx). AdminHome now only links to it
 * from the header, next to the Invitations link.
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
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import AdminHome from "./AdminHome";

const adminUser = { user: { id: "admin-1", admin: true }, locale: "en", loaded: true, error: null };

describe("AdminHome — header", () => {
  it("shows a Users link pointing at /admin/users", () => {
    const { getByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const usersButton = getByText("Users");
    const link = usersButton.closest("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("/admin/users");
  });

  it("shows an Invitations link pointing at /admin/invitations", () => {
    const { getByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const invitationsButton = getByText("Invitations");
    const link = invitationsButton.closest("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("/admin/invitations");
  });

  it("does not render the Users section inline", () => {
    const { queryByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    expect(queryByText("Loading users…")).toBeNull();
    expect(queryByText("Revoke device access")).toBeNull();
  });
});
