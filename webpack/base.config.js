const HtmlWebpackPlugin = require("html-webpack-plugin");
// const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const webpack = require("webpack");

module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.(jpg|png|svg)$/,
        use: "file-loader"
      }
    ]
  },
  plugins: [
    // new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      title: "Lessons from Luke",
      chunks: ["web"]
    }),
    new HtmlWebpackPlugin({
      title: "Lessons from Luke",
      filename: "desktop.html",
      chunks: ["desktop"]
    })
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  }
};
