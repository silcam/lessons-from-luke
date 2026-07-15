import React from "react";
import { createRoot } from "react-dom/client";
import PlatformContext from "./common/PlatformContext";
import { BrowserRouter } from "react-router-dom";
import MainRouter from "./web/MainRouter";
import { Provider } from "react-redux";
import store from "./common/state/appState";
import RequestContext, { GetRequest, PostRequest } from "./common/api/RequestContext";
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
  // webGet / webPost are typed against GetRoute (web-only routes) while RequestContext
  // uses AllGetRoute so common components can call desktop-only routes on desktop.
  // In the web app, PlatformContext guards prevent desktop-only calls at runtime —
  // no web component calls /api/syncState etc. in practice.
  //
  // Wrapper functions bridge the GetRoute → AllGetRoute constraint gap without the
  // `as unknown as` double-cast. The `any`-typed params are intentional: the outer
  // GetRequest / PostRequest annotations preserve full call-site type safety; only
  // the implementation side is relaxed to accommodate the narrower webGet signature.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxGet: GetRequest = (route: any, params: any) => webGet(route, params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxPost: PostRequest = (route: any, params: any, data: any) => webPost(route, params, data);

  return (
    <Provider store={store}>
      <BrowserRouter>
        <PlatformContext.Provider value="web">
          <RequestContext.Provider value={{ get: ctxGet, post: ctxPost }}>
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
