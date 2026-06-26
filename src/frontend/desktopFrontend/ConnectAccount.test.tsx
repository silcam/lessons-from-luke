import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import syncStateSlice from "../common/state/syncStateSlice";
import bannerSlice from "../common/banners/bannerSlice";
import languageSlice from "../common/state/languageSlice";
import loadingSlice from "../common/api/loadingSlice";
import currentUserSlice from "../common/state/currentUserSlice";
import tStringSlice from "../common/state/tStringSlice";
import lessonSlice from "../common/state/lessonSlice";
import docStringSlice from "../common/state/docStringSlice";
import tSubSlice from "../common/state/tSubSlice";
import docPreviewSlice from "../common/state/docPreviewSlice";
import {
  PAIRING_START,
  PAIRING_CANCEL,
  PAIRING_DISCONNECT,
  ON_PAIRING_ERROR,
} from "../../core/api/IpcChannels";

// networkSlice has a circular dep with appState — stub it out
jest.mock("../common/state/networkSlice", () => {
  const { createSlice } = require("@reduxjs/toolkit");
  const stub = createSlice({
    name: "network",
    initialState: { connected: true },
    reducers: {},
  });
  return { __esModule: true, default: stub };
});

// ---------- mocks ----------
const mockInvoke = jest.fn();
const mockOn = jest.fn();
const mockWriteText = jest.fn();

beforeEach(() => {
  mockInvoke.mockReset();
  mockOn.mockReset();
  mockWriteText.mockReset();
  // Default: on() returns a no-op unsubscribe
  mockOn.mockReturnValue(jest.fn());
  window.electronAPI = { invoke: mockInvoke, on: mockOn };
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    configurable: true,
  });
});

// ---------- test helpers ----------
function createTestStore(syncStateOverrides: Partial<ReturnType<typeof syncStateSlice.reducer>> = {}) {
  const networkSlice = require("../common/state/networkSlice").default;
  const reducer = combineReducers({
    syncState: syncStateSlice.reducer,
    banners: bannerSlice.reducer,
    languages: languageSlice.reducer,
    loading: loadingSlice.reducer,
    network: networkSlice.reducer,
    currentUser: currentUserSlice.reducer,
    tStrings: tStringSlice.reducer,
    tSubs: tSubSlice.reducer,
    lessons: lessonSlice.reducer,
    docStrings: docStringSlice.reducer,
    docPreview: docPreviewSlice.reducer,
  });
  const store = configureStore({ reducer });
  if (Object.keys(syncStateOverrides).length > 0) {
    store.dispatch(syncStateSlice.actions.setSyncState(syncStateOverrides));
  }
  return store;
}

function renderConnectAccount(store = createTestStore()) {
  const ConnectAccount = require("./ConnectAccount").default;
  return render(
    <Provider store={store}>
      <ConnectAccount />
    </Provider>
  );
}

// ---------- tests ----------

describe("ConnectAccount — idle state (not paired)", () => {
  it('shows "Connect to account" button', () => {
    renderConnectAccount(createTestStore({ paired: false }));
    expect(screen.getByRole("button", { name: "Connect to account" })).toBeTruthy();
  });

  it("does not show the pairing code or connected-user text", () => {
    renderConnectAccount(createTestStore({ paired: false }));
    expect(screen.queryByLabelText("Pairing code, eight characters")).toBeNull();
    expect(screen.queryByText(/Connected as/)).toBeNull();
  });
});

describe("ConnectAccount — pairing in progress", () => {
  it('invokes pairingStart when "Connect to account" is clicked', async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(PAIRING_START);
  });

  it("shows the pairing code field labeled with the code after pairingStart", async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    // The code is in a readonly input — check via aria-label and the value attribute
    const codeField = screen.getByLabelText("Pairing code, eight characters");
    expect(codeField).toBeTruthy();
    expect(codeField.getAttribute("value")).toBe("ABCD-EFGH");
  });

  it('code field has aria-label "Pairing code, eight characters"', async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    const codeField = screen.getByLabelText("Pairing code, eight characters");
    expect(codeField).toBeTruthy();
    // The value attribute carries the code (readonly input; property set via React)
    expect(codeField.getAttribute("value")).toBe("ABCD-EFGH");
  });

  it('shows "Waiting for browser approval..." in an aria-live="polite" region', async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    const statusText = screen.getByText("Waiting for browser approval...");
    expect(statusText.closest('[aria-live="polite"]')).toBeTruthy();
  });

  it("shows a Cancel button during pairing", async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("invokes pairingCancel and returns to idle when Cancel is clicked", async () => {
    mockInvoke
      .mockResolvedValueOnce({ userCode: "ABCD-EFGH" })
      .mockResolvedValueOnce(undefined);
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(PAIRING_CANCEL);
    expect(screen.getByRole("button", { name: "Connect to account" })).toBeTruthy();
  });

  it('announces "Code copied" in an aria-live="polite" region when copy button is clicked', async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    mockWriteText.mockResolvedValueOnce(undefined);
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });
    const announcement = screen.getByText("Code copied");
    expect(announcement).toBeTruthy();
    expect(announcement.closest('[aria-live="polite"]')).toBeTruthy();
  });

  it("writes the pairing code to the clipboard when copy is clicked", async () => {
    mockInvoke.mockResolvedValueOnce({ userCode: "ABCD-EFGH" });
    mockWriteText.mockResolvedValueOnce(undefined);
    renderConnectAccount(createTestStore({ paired: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect to account" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });
    expect(mockWriteText).toHaveBeenCalledWith("ABCD-EFGH");
  });
});

describe("ConnectAccount — connected state (paired=true)", () => {
  it('shows "Connected as <user>" when paired', () => {
    const store = createTestStore({ paired: true, pairedUserName: "Alice" });
    renderConnectAccount(store);
    expect(screen.getByText("Connected as Alice")).toBeTruthy();
  });

  it('"Connected as <user>" is in an aria-live="polite" region', () => {
    const store = createTestStore({ paired: true, pairedUserName: "Alice" });
    renderConnectAccount(store);
    const connectedText = screen.getByText("Connected as Alice");
    expect(connectedText.closest('[aria-live="polite"]')).toBeTruthy();
  });

  it("shows Disconnect button when paired", () => {
    const store = createTestStore({ paired: true, pairedUserName: "Alice" });
    renderConnectAccount(store);
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("invokes pairingDisconnect when Disconnect is clicked", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const store = createTestStore({ paired: true, pairedUserName: "Alice" });
    renderConnectAccount(store);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(PAIRING_DISCONNECT);
  });
});

describe("ConnectAccount — error state", () => {
  function setupWithPairingError() {
    let capturedCallback: ((payload: { reason: string }) => void) | null = null;
    mockOn.mockImplementation((channel: string, cb: (payload: { reason: string }) => void) => {
      if (channel === ON_PAIRING_ERROR) capturedCallback = cb;
      return jest.fn();
    });
    const result = renderConnectAccount(createTestStore({ paired: false }));
    return { ...result, firePairingError: (reason: string) => capturedCallback!({ reason }) };
  }

  it("shows an expired message when ON_PAIRING_ERROR fires with reason expired", async () => {
    const { firePairingError } = setupWithPairingError();
    await act(async () => {
      firePairingError("expired");
    });
    expect(screen.getByText(/expired/i)).toBeTruthy();
  });

  it("shows a declined message when ON_PAIRING_ERROR fires with reason declined", async () => {
    const { firePairingError } = setupWithPairingError();
    await act(async () => {
      firePairingError("declined");
    });
    expect(screen.getByText(/declined/i)).toBeTruthy();
  });

  it('error message is in an aria-live="assertive" region', async () => {
    const { firePairingError } = setupWithPairingError();
    await act(async () => {
      firePairingError("expired");
    });
    const errorEl = screen.getByText(/expired/i);
    expect(errorEl.closest('[aria-live="assertive"]')).toBeTruthy();
  });

  it('shows "Try again" button in error state', async () => {
    const { firePairingError } = setupWithPairingError();
    await act(async () => {
      firePairingError("expired");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it('returns to idle when "Try again" is clicked', async () => {
    const { firePairingError } = setupWithPairingError();
    await act(async () => {
      firePairingError("expired");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByRole("button", { name: "Connect to account" })).toBeTruthy();
  });
});

describe("ConnectAccount — IPC subscription lifecycle", () => {
  it("subscribes to ON_PAIRING_ERROR on mount", () => {
    renderConnectAccount(createTestStore({ paired: false }));
    expect(mockOn).toHaveBeenCalledWith(ON_PAIRING_ERROR, expect.any(Function));
  });

  it("unsubscribes from ON_PAIRING_ERROR on unmount", () => {
    const unsubscribe = jest.fn();
    mockOn.mockReturnValue(unsubscribe);
    const { unmount } = renderConnectAccount(createTestStore({ paired: false }));
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
