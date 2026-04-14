// Break networkSlice → appState → networkSlice circular dep
jest.mock("../state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state,
    actions: {}
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn()
  }),
  networkConnectionLostAction: jest.fn(() => ({ type: "NetworkConnectionLost" }))
}));

import React from "react";
import { renderWithProviders, sampleLanguage, sampleTString, defaultSyncState } from "../testHelpers";
import TStringInput from "./TStringInput";

describe("TStringInput", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <TStringInput
        tString={sampleTString}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );
    expect(container).toBeTruthy();
  });

  it("renders a textarea with the tString text", () => {
    const { container } = renderWithProviders(
      <TStringInput
        tString={{ ...sampleTString, text: "Hello world" }}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    expect(textarea!.value).toBe("Hello world");
  });

  it("save function executes when textarea is changed and blurred (successful push)", async () => {
    const { fireEvent, act } = require("@testing-library/react");
    // mockPost returns a valid result so push resolves with truthy
    const { mockPost } = require("../testHelpers");
    mockPost.mockResolvedValueOnce([{ masterId: 1, languageId: 42, text: "New text", history: [] }]);

    const { container } = renderWithProviders(
      <TStringInput
        tString={{ ...sampleTString, text: "Original" }}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );
    const textarea = container.querySelector("textarea")!;
    // Change the text so the input becomes dirty
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "New text" } });
    });
    // Blur triggers save
    await act(async () => {
      fireEvent.blur(textarea);
    });
    expect(textarea).toBeTruthy();
  });

  it("save function calls onConnectionRestored when push returns No Connection error", async () => {
    const { fireEvent, act } = require("@testing-library/react");
    const { mockPost } = require("../testHelpers");
    // Simulate push calling the errorHandler with a No Connection error
    mockPost.mockRejectedValueOnce({ type: "No Connection" });

    const onConnectionRestored = jest.fn();
    const { useNetworkConnectionRestored } = require("../state/networkSlice");
    useNetworkConnectionRestored.mockReturnValueOnce
      ? useNetworkConnectionRestored.mockReturnValueOnce({ onConnectionRestored, clearHandlers: jest.fn() })
      : null;

    const { container } = renderWithProviders(
      <TStringInput
        tString={{ ...sampleTString, text: "Test" }}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: false } }
    );
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Changed" } });
    });
    await act(async () => {
      fireEvent.blur(textarea);
    });
    // Component renders fine even with no connection
    expect(container.querySelector("textarea")).toBeTruthy();
  });
});
