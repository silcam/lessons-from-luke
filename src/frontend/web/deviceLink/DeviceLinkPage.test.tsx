/**
 * DeviceLinkPage.test.tsx — unit tests for the device link / pairing approval page
 *
 * Spec: specs/004-desktop-auth-pairing/plan.md §Presentation Design
 *       §Accessibility Requirements (/link page focus management)
 *       §Security Considerations (anti-phishing consent copy)
 *       spec.md §FR-002 §FR-003
 * Task: lessons-from-luke-wgr.5.3.7
 */

// Break networkSlice → appState → networkSlice circular dep (common test boilerplate)
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

// Mock the thunks — each test configures what dispatch(...) resolves to
jest.mock("./deviceLinkThunks", () => ({
  claimCode: jest.fn(),
  approveCode: jest.fn(),
  denyCode: jest.fn(),
}));

import React from "react";
import { act, fireEvent, waitFor, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { buildStore } from "../../common/testHelpers";
import DeviceLinkPage from "./DeviceLinkPage";

const { claimCode, approveCode, denyCode } = require("./deviceLinkThunks") as {
  claimCode: jest.Mock;
  approveCode: jest.Mock;
  denyCode: jest.Mock;
};

/**
 * Render DeviceLinkPage mounted at `path`, backed by a real Redux store.
 * Routes is required so useLocation/useSearchParams have the correct context.
 */
function renderAtPath(path: string = "/link") {
  const store = buildStore({
    currentUser: {
      user: { id: "u1", admin: false },
      loaded: true,
      locale: "en",
      error: null,
    },
  });
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/link" element={<DeviceLinkPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all thunks resolve successfully with empty payload (no .error)
  claimCode.mockReturnValue(jest.fn().mockResolvedValue({ payload: {} }));
  approveCode.mockReturnValue(jest.fn().mockResolvedValue({ payload: {} }));
  denyCode.mockReturnValue(jest.fn().mockResolvedValue({ payload: {} }));
});

// ── Auto-claim: ?user_code pre-filled in URL ──────────────────────────────────

describe("when ?user_code is pre-filled in the URL", () => {
  it("dispatches claimCode with the URL user_code on mount", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    expect(claimCode).toHaveBeenCalledWith("WDJB-MJHT");
  });

  it("shows the required security consent copy after a successful claim", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    // Exact phrases required by plan.md §Security Considerations — security control, not just UX
    expect(document.body.textContent).toMatch(/connect a new desktop/i);
    expect(document.body.textContent).toMatch(/this lets that computer act as your account/i);
    expect(document.body.textContent).toMatch(
      /only continue if you started this on your own machine/i
    );
  });

  it("renders an Approve button (primary) after a successful claim", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
  });

  it("renders a Decline button (secondary) after a successful claim", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    expect(screen.getByRole("button", { name: /decline/i })).toBeTruthy();
  });

  it("moves initial keyboard focus to the Approve button after claim (WCAG 2.2 AA)", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await waitFor(() => {
      expect(document.activeElement).toBe(approveBtn);
    });
  });
});

// ── Manual entry: no ?user_code in URL ────────────────────────────────────────

describe("when no ?user_code is in the URL", () => {
  it("renders an editable text input for manual code entry", () => {
    renderAtPath("/link");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("does NOT auto-dispatch claimCode on mount", () => {
    renderAtPath("/link");
    expect(claimCode).not.toHaveBeenCalled();
  });

  it("dispatches claimCode after the user enters a code and submits", async () => {
    renderAtPath("/link");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ABCD-1234" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    });
    expect(claimCode).toHaveBeenCalledWith("ABCD-1234");
  });

  it("shows consent text and Approve/Decline buttons after a successful manual claim", async () => {
    renderAtPath("/link");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ABCD-1234" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    });
    expect(document.body.textContent).toMatch(/connect a new desktop/i);
    expect(screen.getByRole("button", { name: /decline/i })).toBeTruthy();
  });
});

// ── Approve flow ──────────────────────────────────────────────────────────────

describe("Approve button", () => {
  async function renderReady(): Promise<void> {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
  }

  it("calls approveCode with the user_code when clicked", async () => {
    await renderReady();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    });
    expect(approveCode).toHaveBeenCalledWith("WDJB-MJHT");
  });

  it("shows an approved/connected status message after approval", async () => {
    await renderReady();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/approved|connected|desktop has been connected/i);
    });
  });
});

// ── Decline flow ──────────────────────────────────────────────────────────────

describe("Decline button", () => {
  async function renderReady(): Promise<void> {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
  }

  it("calls denyCode with the user_code when clicked", async () => {
    await renderReady();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    });
    expect(denyCode).toHaveBeenCalledWith("WDJB-MJHT");
  });

  it("shows a declined status message after declining", async () => {
    await renderReady();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/declined|cancelled|connection declined/i);
    });
  });
});

// ── Accessibility: aria-live status region ────────────────────────────────────

describe("accessibility", () => {
  it("renders a role=status (aria-live=polite) region for status announcements", async () => {
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    // role="status" carries implicit aria-live="polite" (ARIA 1.2 §6.5)
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("shows an expiry error when claimCode returns expired", async () => {
    claimCode.mockReturnValue(
      jest.fn().mockResolvedValue({
        payload: { code: "expired", message: "Code expired" },
        error: { message: "Rejected" },
      })
    );
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/expired|code has expired/i);
    });
  });

  it("shows a rate-limit error when claimCode returns rate_limited", async () => {
    claimCode.mockReturnValue(
      jest.fn().mockResolvedValue({
        payload: { code: "rate_limited", message: "Too many requests" },
        error: { message: "Rejected" },
      })
    );
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/too many|rate limit/i);
    });
  });

  it("shows an error message when approveCode fails", async () => {
    approveCode.mockReturnValue(
      jest.fn().mockResolvedValue({
        payload: { code: "network_error", message: "Network error" },
        error: { message: "Rejected" },
      })
    );
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/error|failed|try again/i);
    });
  });

  it("shows an error message when denyCode fails", async () => {
    denyCode.mockReturnValue(
      jest.fn().mockResolvedValue({
        payload: { code: "network_error", message: "Network error" },
        error: { message: "Rejected" },
      })
    );
    await act(async () => {
      renderAtPath("/link?user_code=WDJB-MJHT");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/error|failed|try again/i);
    });
  });
});
