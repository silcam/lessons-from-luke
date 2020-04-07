const baseConfig = require("./desktop.base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  mode: "production",
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "..", "dist", "desktop", "web"),
    publicPath: "/"
  }
};
