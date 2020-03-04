const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  mode: "development",
  devtool: "inline-source-map",
  devServer: {
    contentBase: false,
    port: 8080,
    proxy: {
      "/api": "http://localhost:8081"
    },
    historyApiFallback: true
  }
};
