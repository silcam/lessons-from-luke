import React from "react";
import ReactDOM from "react-dom";

import App from "./components/App";

// const mainElement = document.getElementById("root");
// Create main element
const mainElement = document.createElement("div");
document.body.appendChild(mainElement);

// Render components
ReactDOM.render(<App heading="Web!" />, mainElement);
