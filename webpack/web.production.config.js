const baseConfig = require("./base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  mode: "production",
  output: {
    filename: "[name].[hash].bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/"
  }
};
