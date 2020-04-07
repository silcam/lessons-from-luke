const HtmlWebpackPlugin = require("html-webpack-plugin");
const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  entry: "./src/frontend/webApp.tsx",
  plugins: [
    new HtmlWebpackPlugin({
      title: "Lessons from Luke"
    })
  ]
};
