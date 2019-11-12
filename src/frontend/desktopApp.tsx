import React from "react";
import ReactDOM from "react-dom";

import PlatformContext from "./common/PlatformContext";

// const mainElement = document.getElementById("root");
// Create main element
const mainElement = document.createElement("div");
document.body.appendChild(mainElement);

// Render components
ReactDOM.render(
  <PlatformContext.Provider value="desktop">
    <div>
      <h1>Desktop!</h1>
    </div>
  </PlatformContext.Provider>,
  mainElement
);
