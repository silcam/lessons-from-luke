const baseConfig = require("./desktop.base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  mode: "development",
  devtool: "inline-source-map",
  devServer: {
    static: false,
    port: 8082,
    proxy: [
      { context: ["/api", "/webified"], target: "http://localhost:8081" }
    ],
    historyApiFallback: true
  }
};
