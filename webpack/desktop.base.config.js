const baseConfig = require("./base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  entry: { desktop: "./src/frontend/desktopApp.tsx" },
  target: "electron-renderer",
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/"
  }
};
