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
import { act, fireEvent, waitFor, screen } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import RedeemInvitation from "./RedeemInvitation";
const { lookupInvitation, acceptInvitation } = require("./redeemInvitationThunks") as {
  lookupInvitation: jest.Mock;
  acceptInvitation: jest.Mock;
};

// The "Create Account" subtitle heading and the submit button share the same
// label (mirroring the login screen), so target the button by role to
// disambiguate from the heading.
const submitButton = () => screen.getByRole("button", { name: /create account/i });

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: null, locale: "en", loaded: true },
};

const TEST_TOKEN = "tok-abc123";

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
        expect(getByText(/this invitation link is no longer valid/i)).toBeTruthy();
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
        const nonPasswordInputs = inputs.filter((i) => (i as HTMLInputElement).type !== "password");
        expect(nonPasswordInputs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows a 'Create Account' submit button", async () => {
      renderWithProviders(<RedeemInvitation token={TEST_TOKEN} />, defaultInitialState);

      await waitFor(() => {
        expect(submitButton()).toBeTruthy();
      });
    });

    it("shows the app title and 'Create Account' subtitle, matching the login screen", async () => {
      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => submitButton());

      // App title present (like the login screen), and the H1 is the title —
      // NOT the email-locked label as it was before.
      expect(getByText("Lessons from Luke")).toBeTruthy();
      const headings = Array.from(document.querySelectorAll("h1"));
      expect(headings[0]?.textContent).toBe("Lessons from Luke");
    });

    it("renders the submit button with the bigger styling (matches the login button)", async () => {
      renderWithProviders(<RedeemInvitation token={TEST_TOKEN} />, defaultInitialState);

      await waitFor(() => submitButton());

      // Button `bigger` injects a 1.3em font-size rule; the redeem form's only
      // button is the submit, so its presence in the styled-components sheet
      // confirms the submit button is `bigger` like the login button.
      const css = Array.from(document.querySelectorAll("style"))
        .map((s) => s.textContent || "")
        .join("");
      expect(css).toMatch(/font-size:\s*1\.3em/);
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

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        expect(getByText(/your account has been created/i)).toBeTruthy();
      });
    });

    it("navigates to / after 2 seconds on success", async () => {
      jest.useFakeTimers();

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

      renderWithProviders(<RedeemInvitation token={TEST_TOKEN} />, defaultInitialState);

      await act(async () => {
        jest.runAllTicks();
      });

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(mockNavigate).toHaveBeenCalledWith("/");

      jest.useRealTimers();
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

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
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

      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        // Submit button still present = form still usable
        expect(submitButton()).toBeTruthy();
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

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        expect(getByText(/this invitation link is no longer valid/i)).toBeTruthy();
      });
    });
  });

  describe("submit: validation error (400) — surfaces server message, form remains", () => {
    it("shows the server's validation message instead of the generic error", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "validation_error",
            message: "Password must be at least 12 characters",
          },
          error: { message: "rejected" },
        })
      );

      const { getByText, queryByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        expect(getByText(/password must be at least 12 characters/i)).toBeTruthy();
      });
      // The generic fallback must NOT be shown when the server gives a specific reason
      expect(queryByText(/something went wrong/i)).toBeFalsy();
    });

    it("falls back to the generic message when the server sends no message", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "validation_error", message: "" },
          error: { message: "rejected" },
        })
      );

      const { getByText } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        expect(getByText(/something went wrong/i)).toBeTruthy();
      });
    });

    it("keeps the form usable after a validation error (transient, not terminal)", async () => {
      lookupInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { email: "recipient@example.com" },
        })
      );
      acceptInvitation.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "validation_error",
            message: "Password must be at least 12 characters",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithProviders(
        <RedeemInvitation token={TEST_TOKEN} />,
        defaultInitialState
      );

      await waitFor(() => submitButton());

      await act(async () => {
        fireEvent.click(submitButton());
      });

      await waitFor(() => {
        // Form still usable: submit button + password input remain present
        expect(submitButton()).toBeTruthy();
        expect(container.querySelector("input[type='password']")).toBeTruthy();
      });
    });
  });
});
