import React from "react";
import { createRoot } from "react-dom/client";

import PlatformContext from "./common/PlatformContext";
import RequestContext from "./common/api/RequestContext";
import { ipcGet, ipcPost } from "./desktopFrontend/desktopAPIClient";
import MainPage from "./desktopFrontend/MainPage";
import { Provider } from "react-redux";
import store from "./common/state/appState";
import RootDiv from "./common/base-components/RootDiv";

// Inject base styles
document.getElementsByTagName("html")[0].style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";

// Create main element
const mainElement = document.createElement("div");
mainElement.style.height = "100%";
document.body.appendChild(mainElement);

// Render components
createRoot(mainElement!).render(
  <Provider store={store}>
    <PlatformContext.Provider value="desktop">
      <RequestContext.Provider value={{ get: ipcGet, post: ipcPost }}>
        <RootDiv>
          <MainPage />
        </RootDiv>
      </RequestContext.Provider>
    </PlatformContext.Provider>
  </Provider>
);
