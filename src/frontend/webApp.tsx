import React from "react";
import { createRoot } from "react-dom/client";
import PlatformContext from "./common/PlatformContext";
import { BrowserRouter } from "react-router-dom";
import MainRouter from "./web/MainRouter";
import { Provider } from "react-redux";
import store from "./common/state/appState";
import RequestContext from "./common/api/RequestContext";
import { webGet, webPost } from "../core/api/WebAPIClient";

// Wire the per-request CSP nonce (injected by the server as a <meta> tag in the
// document head) into webpack's runtime nonce, so styled-components stamps it on
// the <style> tags it injects at runtime. Without this, the production CSP
// (style-src with a per-request nonce and no 'unsafe-inline') blocks those styles
// and styled-components throws "CSSStyleSheet could not be found on
// HTMLStyleElement". Must run before the first render below.
declare let __webpack_nonce__: string;
const cspNonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content");
if (cspNonce) {
  __webpack_nonce__ = cspNonce;
}

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
