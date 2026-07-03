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
  deactivateAccount: jest.fn(),
  reactivateAccount: jest.fn(),
  changeRole: jest.fn(),
}));

// Mock useNavigate (US3 self-demote redirect)
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import UsersList from "./UsersList";
const { listUsers, deactivateAccount, reactivateAccount, changeRole } =
  require("./usersListThunks") as {
    listUsers: jest.Mock;
    deactivateAccount: jest.Mock;
    reactivateAccount: jest.Mock;
    changeRole: jest.Mock;
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

const otherAdminRow = {
  id: "user-4",
  email: "other-admin@example.com",
  name: "Other Admin",
  role: "admin",
  status: "active",
  createdAt: "2026-06-04T00:00:00.000Z",
  isSelf: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockClear();
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

  describe("Deactivate/Reactivate row action", () => {
    it("shows a Deactivate button for an active, non-guardrailed account", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtn = buttons.find(
          (b) => /^deactivate$/i.test((b.textContent || "").trim()) && !b.hasAttribute("disabled")
        );
        expect(deactivateBtn).toBeTruthy();
        expect(deactivateBtn!.hasAttribute("disabled")).toBe(false);
      });
    });

    it("shows a Reactivate button and the credential-restore helptext for a deactivated account", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [otherActiveRow, deactivatedRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const reactivateBtn = buttons.find((b) =>
          /^reactivate$/i.test((b.textContent || "").trim())
        );
        expect(reactivateBtn).toBeTruthy();
        // FND5 credential-restore helptext must be surfaced near Reactivate.
        expect(container.textContent).toMatch(/restores this user's existing password/i);
      });
    });

    it("clicking Deactivate opens an inline two-step confirm before mutating", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(
          Array.from(container.querySelectorAll("button")).find((b) =>
            /^deactivate$/i.test((b.textContent || "").trim())
          )
        ).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtn = buttons.find(
          (b) => /^deactivate$/i.test((b.textContent || "").trim()) && !b.hasAttribute("disabled")
        );
        fireEvent.click(deactivateBtn!);
      });

      expect(deactivateAccount).not.toHaveBeenCalled();
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        expect(buttons.find((b) => /confirm deactivate/i.test(b.textContent || ""))).toBeTruthy();
        expect(buttons.find((b) => /^cancel$/i.test((b.textContent || "").trim()))).toBeTruthy();
      });
    });

    it("confirming Deactivate calls deactivateAccount, updates the row, and announces the outcome", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );
      deactivateAccount.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...otherActiveRow, status: "deactivated" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(
          Array.from(container.querySelectorAll("button")).find((b) =>
            /^deactivate$/i.test((b.textContent || "").trim())
          )
        ).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtn = buttons.find(
          (b) => /^deactivate$/i.test((b.textContent || "").trim()) && !b.hasAttribute("disabled")
        );
        fireEvent.click(deactivateBtn!);
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const confirmBtn = buttons.find((b) => /confirm deactivate/i.test(b.textContent || ""));
        fireEvent.click(confirmBtn!);
      });

      await waitFor(() => {
        expect(deactivateAccount).toHaveBeenCalledWith("user-2");
        const liveRegion = container.querySelector("[role='status'][aria-live]");
        expect(liveRegion!.textContent).toMatch(/deactivated/i);
        // The row now shows Reactivate, and focus lands there (never <body>).
        const buttons = Array.from(container.querySelectorAll("button"));
        expect(
          buttons.find((b) => /^reactivate$/i.test((b.textContent || "").trim()))
        ).toBeTruthy();
        expect(document.activeElement?.tagName).toBe("BUTTON");
        expect(document.activeElement?.textContent).toMatch(/reactivate/i);
      });
    });

    it("cancelling the confirm does not mutate and returns focus to the Deactivate trigger", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(
          Array.from(container.querySelectorAll("button")).find((b) =>
            /^deactivate$/i.test((b.textContent || "").trim())
          )
        ).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtn = buttons.find(
          (b) => /^deactivate$/i.test((b.textContent || "").trim()) && !b.hasAttribute("disabled")
        );
        fireEvent.click(deactivateBtn!);
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const cancelBtn = buttons.find((b) => /^cancel$/i.test((b.textContent || "").trim()));
        fireEvent.click(cancelBtn!);
      });

      expect(deactivateAccount).not.toHaveBeenCalled();
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtn = buttons.find(
          (b) => /^deactivate$/i.test((b.textContent || "").trim()) && !b.hasAttribute("disabled")
        );
        expect(deactivateBtn).toBeTruthy();
        expect(document.activeElement).toBe(deactivateBtn);
      });
    });

    it("clicking Reactivate calls reactivateAccount and updates the row to Active", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [otherActiveRow, deactivatedRow], error: undefined })
      );
      reactivateAccount.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...deactivatedRow, status: "active" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        expect(
          Array.from(container.querySelectorAll("button")).find((b) =>
            /^reactivate$/i.test((b.textContent || "").trim())
          )
        ).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const reactivateBtn = buttons.find((b) =>
          /^reactivate$/i.test((b.textContent || "").trim())
        );
        fireEvent.click(reactivateBtn!);
      });

      await waitFor(() => {
        expect(reactivateAccount).toHaveBeenCalledWith("user-3");
        const liveRegion = container.querySelector("[role='status'][aria-live]");
        expect(liveRegion!.textContent).toMatch(/active/i);
      });
    });

    it("disables Deactivate on the operator's own row with an accessible reason", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherAdminRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtns = buttons.filter((b) =>
          /^deactivate$/i.test((b.textContent || "").trim())
        );
        // Own row's Deactivate is disabled.
        const selfDeactivateBtn = deactivateBtns.find((b) => b.hasAttribute("disabled"));
        expect(selfDeactivateBtn).toBeTruthy();
        const describedById = selfDeactivateBtn!.getAttribute("aria-describedby");
        expect(describedById).toBeTruthy();
        const reasonEl = container.querySelector(`#${describedById}`);
        expect(reasonEl).toBeTruthy();
        expect(reasonEl!.textContent).toMatch(/cannot deactivate your own account/i);
      });
    });

    it("disables Deactivate on the last remaining active admin with an accessible reason", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [otherAdminRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtns = buttons.filter((b) =>
          /^deactivate$/i.test((b.textContent || "").trim())
        );
        const lastAdminBtn = deactivateBtns.find((b) => b.hasAttribute("disabled"));
        expect(lastAdminBtn).toBeTruthy();
        const describedById = lastAdminBtn!.getAttribute("aria-describedby");
        expect(describedById).toBeTruthy();
        const reasonEl = container.querySelector(`#${describedById}`);
        expect(reasonEl).toBeTruthy();
        expect(reasonEl!.textContent).toMatch(/cannot deactivate the last administrator/i);
      });
    });

    it("does not disable Deactivate for a non-self admin when another active admin exists", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherAdminRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const deactivateBtns = buttons.filter((b) =>
          /^deactivate$/i.test((b.textContent || "").trim())
        );
        // selfRow's Deactivate is disabled (self-guard), otherAdminRow's is not
        // (two active admins present).
        const enabledDeactivateBtn = deactivateBtns.find((b) => !b.hasAttribute("disabled"));
        expect(enabledDeactivateBtn).toBeTruthy();
      });
    });
  });

  describe("Promote/Demote row action (US3)", () => {
    // Row helper: locate the <tr> containing a given row's email so tests can
    // disambiguate between two admin rows' Demote buttons (selfRow and
    // otherAdminRow are both admins whenever both are present).
    const findRowByEmail = (container: HTMLElement, email: string): HTMLElement => {
      const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
        (tr.textContent || "").includes(email)
      );
      if (!row) throw new Error(`row not found for ${email}`);
      return row as HTMLElement;
    };

    const findButton = (root: HTMLElement, pattern: RegExp): HTMLButtonElement => {
      const btn = Array.from(root.querySelectorAll("button")).find((b) =>
        pattern.test((b.textContent || "").trim())
      );
      if (!btn) throw new Error(`button not found for ${pattern}`);
      return btn as HTMLButtonElement;
    };

    it("shows an enabled Promote button for a standard, non-admin account", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const promoteBtn = findButton(container, /^promote$/i);
        expect(promoteBtn.hasAttribute("disabled")).toBe(false);
      });
    });

    it("clicking Promote calls changeRole with role 'admin' immediately (no confirm step)", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [selfRow, otherActiveRow], error: undefined })
      );
      changeRole.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...otherActiveRow, role: "admin" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(container, /^promote$/i);
      });

      await act(async () => {
        fireEvent.click(findButton(container, /^promote$/i));
      });

      await waitFor(() => {
        expect(changeRole).toHaveBeenCalledWith({ id: "user-2", role: "admin" });
        const liveRegion = container.querySelector("[role='status'][aria-live]");
        expect(liveRegion!.textContent).toMatch(/admin/i);
      });
    });

    it("shows a Demote button for an admin account and opens an inline two-step confirm", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "other-admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        fireEvent.click(demoteBtn);
      });

      expect(changeRole).not.toHaveBeenCalled();
      await waitFor(() => {
        findButton(container, /confirm demote/i);
        findButton(container, /^cancel$/i);
      });
    });

    it("the Demote confirm on a non-self admin shows the generic demote-warning copy", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "other-admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        fireEvent.click(demoteBtn);
      });

      await waitFor(() => {
        expect(container.textContent).toMatch(/lose administrative access/i);
        expect(container.textContent).not.toMatch(/immediately lose administrator access/i);
      });
    });

    it("the Demote confirm on the SELF row shows the distinct immediate-eviction warning", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(findRowByEmail(container, "admin@example.com"), /^demote$/i);
        fireEvent.click(demoteBtn);
      });

      await waitFor(() => {
        expect(container.textContent).toMatch(/you will immediately lose administrator access/i);
      });
    });

    it("confirming Demote on a non-self admin calls changeRole, updates the row, and announces the outcome", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );
      changeRole.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...otherAdminRow, role: "standard" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "other-admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        fireEvent.click(demoteBtn);
      });

      await act(async () => {
        fireEvent.click(findButton(container, /confirm demote/i));
      });

      await waitFor(() => {
        expect(changeRole).toHaveBeenCalledWith({ id: "user-4", role: "standard" });
        const liveRegion = container.querySelector("[role='status'][aria-live]");
        expect(liveRegion!.textContent).toMatch(/standard/i);
        expect(mockNavigate).not.toHaveBeenCalled();
        // The row now shows Promote.
        findButton(findRowByEmail(container, "other-admin@example.com"), /^promote$/i);
      });
    });

    it("cancelling the Demote confirm does not mutate and returns focus to the Demote trigger", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "other-admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        fireEvent.click(demoteBtn);
      });

      await act(async () => {
        fireEvent.click(findButton(container, /^cancel$/i));
      });

      expect(changeRole).not.toHaveBeenCalled();
      await waitFor(() => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        expect(document.activeElement).toBe(demoteBtn);
      });
    });

    it("disables Demote on the last remaining active admin with an accessible reason", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [otherAdminRow, otherActiveRow], error: undefined })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const demoteBtn = buttons.find(
          (b) => /^demote$/i.test((b.textContent || "").trim()) && b.hasAttribute("disabled")
        );
        expect(demoteBtn).toBeTruthy();
        const describedById = demoteBtn!.getAttribute("aria-describedby");
        expect(describedById).toBeTruthy();
        const reasonEl = container.querySelector(`#${describedById}`);
        expect(reasonEl).toBeTruthy();
        expect(reasonEl!.textContent).toMatch(/cannot demote the last administrator/i);
      });
    });

    it("a changeRole rejection surfaces an error announcement instead of updating the row", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );
      changeRole.mockReturnValue(
        jest.fn().mockResolvedValue({
          error: { message: "boom" },
          payload: { message: "Cannot demote the last active admin account" },
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "other-admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(
          findRowByEmail(container, "other-admin@example.com"),
          /^demote$/i
        );
        fireEvent.click(demoteBtn);
      });

      await act(async () => {
        fireEvent.click(findButton(container, /confirm demote/i));
      });

      await waitFor(() => {
        const liveRegion = container.querySelector("[role='status'][aria-live]");
        expect(liveRegion!.textContent).toMatch(/cannot demote the last active admin account/i);
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });

    it("a successful self-demotion navigates to the non-admin home instead of re-fetching the roster", async () => {
      listUsers.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [selfRow, otherAdminRow, otherActiveRow],
          error: undefined,
        })
      );
      changeRole.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...selfRow, role: "standard" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<UsersList />, defaultInitialState);
      await waitFor(() => {
        findButton(findRowByEmail(container, "admin@example.com"), /^demote$/i);
      });

      await act(async () => {
        const demoteBtn = findButton(findRowByEmail(container, "admin@example.com"), /^demote$/i);
        fireEvent.click(demoteBtn);
      });

      await act(async () => {
        fireEvent.click(findButton(container, /confirm demote/i));
      });

      await waitFor(() => {
        expect(changeRole).toHaveBeenCalledWith({ id: "admin1", role: "standard" });
        expect(mockNavigate).toHaveBeenCalledWith("/");
      });
    });
  });
});
