/**
 * ResetPassword.test.tsx — unit tests for the Reset Password completion page
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1 Acceptance Scenarios
 * Plan: plan.md §Presentation Design (UI Decisions table), §Accessibility Requirements,
 *       §Security Considerations (Pass 1 — token URL confidentiality)
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
  resetPassword: jest.fn(),
}));

// Mock useNavigate — component may navigate on success or invalid-token
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import React from "react";
import { render, act, fireEvent, waitFor, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { buildStore, defaultSyncState, mockGet, mockPost } from "../../common/testHelpers";
import RequestContext from "../../common/api/RequestContext";
import ResetPassword from "./ResetPassword";

const { resetPassword } = require("./passwordResetThunks") as {
  resetPassword: jest.Mock;
};

const defaultInitialState = {
  syncState: defaultSyncState,
  currentUser: { user: null, locale: "en", loaded: true },
};

const TEST_TOKEN = "reset-tok-abc123";

/**
 * Render ResetPassword within a MemoryRouter whose initial URL carries the given
 * reset token as the `?token=` query parameter, as the real router would.
 */
function renderWithToken(token: string, initialState = defaultInitialState) {
  const store = buildStore(initialState);
  return render(
    <Provider store={store}>
      <RequestContext.Provider value={{ get: mockGet, post: mockPost }}>
        <MemoryRouter
          initialEntries={[`/reset-password?token=${encodeURIComponent(token)}`]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <ResetPassword />
        </MemoryRouter>
      </RequestContext.Provider>
    </Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockClear();
  document.title = "";
});

describe("ResetPassword", () => {
  // ── Token URL confidentiality (Pass 1 — security) ─────────────────────────

  describe("token URL confidentiality (Pass 1 — security)", () => {
    it("reads ?token= from URL into state and immediately calls history.replaceState to remove the token from the address bar", async () => {
      const replaceStateSpy = jest.spyOn(window.history, "replaceState");
      resetPassword.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      renderWithToken(TEST_TOKEN);

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalled();
        // The new URL (third arg) must NOT contain the token
        const newUrl = String(
          replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1]?.[2] ?? ""
        );
        expect(newUrl).not.toContain(TEST_TOKEN);
      });

      replaceStateSpy.mockRestore();
    });
  });

  // ── Form elements ─────────────────────────────────────────────────────────

  describe("form elements (autocomplete / accessibility)", () => {
    it("renders a password input with autocomplete='new-password'", () => {
      const { container } = renderWithToken(TEST_TOKEN);

      const input = container.querySelector("input[autocomplete='new-password']");
      expect(input).not.toBeNull();
    });

    it("has an associated <label> element for the password input (not placeholder-only)", () => {
      const { container } = renderWithToken(TEST_TOKEN);

      const label = container.querySelector("label");
      expect(label).not.toBeNull();
    });
  });

  // ── Document title ────────────────────────────────────────────────────────

  describe("document title (route orientation, Pass 8 a11y)", () => {
    it("sets a route-specific document title on mount (e.g. 'Reset your password')", () => {
      document.title = "";
      renderWithToken(TEST_TOKEN);
      expect(document.title).toMatch(/reset.*password|password.*reset/i);
    });
  });

  // ── Submission — success ──────────────────────────────────────────────────

  describe("form submission — success", () => {
    it("calls resetPassword thunk with the token (from URL state) and the entered new password", async () => {
      resetPassword.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();

      fireEvent.change(passwordInput!, { target: { value: "new-strong-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      expect(resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          token: TEST_TOKEN,
          newPassword: "new-strong-password-123",
        })
      );
    });

    it("on success, shows a success confirmation message", async () => {
      resetPassword.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-strong-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/password.*changed|password.*reset|successfully/i);
      });
    });

    it("on success, shows a 'Continue to sign in' link or button", async () => {
      resetPassword.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-strong-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/continue.*sign in|sign in/i);
      });
    });

    it("moves focus to the result heading on success state transition (Pass 8 a11y)", async () => {
      resetPassword.mockReturnValue(jest.fn().mockResolvedValue({ payload: undefined }));

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-strong-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        expect(headings.length).toBeGreaterThan(0);
        const focusedHeading = headings.find((h) => h === document.activeElement);
        expect(focusedHeading).toBeTruthy();
      });
    });
  });

  // ── Submission — INVALID_TOKEN error ──────────────────────────────────────

  describe("form submission — INVALID_TOKEN error", () => {
    it("on INVALID_TOKEN, shows a clear rejection message", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "invalid_token",
            message: "This link has expired or already been used.",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/expired|invalid|no longer valid/i);
      });
    });

    it("on INVALID_TOKEN, shows a 'Request a new link' action", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "invalid_token",
            message: "This link has expired or already been used.",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/request.*new.*link|new.*link|try again/i);
      });
    });

    it("moves focus to the result heading on INVALID_TOKEN state transition (Pass 8 a11y)", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: { code: "invalid_token", message: "This link has expired." },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "new-password-123" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        expect(headings.length).toBeGreaterThan(0);
        const focusedHeading = headings.find((h) => h === document.activeElement);
        expect(focusedHeading).toBeTruthy();
      });
    });
  });

  // ── Submission — password policy errors ───────────────────────────────────

  describe("form submission — password policy errors", () => {
    it("on PASSWORD_TOO_SHORT, shows policy guidance (e.g. minimum character count)", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "password_too_short",
            message: "Password must be at least 12 characters.",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "short" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const bodyText = document.body.textContent ?? "";
        expect(bodyText).toMatch(/at least|characters|too short/i);
      });
    });

    it("on PASSWORD_TOO_SHORT, the form remains usable (password input still present — policy error is transient)", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "password_too_short",
            message: "Password must be at least 12 characters.",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "short" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        // Form must still be present after a policy error — it is transient, not terminal
        const input = container.querySelector("input[autocomplete='new-password']");
        expect(input).not.toBeNull();
      });
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  describe("accessibility", () => {
    it("error messages use role=alert or aria-live", async () => {
      resetPassword.mockReturnValue(
        jest.fn().mockResolvedValue({
          payload: {
            code: "password_too_short",
            message: "Password must be at least 12 characters.",
          },
          error: { message: "rejected" },
        })
      );

      const { container } = renderWithToken(TEST_TOKEN);

      const passwordInput = container.querySelector("input[autocomplete='new-password']");
      expect(passwordInput).not.toBeNull();
      fireEvent.change(passwordInput!, { target: { value: "short" } });

      const submitButton = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        const alertEl = container.querySelector('[role="alert"], [aria-live]');
        expect(alertEl).not.toBeNull();
      });
    });
  });
});
