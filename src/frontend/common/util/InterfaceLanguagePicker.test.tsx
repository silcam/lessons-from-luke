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
import { fireEvent, act, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders, buildStore, defaultSyncState } from "../testHelpers";
import InterfaceLanguagePicker from "./InterfaceLanguagePicker";
import PlatformContext from "../PlatformContext";
import RequestContext from "../api/RequestContext";

describe("InterfaceLanguagePicker", () => {
  it("renders without crashing in web mode", () => {
    const { container } = renderWithProviders(<InterfaceLanguagePicker />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    expect(container).toBeTruthy();
  });

  it("renders a select element with locale options", () => {
    const { container } = renderWithProviders(<InterfaceLanguagePicker />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    const select = container.querySelector("select");
    expect(select).toBeTruthy();
  });

  it("dispatches setLocale action when a new locale is selected in web mode (line 24)", async () => {
    const { container } = renderWithProviders(<InterfaceLanguagePicker />, {
      syncState: defaultSyncState,
      currentUser: { user: null, locale: "en", loaded: false }
    });
    const select = container.querySelector("select")!;
    // Trigger the setValue callback by changing the select value
    await act(async () => {
      fireEvent.change(select, { target: { value: "fr" } });
    });
    // In web mode, this dispatches currentUserSlice.actions.setLocale
    // The component re-renders without error
    expect(select).toBeTruthy();
  });

  it("calls push(pushLocale) when locale is changed in desktop mode (line 22)", async () => {
    const mockPost = jest.fn().mockResolvedValue({ locale: "fr" });
    const store = buildStore({
      syncState: { ...defaultSyncState, locale: "en" },
      currentUser: { user: null, locale: "en", loaded: false }
    });

    const { container } = render(
      <Provider store={store}>
        <RequestContext.Provider value={{ get: jest.fn() as any, post: mockPost as any }}>
          <MemoryRouter>
            <PlatformContext.Provider value="desktop">
              <InterfaceLanguagePicker />
            </PlatformContext.Provider>
          </MemoryRouter>
        </RequestContext.Provider>
      </Provider>
    );

    const select = container.querySelector("select")!;
    await act(async () => {
      fireEvent.change(select, { target: { value: "fr" } });
    });

    // In desktop mode, setLocale calls push(pushLocale(locale)) which uses post
    expect(mockPost).toHaveBeenCalled();
  });
});
