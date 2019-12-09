import React from "react";
import ReactDOM from "react-dom";
import PlatformContext from "./common/PlatformContext";
import { BrowserRouter } from "react-router-dom";
import MainRouter from "./web/MainRouter";
import { Provider } from "react-redux";
import store from "./common/state/appState";
import RequestContext from "./api/RequestContext";
import { webGet, webPost } from "./web/common/WebAPI";

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

// Create main element
const mainElement = document.createElement("div");
document.body.appendChild(mainElement);

// Render components
ReactDOM.render(<WebApp />, mainElement);
