/**
 * ForgotPassword.test.tsx — unit tests for the Forgot Password request page
 *
 * RED TDD: all tests in this file intentionally fail. ForgotPassword.tsx is a stub
 * that renders null. The GREEN task (lessons-from-luke-5qjl.5.3.6) implements the
 * real component so that all tests pass.
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1 Acceptance Scenarios
 * Plan: plan.md §Presentation Design (UI Decisions table), §Accessibility Requirements
 * Skills: /typescript-unit-testing
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

// Mock the password-reset thunks so we control async behaviour per test
jest.mock("./passwordResetThunks", () => ({
  requestPasswordReset: jest.fn(),
}));

// Mock useNavigate — component may navigate to sign-in on success
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import React from "react";
import { act, fireEvent, waitFor, screen } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import ForgotPassword from "./ForgotPassword";

const { requestPasswordReset } = require("./passwordResetThunks") as {
  requestPasswordReset: jest.Mock;
};

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: null, locale: "en", loaded: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockClear();
  document.title = "";
});

describe("ForgotPassword", () => {
  // ── Form elements ────────────────────────────────────────────────────────

  describe("form elements (autocomplete / accessibility)", () => {
    it("renders an email input with autocomplete='email' and inputmode='email'", () => {
      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      const input = container.querySelector("input[autocomplete='email']");
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement | null)?.getAttribute("inputmode")).toBe("email");
    });

    it("has an associated <label> element for the email input (not placeholder-only)", () => {
      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      // A visible <label> must exist — screen-reader users need it
      const label = container.querySelector("label");
      expect(label).not.toBeNull();
    });
  });

  // ── Document title ────────────────────────────────────────────────────────

  describe("document title (route orientation, Pass 8 a11y)", () => {
    it("sets a route-specific document title on mount (e.g. 'Forgot password')", () => {
      document.title = "";
      renderWithProviders(<ForgotPassword />, defaultInitialState);
      expect(document.title).toMatch(/forgot password/i);
    });
  });

  // ── Submission ────────────────────────────────────────────────────────────

  describe("form submission", () => {
    it("calls requestPasswordReset with the entered email when the form is submitted", async () => {
      requestPasswordReset.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      const emailInput = container.querySelector("input[autocomplete='email']");
      expect(emailInput).not.toBeNull();

      fireEvent.change(emailInput!, { target: { value: "user@example.com" } });

      // Click the submit button — stub has no button, so getByRole throws → test fails ✓
      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      expect(requestPasswordReset).toHaveBeenCalledWith("user@example.com");
    });

    it("after submission shows a generic confirmation regardless of whether the email exists (enumeration-safe)", async () => {
      requestPasswordReset.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      const emailInput = container.querySelector("input[autocomplete='email']");
      expect(emailInput).not.toBeNull();
      fireEvent.change(emailInput!, { target: { value: "user@example.com" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/check your email|email sent|reset link/i);
      });
    });

    it("shows a role=alert error message when submission returns an error", async () => {
      requestPasswordReset.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "network_error", message: "Network error." },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      const emailInput = container.querySelector("input[autocomplete='email']");
      expect(emailInput).not.toBeNull();
      fireEvent.change(emailInput!, { target: { value: "user@example.com" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const alertEl = document.querySelector('[role="alert"]');
        expect(alertEl).not.toBeNull();
      });
    });
  });

  // ── Focus management ──────────────────────────────────────────────────────

  describe("focus management (Pass 8 a11y)", () => {
    it("moves focus to the result heading on transition to success state", async () => {
      requestPasswordReset.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithProviders(<ForgotPassword />, defaultInitialState);

      const emailInput = container.querySelector("input[autocomplete='email']");
      expect(emailInput).not.toBeNull();
      fireEvent.change(emailInput!, { target: { value: "user@example.com" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        // A heading must exist after the success transition
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        expect(headings.length).toBeGreaterThan(0);
        // One of the headings must have received focus
        const focusedHeading = headings.find((h) => h === document.activeElement);
        expect(focusedHeading).toBeTruthy();
      });
    });
  });
});
