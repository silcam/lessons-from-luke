const HtmlWebpackPlugin = require("html-webpack-plugin");
const baseConfig = require("./base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  entry: "./src/frontend/desktopApp.tsx",
  plugins: [
    new HtmlWebpackPlugin({
      title: "Lessons from Luke",
      filename: "desktop.html"
    })
  ],
  target: "electron-renderer",
  output: {
    filename: "desktop.bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/"
  }
};
