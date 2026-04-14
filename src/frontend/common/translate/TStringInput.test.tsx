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
  networkConnectionLostAction: jest.fn()
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
});
