const baseConfig = require("./base.config");
const path = require("path");

module.exports = {
  ...baseConfig,
  mode: "development",
  devtool: "inline-source-map",
  devServer: {
    contentBase: false,
    port: 8080,
    proxy: {
      "/api": "http://localhost:8081",
      "/webified": "http://localhost:8081"
    },
    historyApiFallback: true
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/"
  }
};
