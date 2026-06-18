/**
 * InvitationsList.test.tsx — unit tests for the admin Invitations management screen
 *
 * Tests: render, list display, empty state, retract, re-copy, copy-link.
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

// Mock invitationsListThunks so we control async behaviour
jest.mock("./invitationsListThunks", () => ({
  listInvitations: jest.fn(),
  retractInvitation: jest.fn(),
  getInvitationLink: jest.fn(),
}));

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import InvitationsList from "./InvitationsList";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listInvitations, retractInvitation, getInvitationLink } = require(
  "./invitationsListThunks"
) as {
  listInvitations: jest.Mock;
  retractInvitation: jest.Mock;
  getInvitationLink: jest.Mock;
};

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: { id: "admin1", admin: true }, locale: "en", loaded: true },
};

const pendingSummary = {
  id: "inv-1",
  email: "pending@example.com",
  role: "standard",
  status: "pending",
  createdAt: "2026-06-01T00:00:00.000Z",
  expiresAt: "2026-07-01T00:00:00.000Z",
  acceptedAt: null,
  invitedByEmail: "admin@example.com",
};

const acceptedSummary = {
  id: "inv-2",
  email: "accepted@example.com",
  role: "admin",
  status: "accepted",
  createdAt: "2026-06-02T00:00:00.000Z",
  expiresAt: "2026-07-02T00:00:00.000Z",
  acceptedAt: "2026-06-10T00:00:00.000Z",
  invitedByEmail: "admin@example.com",
};

const retractedSummary = {
  id: "inv-3",
  email: "retracted@example.com",
  role: "standard",
  status: "retracted",
  createdAt: "2026-06-03T00:00:00.000Z",
  expiresAt: "2026-07-03T00:00:00.000Z",
  acceptedAt: null,
  invitedByEmail: "admin@example.com",
};

function makeThunkResult(payload: unknown, rejected = false) {
  return jest.fn().mockReturnValue(
    jest.fn().mockResolvedValue(
      rejected ? { error: { message: "rejected" }, payload } : { payload, error: undefined }
    )
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe("InvitationsList", () => {
  describe("rendering", () => {
    it("renders without crashing", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        expect(container).toBeTruthy();
      });
    });

    it("calls listInvitations on mount", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [], error: undefined })
      );

      renderWithProviders(<InvitationsList />, defaultInitialState);

      await waitFor(() => {
        expect(listInvitations).toHaveBeenCalledTimes(1);
      });
    });

    it("shows a page heading", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        // Heading should contain "Invitation" or similar
        const text = container.textContent || "";
        expect(text).toMatch(/invitation/i);
      });
    });
  });

  describe("empty state", () => {
    it("shows empty state message when no invitations", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        const text = container.textContent || "";
        // i18n: Invitations_empty_state = "No invitations yet."
        expect(text).toMatch(/no invitations yet/i);
      });
    });
  });

  describe("list display", () => {
    it("shows each invitation's email", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary, acceptedSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toContain("pending@example.com");
        expect(container.textContent).toContain("accepted@example.com");
      });
    });

    it("shows each invitation's role", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary, acceptedSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        // i18n: Invitation_role_standard = "Standard", Invitation_role_admin = "Administrator"
        expect(container.textContent).toMatch(/standard/i);
        expect(container.textContent).toMatch(/administrator/i);
      });
    });

    it("shows each invitation's status", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: [pendingSummary, acceptedSummary, retractedSummary],
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        // i18n: Invitations_status_pending = "Pending", etc.
        expect(container.textContent).toMatch(/pending/i);
        expect(container.textContent).toMatch(/accepted/i);
        expect(container.textContent).toMatch(/retracted/i);
      });
    });

    it("shows the creating admin's email", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        expect(container.textContent).toContain("admin@example.com");
      });
    });
  });

  describe("Pending invitation actions", () => {
    it("shows a Retract button for pending invitations", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /retract/i.test(b.textContent || ""));
        expect(retractBtn).toBeTruthy();
      });
    });

    it("shows a Re-copy Link button for pending invitations", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const recopyBtn = buttons.find((b) => /re-copy link/i.test(b.textContent || ""));
        expect(recopyBtn).toBeTruthy();
      });
    });

    it("does NOT show Retract button for accepted invitations", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [acceptedSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /retract/i.test(b.textContent || ""));
        expect(retractBtn).toBeFalsy();
      });
    });

    it("does NOT show Re-copy Link button for retracted invitations", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [retractedSummary], error: undefined })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);
      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const recopyBtn = buttons.find((b) => /re-copy link/i.test(b.textContent || ""));
        expect(recopyBtn).toBeFalsy();
      });
    });

    it("clicking Retract calls retractInvitation with the invitation id", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );
      retractInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...pendingSummary, status: "retracted" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);

      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /retract/i.test(b.textContent || ""));
        expect(retractBtn).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /retract/i.test(b.textContent || ""));
        fireEvent.click(retractBtn!);
      });

      await waitFor(() => {
        expect(retractInvitation).toHaveBeenCalledWith("inv-1");
      });
    });

    it("clicking Re-copy Link calls getInvitationLink with the invitation id", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );
      getInvitationLink.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { id: "inv-1", link: "https://example.com/invitation/tok123" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);

      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const recopyBtn = buttons.find((b) => /re-copy link/i.test(b.textContent || ""));
        expect(recopyBtn).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const recopyBtn = buttons.find((b) => /re-copy link/i.test(b.textContent || ""));
        fireEvent.click(recopyBtn!);
      });

      await waitFor(() => {
        expect(getInvitationLink).toHaveBeenCalledWith("inv-1");
      });
    });

    it("after re-copy, copies link to clipboard and announces copy success", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );
      getInvitationLink.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { id: "inv-1", link: "https://example.com/invitation/tok123" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);

      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        expect(buttons.find((b) => /re-copy link/i.test(b.textContent || ""))).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const recopyBtn = buttons.find((b) => /re-copy link/i.test(b.textContent || ""));
        fireEvent.click(recopyBtn!);
      });

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "https://example.com/invitation/tok123"
        );
        // Accessible live region should confirm the copy
        const liveRegion = container.querySelector("[aria-live], [role='status'], [role='alert']");
        expect(liveRegion).toBeTruthy();
        expect(liveRegion!.textContent).toMatch(/copied/i);
      });
    });

    it("after retract, updates the row status to Retracted", async () => {
      listInvitations.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: [pendingSummary], error: undefined })
      );
      retractInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { ...pendingSummary, status: "retracted" },
          error: undefined,
        })
      );

      const { container } = renderWithProviders(<InvitationsList />, defaultInitialState);

      await waitFor(() => {
        const buttons = Array.from(container.querySelectorAll("button"));
        expect(buttons.find((b) => /retract/i.test(b.textContent || ""))).toBeTruthy();
      });

      await act(async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /retract/i.test(b.textContent || ""));
        fireEvent.click(retractBtn!);
      });

      await waitFor(() => {
        // After retract, status should show "Retracted" and no more Retract button
        expect(container.textContent).toMatch(/retracted/i);
        const buttons = Array.from(container.querySelectorAll("button"));
        const retractBtn = buttons.find((b) => /^retract$/i.test(b.textContent?.trim() || ""));
        expect(retractBtn).toBeFalsy();
      });
    });
  });
});
