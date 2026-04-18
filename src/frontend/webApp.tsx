import React from "react";
import { createRoot } from "react-dom/client";
import PlatformContext from "./common/PlatformContext";
import { BrowserRouter } from "react-router-dom";
import MainRouter from "./web/MainRouter";
import { Provider } from "react-redux";
import store from "./common/state/appState";
import RequestContext from "./common/api/RequestContext";
import { webGet, webPost } from "../core/api/WebAPIClient";

function WebApp() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <PlatformContext.Provider value="web">
          <RequestContext.Provider value={{ get: webGet, post: webPost }}>
            <MainRouter />
          </RequestContext.Provider>
        </PlatformContext.Provider>
      </BrowserRouter>
    </Provider>
  );
}

// Inject base styles
document.getElementsByTagName("html")[0].style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";

// Create main element
const mainElement = document.createElement("div");
mainElement.style.height = "100%";
document.body.appendChild(mainElement);

// Render components
createRoot(mainElement!).render(<WebApp />);
