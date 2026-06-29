/**
 * AdminHome.test.tsx — unit tests for AdminHome with Revoke device access control
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Project Structure
 *       (frontend/web/home/AdminHome.tsx), §Presentation Design (UI Decisions:
 *       Web admin Revoke device access), §Accessibility Requirements
 *
 * Acceptance:
 *   - 'Revoke device access' button per user
 *   - Confirm dialog with destructive copy + Revoke + Cancel buttons
 *   - Success announces 'Revoked access (N credentials removed)' via aria-live
 *   - Error shows error in live region
 *   - yarn typecheck passes
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

// authClient is mapped to src/frontend/__mocks__/authClient.ts via jest moduleNameMapper
const { authClient } = require("../../web/auth/authClient") as {
  authClient: { getSession: jest.Mock; signIn: { email: jest.Mock }; signOut: jest.Mock };
};

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import AdminHome from "./AdminHome";

// jsdom does not implement HTMLDialogElement.showModal() or .close(), so the
// <dialog open> attribute is never set, making the element invisible to
// testing-library queries.  Polyfill both methods to toggle the `open`
// attribute, which is how non-modal dialogs become visible in the DOM.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  }
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

const adminUser = { user: { id: "admin-1", admin: true }, locale: "en", loaded: true, error: null };

const sampleUsers = [
  { id: "user-1", email: "alice@example.com", name: "Alice", admin: false },
  { id: "user-2", email: "bob@example.com", name: "Bob", admin: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  authClient.signOut.mockResolvedValue({ data: null, error: null });
  // Default: users list loads successfully
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => sampleUsers,
  });
});

describe("AdminHome — users list", () => {
  it("shows a Revoke device access button for each user after loading", async () => {
    const { findAllByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const buttons = await findAllByText("Revoke device access");
    expect(buttons).toHaveLength(sampleUsers.length);
  });

  it("fetches the user list from GET /api/admin/users on mount", async () => {
    renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("shows loading state while users are fetching", async () => {
    // Delay the fetch to observe loading state
    let resolveUsers!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveUsers = resolve;
      })
    );

    const { getByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    expect(getByText("Loading users…")).toBeTruthy();

    // Resolve to avoid leaking async
    await act(async () => {
      resolveUsers({ ok: true, status: 200, json: async () => sampleUsers });
    });
  });

  it("shows error state when user list fails to load", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const { findByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    await findByText("Couldn't load users. Please try again.");
  });
});

describe("AdminHome — Revoke confirm dialog", () => {
  it("opens a confirm dialog when Revoke device access is clicked", async () => {
    const { findAllByText, findByRole } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    // Dialog should be open with destructive copy
    const dialog = await findByRole("dialog");
    expect(dialog).toBeTruthy();
  });

  it("dialog contains destructive copy mentioning the user", async () => {
    const { findAllByText, findByRole } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    const dialog = await findByRole("dialog");
    expect(dialog.textContent).toContain("Alice");
    expect(dialog.textContent).toContain("sign them out of all connected devices");
  });

  it("dialog has a Revoke button and a Cancel button", async () => {
    const { findAllByText, findByRole, getByRole } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    await findByRole("dialog");
    expect(getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("closes dialog on Cancel without calling the API", async () => {
    const { findAllByText, findByRole, queryByRole } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    const dialog = await findByRole("dialog");

    // Clear mocks so we can assert no revoke fetch is made
    mockFetch.mockClear();

    // Click Cancel
    const cancelButton = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel"
    );
    await act(async () => {
      if (cancelButton) fireEvent.click(cancelButton);
    });

    // Dialog should be closed (no longer in the DOM as open)
    expect(queryByRole("dialog")).toBeNull();

    // No revoke-sessions call was made
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("revoke-sessions"),
      expect.anything()
    );
  });

  it("calls POST /api/admin/users/:userId/revoke-sessions on Revoke confirm", async () => {
    mockFetch
      .mockResolvedValueOnce({
        // GET /api/admin/users
        ok: true,
        status: 200,
        json: async () => sampleUsers,
      })
      .mockResolvedValueOnce({
        // POST revoke-sessions
        ok: true,
        status: 200,
        json: async () => ({ success: true, revokedCount: 2 }),
      });

    const { findAllByText, findByRole } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    const dialog = await findByRole("dialog");
    const revokeBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Revoke"
    );

    await act(async () => {
      if (revokeBtn) fireEvent.click(revokeBtn);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/users/user-1/revoke-sessions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("announces success via aria-live region after revoke", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleUsers,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, revokedCount: 2 }),
      });

    const { findAllByText, findByRole, findByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    const dialog = await findByRole("dialog");
    const revokeBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Revoke"
    );

    await act(async () => {
      if (revokeBtn) fireEvent.click(revokeBtn);
    });

    await findByText(/Revoked access \(2 credentials removed\)/);
  });

  it("shows error in live region when revoke fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleUsers,
      })
      .mockRejectedValueOnce(new Error("Network failure"));

    const { findAllByText, findByRole, findByText } = renderWithProviders(<AdminHome />, {
      syncState: defaultSyncState,
      currentUser: adminUser,
    });

    const [firstButton] = await findAllByText("Revoke device access");
    await act(async () => {
      fireEvent.click(firstButton);
    });

    const dialog = await findByRole("dialog");
    const revokeBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Revoke"
    );

    await act(async () => {
      if (revokeBtn) fireEvent.click(revokeBtn);
    });

    await findByText("Failed to revoke sessions. Please try again.");
  });
});
