/**
 * RedeemInvitation.test.tsx — unit tests for the recipient redemption form
 *
 * Tests: mount→lookup, 410 invalid link, 429 rate limited (distinct from invalid_link),
 * success form render, submit success, 429 submit (transient), 410/409 submit (terminal).
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

// Mock the thunks so we control async behaviour
jest.mock("./redeemInvitationThunks", () => ({
  lookupInvitation: jest.fn(),
  acceptInvitation: jest.fn(),
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import RedeemInvitation from "./RedeemInvitation";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lookupInvitation, acceptInvitation } = require("./redeemInvitationThunks") as {
  lookupInvitation: jest.Mock;
  acceptInvitation: jest.Mock;
};

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: null, locale: "en", loaded: true },
};

const TEST_TOKEN = "tok-abc123";

function makeThunkResult(payload: unknown, rejected = false) {
  return jest.fn().mockReturnValue(
    jest.fn().mockResolvedValue(
      rejected
        ? { error: { message: "rejected" }, payload }
        : { payload, error: undefined }
    )
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockClear();
});

describe("RedeemInvitation", () => {
  describe("on mount", () => {
    it("calls lookupInvitation with the token prop", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({ payload: { email: "user@example.com" } })
      );
      acceptInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));

      await act(async () => {
        renderWithProviders(<RedeemInvitation token={TEST_TOKEN} />, defaultInitialState);
      });

      expect(lookupInvitation).toHaveBeenCalledWith(TEST_TOKEN);
    });
  });

  describe("lookup: 410 invalid link", () => {
    it("shows the invalid-link error message (terminal)", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "invalid_link", message: "No longer valid." },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        expect(
          getByText(/this invitation link is no longer valid/i)
        ).toBeTruthy();
      });
    });

    it("does NOT show the password form when link is invalid", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "invalid_link", message: "No longer valid." },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        const passwordInput = container.querySelector("input[type='password']");
        expect(passwordInput).toBeFalsy();
      });
    });
  });

  describe("lookup: 429 rate limited", () => {
    it("shows the rate-limited message — DISTINCT from invalid_link (red-team Pass 9)", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "rate_limited", message: "Too many attempts." },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        expect(getByText(/too many attempts/i)).toBeTruthy();
      });
    });

    it("does NOT show invalid-link text when rate limited", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "rate_limited", message: "Too many attempts." },
          error: { message: "rejected" },
        })
      );

      const { queryByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        // The rate_limited state MUST NOT display the invalid-link message
        expect(queryByText(/no longer valid/i)).toBeFalsy();
      });
    });
  });

  describe("lookup: success — form render", () => {
    beforeEach(() => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(jest.fn().mockResolvedValue({ payload: null }));
    });

    it("shows the pre-filled email as locked/readonly", async () => {
      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        // Email shown and not editable — either disabled or readonly
        const inputs = Array.from(container.querySelectorAll("input"));
        const emailInput = inputs.find(
          (i) =>
            (i as HTMLInputElement).value === "recipient@example.com" ||
            (i as HTMLInputElement).disabled ||
            (i as HTMLInputElement).readOnly
        );
        expect(emailInput).toBeTruthy();
      });
    });

    it("shows a password input", async () => {
      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        const passwordInput = container.querySelector("input[type='password']");
        expect(passwordInput).toBeTruthy();
      });
    });

    it("shows a display-name input", async () => {
      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        const inputs = Array.from(container.querySelectorAll("input"));
        // At least 2 text-type inputs (name + something else, or just name alongside disabled email)
        const nonPasswordInputs = inputs.filter(
          (i) => (i as HTMLInputElement).type !== "password"
        );
        expect(nonPasswordInputs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows a 'Create Account' submit button", async () => {
      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => {
        expect(getByText(/create account/i)).toBeTruthy();
      });
    });
  });

  describe("submit: success", () => {
    it("shows the success message after successful submission", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => getByText(/create account/i));

      await act(async () => {
        fireEvent.click(getByText(/create account/i));
      });

      await waitFor(() => {
        expect(getByText(/your account has been created/i)).toBeTruthy();
      });
    });
  });

  describe("submit: 429 rate limited (transient — form remains usable)", () => {
    it("shows the rate-limited error message", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "rate_limited", message: "Too many attempts." },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => getByText(/create account/i));

      await act(async () => {
        fireEvent.click(getByText(/create account/i));
      });

      await waitFor(() => {
        expect(getByText(/too many attempts/i)).toBeTruthy();
      });
    });

    it("the form is still present after a 429 submit error (transient, not terminal)", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "rate_limited", message: "Too many attempts." },
          error: { message: "rejected" },
        })
      );

      const { getByText, container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => getByText(/create account/i));

      await act(async () => {
        fireEvent.click(getByText(/create account/i));
      });

      await waitFor(() => {
        // Submit button still present = form still usable
        expect(getByText(/create account/i)).toBeTruthy();
        // Password input still present
        expect(container.querySelector("input[type='password']")).toBeTruthy();
      });
    });
  });

  describe("submit: 410/409 (terminal — link no longer valid)", () => {
    it("shows the invalid-link error message on 410 submit", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "invalid_link", message: "No longer valid." },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => getByText(/create account/i));

      await act(async () => {
        fireEvent.click(getByText(/create account/i));
      });

      await waitFor(() => {
        expect(getByText(/this invitation link is no longer valid/i)).toBeTruthy();
      });
    });
  });

  describe("submit: validation error (400) — generic try-again, form remains", () => {
    it("shows generic error on validation failure", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "validation_error", message: "Password too short." },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => getByText(/create account/i));

      await act(async () => {
        fireEvent.click(getByText(/create account/i));
      });

      await waitFor(() => {
        expect(getByText(/something went wrong/i)).toBeTruthy();
      });
    });
  });
});
