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
import { render, act } from "@testing-library/react";
import { Provider } from "react-redux";
import {
  MemoryRouter,
  Routes,
  Route,
  Link,
  useNavigate
} from "react-router-dom";
import { buildStore } from "../testHelpers";
import bannerSlice from "./bannerSlice";
import { AppBanner } from "./Banner";
import { useClearBannersOnNavigation } from "./useClearBannersOnNavigation";

const errorBanner: AppBanner = {
  type: "Error",
  error: { type: "HTTP", status: 504 }
};

function HookHost() {
  useClearBannersOnNavigation();
  return null;
}

function PageWithNavigateButton(props: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(props.to)}>{props.label}</button>
  );
}

describe("useClearBannersOnNavigation", () => {
  it("dispatches bannerSlice.reset() when location.pathname changes", () => {
    const store = buildStore({ banners: [errorBanner] });
    expect(store.getState().banners).toHaveLength(1);

    const { getByText } = render(
      <Provider store={store}>
        <MemoryRouter
          initialEntries={["/page-a"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <HookHost />
          <Routes>
            <Route
              path="/page-a"
              element={<PageWithNavigateButton to="/" label="go home" />}
            />
            <Route path="/" element={<div>home</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // Mount-time effect always fires; clear so we can observe the navigation
    // effect specifically.
    act(() => {
      store.dispatch(bannerSlice.actions.add(errorBanner));
    });
    expect(store.getState().banners).toHaveLength(1);

    act(() => {
      getByText("go home").click();
    });

    expect(store.getState().banners).toHaveLength(0);
  });

  it("does NOT clear banners when navigation goes to the same pathname", () => {
    const store = buildStore({ banners: [] });

    render(
      <Provider store={store}>
        <MemoryRouter
          initialEntries={["/page-a"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <HookHost />
          <Routes>
            <Route
              path="/page-a"
              element={<PageWithNavigateButton to="/page-a" label="stay" />}
            />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // After mount, set a banner and try to navigate to the same path.
    act(() => {
      store.dispatch(bannerSlice.actions.add(errorBanner));
    });
    expect(store.getState().banners).toHaveLength(1);

    // useNavigate to the same pathname shouldn't change location.pathname,
    // so the effect shouldn't re-fire.
    const button = document.querySelector("button")!;
    act(() => {
      button.click();
    });

    expect(store.getState().banners).toHaveLength(1);
  });

  it("clears banners between two consecutive navigations", () => {
    const store = buildStore({ banners: [] });

    function MultiNav() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/a")}>go a</button>
          <button onClick={() => navigate("/b")}>go b</button>
        </>
      );
    }

    render(
      <Provider store={store}>
        <MemoryRouter
          initialEntries={["/start"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <HookHost />
          <MultiNav />
        </MemoryRouter>
      </Provider>
    );

    act(() => {
      store.dispatch(bannerSlice.actions.add(errorBanner));
    });
    expect(store.getState().banners).toHaveLength(1);

    act(() => {
      (document.querySelectorAll("button")[0] as HTMLButtonElement).click();
    });
    expect(store.getState().banners).toHaveLength(0);

    act(() => {
      store.dispatch(bannerSlice.actions.add(errorBanner));
    });
    expect(store.getState().banners).toHaveLength(1);

    act(() => {
      (document.querySelectorAll("button")[1] as HTMLButtonElement).click();
    });
    expect(store.getState().banners).toHaveLength(0);
  });
});
