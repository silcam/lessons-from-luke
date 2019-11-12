import React, { useState } from "react";
import ReactDOM from "react-dom";
import PlatformContext from "./common/PlatformContext";
import { BrowserRouter } from "react-router-dom";
import MainRouter from "./web/MainRouter";
import ErrorContext, { ACError } from "./common/ErrorContext";
import I18nContext, { Locale } from "./common/I18nContext";
import { APIContext } from "./api/useAPI";
import WebAPI from "./web/common/WebAPI";

function WebApp() {
  const [error, setError] = useState<ACError | null>(null);
  const [locale, setLocale] = useState<Locale>("en");

  return (
    <BrowserRouter>
      <PlatformContext.Provider value="web">
        <ErrorContext.Provider value={{ error, setError }}>
          <I18nContext.Provider value={{ locale, setLocale }}>
            <APIContext.Provider value={WebAPI}>
              <MainRouter />
            </APIContext.Provider>
          </I18nContext.Provider>
        </ErrorContext.Provider>
      </PlatformContext.Provider>
    </BrowserRouter>
  );
}

// const mainElement = document.getElementById("root");
// Create main element
const mainElement = document.createElement("div");
document.body.appendChild(mainElement);

// Render components
ReactDOM.render(<WebApp />, mainElement);
