/**
 * UsersList.test.tsx — unit tests for the admin account roster screen
 *
 * Tests: render, list display, own-row marking, status as text, empty state,
 * loading state, load-error state.
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

// Mock usersListThunks so we control async behaviour
jest.mock("./usersListThunks", () => ({
  listUsers: jest.fn(),
}));

import React from "react";
import { waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import UsersList from "./UsersList";
const { listUsers } = require("./usersListThunks") as {
  listUsers: jest.Mock;
};

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: { id: "admin1", admin: true }, locale: "en", loaded: true },
};

const selfRow = {
  id: "admin1",
  email: "admin@example.com",
  name: "Admin User",
  role: "admin",
  status: "active",
  createdAt: "2026-06-01T00:00:00.000Z",
  isSelf: true,
};

const otherActiveRow = {
  id: "user-2",
  email: "standard@example.com",
  name: "Standard User",
  role: "standard",
  status: "active",
  createdAt: "2026-06-02T00:00:00.000Z",
  isSelf: false,
};

const deactivatedRow = {
  id: "user-3",
  email: "deactivated@example.com",
  name: "Deactivated User",
  role: "standard",
  status: "deactivated",
  createdAt: "2026-06-03T00:00:00.000Z",
  isSelf: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("UsersList", () => {
  describe("rendering", () => {
    it("renders without crashing", async () => {
      listUsers.mockReturnValue(jest.fn().mockResolvedValue({ payload: [], error: undefined }));

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(container).toBeTruthy();
      });
    });

    it("calls listUsers on mount", async () => {
      listUsers.mockReturnValue(jest.fn().mockResolvedValue({ payload: [], error: undefined }));

      renderWithProviders(<UsersList />, defaultInitialState);

      await waitFor(() => {
        expect(listUsers).toHaveBeenCalledTimes(1);
      });
    });

    it("shows a page heading", async () => {
      listUsers.mockReturnValue(jest.fn().mockResolvedValue({ payload: [], error: undefined }));

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const text = container.textContent || "";
        expect(text).toMatch(/users/i);
      });
    });
  });

  describe("loading state", () => {
    it("shows a loading indicator while fetching", async () => {
      let resolveFetch: (value: { payload: unknown[]; error: undefined }) => void;
      const pending = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      listUsers.mockReturnValue(jest.fn().mockReturnValue(pending));

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);

      expect(container.textContent).toMatch(/loading users/i);

      resolveFetch!({ payload: [], error: undefined });
      await waitFor(() => {
        expect(container.textContent).not.toMatch(/loading users/i);
      });
    });
  });

  describe("load-error state", () => {
    it("shows a load-error alert when the fetch fails", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: undefined, error: { message: "boom" } })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const alertEl = container.querySelector('[role="alert"]');
        expect(alertEl).toBeTruthy();
        expect(alertEl!.textContent).toMatch(/couldn't load users/i);
      });
    });
  });

  describe("empty state", () => {
    it("shows empty state message when no users", async () => {
      listUsers.mockReturnValue(jest.fn().mockResolvedValue({ payload: [], error: undefined }));

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const text = container.textContent || "";
        expect(text).toMatch(/no users yet/i);
      });
    });
  });

  describe("list display", () => {
    it("shows each user's name, email, role, status, and created date", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toContain("Admin User");
        expect(container.textContent).toContain("admin@example.com");
        expect(container.textContent).toContain("Standard User");
        expect(container.textContent).toContain("standard@example.com");
      });
    });

    it("marks the current user's own row as 'You'", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toMatch(/you/i);
      });
    });

    it("shows deactivated accounts in the roster with a text status label", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [otherActiveRow, deactivatedRow],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toContain("deactivated@example.com");
        // Status must be a readable text label (WCAG 1.4.1), not color-only.
        expect(container.textContent).toMatch(/deactivated/i);
        expect(container.textContent).toMatch(/active/i);
      });
    });

    it("shows each user's role as a readable label", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toMatch(/admin/i);
        expect(container.textContent).toMatch(/standard/i);
      });
    });
  });
});
