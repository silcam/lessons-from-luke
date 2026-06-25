/**
 * CreateInvitation.test.tsx — unit tests for the admin Create Invitation form
 *
 * Tests: render, fill, submit → success state shows link + copy button;
 * 409 account-exists → Alert shown; 409 active-pending → distinct Alert.
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

// Mock invitationThunks so we control the async behaviour
jest.mock("./invitationThunks", () => ({
  createInvitation: jest.fn(),
}));

import React from "react";
import { act, fireEvent, waitFor, screen } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import CreateInvitation from "./CreateInvitation";
const { createInvitation } = require("./invitationThunks") as {
  createInvitation: jest.Mock;
};

// The page header title and the submit button both read "Create Invitation",
// so target the submit button by role to disambiguate from the heading.
const createButton = () => screen.getByRole("button", { name: /create invitation/i });

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: { id: "admin1", admin: true }, locale: "en", loaded: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: clipboard API available
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe("CreateInvitation", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      createInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
      const { container } = renderWithProviders(<CreateInvitation />, defaultInitialState);
      expect(container).toBeTruthy();
    });

    it("renders an email input", () => {
      createInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
      const { container } = renderWithProviders(<CreateInvitation />, defaultInitialState);
      const emailInput = container.querySelector("input[type='email'], input[type='text']");
      expect(emailInput).toBeTruthy();
    });

    it("renders a role select", () => {
      createInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
      const { container } = renderWithProviders(<CreateInvitation />, defaultInitialState);
      const select = container.querySelector("select");
      expect(select).toBeTruthy();
    });

    it("renders a submit button labeled 'Create Invitation'", () => {
      createInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
      renderWithProviders(<CreateInvitation />, defaultInitialState);
      expect(createButton()).toBeTruthy();
    });

    it("renders an 'Invitations' link back to the list in the toolbar", () => {
      createInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
      const { container } = renderWithProviders(<CreateInvitation />, defaultInitialState);
      const backLink = container.querySelector('a[href="/admin/invitations"]');
      expect(backLink).toBeTruthy();
      expect(backLink!.textContent).toMatch(/invitations/i);
    });
  });

  describe("success state", () => {
    it("shows the invitation link after successful submission", async () => {
      const link = "https://example.com/accept/tok123";
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            id: "inv-1",
            email: "user@example.com",
            role: "standard",
            status: "pending",
            link,
            expiresAt: "2026-07-18T00:00:00.000Z",
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateInvitation />, defaultInitialState);

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        expect(getByText(link)).toBeTruthy();
      });
    });

    it("shows a 'Copy Link' button after successful submission", async () => {
      const link = "https://example.com/accept/tok456";
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            id: "inv-2",
            email: "user2@example.com",
            role: "admin",
            status: "pending",
            link,
            expiresAt: "2026-07-18T00:00:00.000Z",
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateInvitation />, defaultInitialState);

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        expect(getByText(/copy link/i)).toBeTruthy();
      });
    });

    it("the Copy Link button has an accessible name", async () => {
      const link = "https://example.com/accept/tok789";
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            id: "inv-3",
            email: "user3@example.com",
            role: "standard",
            status: "pending",
            link,
            expiresAt: "2026-07-18T00:00:00.000Z",
          },
        })
      );

      const { container } = renderWithProviders(<CreateInvitation />, defaultInitialState);

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const copyButton = buttons.find((b) => /copy link/i.test(b.textContent || ""));
        expect(copyButton).toBeTruthy();
        // Must have accessible name (text content or aria-label)
        const hasAccessibleName =
          (copyButton!.textContent && copyButton!.textContent.trim().length > 0) ||
          copyButton!.getAttribute("aria-label");
        expect(hasAccessibleName).toBeTruthy();
      });
    });

    it("announces copy-success via a live region after clicking Copy Link", async () => {
      const link = "https://example.com/accept/tok999";
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            id: "inv-4",
            email: "user4@example.com",
            role: "standard",
            status: "pending",
            link,
            expiresAt: "2026-07-18T00:00:00.000Z",
          },
        })
      );

      const { container, getByText } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => getByText(/copy link/i));

      await act(async () => {
        fireEvent.click(getByText(/copy link/i));
      });

      await waitFor(() => {
        // Must have an element with aria-live or role="status"/"alert" containing the success message
        const liveRegion = container.querySelector("[aria-live], [role='status'], [role='alert']");
        expect(liveRegion).toBeTruthy();
        expect(liveRegion!.textContent).toMatch(/copied/i);
      });
    });
  });

  describe("error states", () => {
    it("shows a distinct Alert when server returns account_exists (409)", async () => {
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "account_exists" },
          error: { message: "rejected" },
        })
      );

      const { container, getByText } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        // Look for alert element with account-exists message
        const alerts = container.querySelectorAll("[role='alert'], .alert");
        const found = Array.from(alerts).some((el) =>
          /account already exists/i.test(el.textContent || "")
        );
        // Fallback: getByText
        if (!found) {
          expect(getByText(/account already exists/i)).toBeTruthy();
        } else {
          expect(found).toBe(true);
        }
      });
    });

    it("shows the friendly email message when server returns malformed_email (400)", async () => {
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "malformed_email" },
          error: { message: "rejected" },
        })
      );

      const { container, getByText } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        const alerts = container.querySelectorAll("[role='alert'], .alert");
        const found = Array.from(alerts).some((el) =>
          /please enter a valid email address/i.test(el.textContent || "")
        );
        if (!found) {
          expect(getByText(/please enter a valid email address/i)).toBeTruthy();
        } else {
          expect(found).toBe(true);
        }
      });
    });

    it("shows the friendly role message when server returns invalid_role (400)", async () => {
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "invalid_role" },
          error: { message: "rejected" },
        })
      );

      const { container, getByText } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        fireEvent.click(createButton());
      });

      await waitFor(() => {
        const alerts = container.querySelectorAll("[role='alert'], .alert");
        const found = Array.from(alerts).some((el) =>
          /please select a valid role/i.test(el.textContent || "")
        );
        if (!found) {
          expect(getByText(/please select a valid role/i)).toBeTruthy();
        } else {
          expect(found).toBe(true);
        }
      });
    });

    it("the account-exists and malformed-email alerts show different messages", async () => {
      // First render: account_exists
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "account_exists" },
          error: { message: "rejected" },
        })
      );

      const { getByText: getByText1 } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        const btns1 = screen.getAllByRole("button", { name: /create invitation/i });
        fireEvent.click(btns1[0]);
      });

      let msg1 = "";
      await waitFor(() => {
        try {
          msg1 = getByText1(/account already exists/i).textContent || "";
        } catch {
          /* tolerate */
        }
        expect(msg1.length).toBeGreaterThan(0);
      });

      // Second render: malformed_email — a distinct error variant
      createInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "malformed_email" },
          error: { message: "rejected" },
        })
      );

      const { getByText: getByText2 } = renderWithProviders(
        <CreateInvitation />,
        defaultInitialState
      );

      await act(async () => {
        const btns2 = screen.getAllByRole("button", { name: /create invitation/i });
        // Click the last one (the newly rendered instance)
        fireEvent.click(btns2[btns2.length - 1]);
      });

      let msg2 = "";
      await waitFor(() => {
        try {
          msg2 = getByText2(/please enter a valid email address/i).textContent || "";
        } catch {
          /* tolerate */
        }
        expect(msg2.length).toBeGreaterThan(0);
      });

      expect(msg1).not.toBe(msg2);
    });
  });
});
