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
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { StdHeaderBar } from "./HeaderBar";
import { buildStore, defaultSyncState } from "../testHelpers";
import PlatformContext from "../PlatformContext";
import RequestContext from "../api/RequestContext";

function renderHeaderBar(
  props: Parameters<typeof StdHeaderBar>[0],
  platform: "web" | "desktop" = "web",
  syncState = defaultSyncState
) {
  const store = buildStore({
    syncState,
    currentUser: { user: null, locale: "en", loaded: false }
  });
  return render(
    <Provider store={store}>
      <RequestContext.Provider
        value={{ get: jest.fn() as any, post: jest.fn() as any }}
      >
        <MemoryRouter>
          <PlatformContext.Provider value={platform}>
            <StdHeaderBar {...props} />
          </PlatformContext.Provider>
        </MemoryRouter>
      </RequestContext.Provider>
    </Provider>
  );
}

describe("StdHeaderBar", () => {
  it("renders with title in web mode with link logo (line 49: logoNoLink=false, forDesktop=false)", () => {
    const { getByText } = renderHeaderBar({ title: "Test App" }, "web");
    expect(getByText("Test App")).toBeTruthy();
  });

  it("renders with logoNoLink=true (line 49: branch where no link wraps logo)", () => {
    const { getByText } = renderHeaderBar(
      { title: "Test App", logoNoLink: true },
      "web"
    );
    expect(getByText("Test App")).toBeTruthy();
  });

  it("renders in desktop mode with OfflineIndicator (lines 59-60, 79-89)", () => {
    const { getByText } = renderHeaderBar(
      { title: "Desktop App" },
      "desktop",
      { ...defaultSyncState, connected: true }
    );
    expect(getByText("Desktop App")).toBeTruthy();
  });

  it("renders OfflineIndicator in offline state (line 86-87: Online/Offline branch)", () => {
    const { getByText } = renderHeaderBar(
      { title: "Offline App" },
      "desktop",
      { ...defaultSyncState, connected: false }
    );
    expect(getByText("Offline App")).toBeTruthy();
  });

  it("renders renderRight when provided (line 60)", () => {
    const { getByText } = renderHeaderBar(
      {
        title: "App",
        renderRight: () => <span>Right Content</span>
      },
      "web"
    );
    expect(getByText("Right Content")).toBeTruthy();
  });

  it("renders null when renderRight returns null (line 60: renderRight && renderRight())", () => {
    const { getByText } = renderHeaderBar(
      {
        title: "App",
        renderRight: () => null
      },
      "web"
    );
    expect(getByText("App")).toBeTruthy();
  });
});
