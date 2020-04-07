const baseConfig = require("./web.base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  mode: "production",
  output: {
    filename: "web.[hash].bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/"
  }
};
