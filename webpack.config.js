const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
// const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  mode: "development",
  entry: {
    desktop: "./src/frontend/desktopApp.tsx",
    web: "./src/frontend/webApp.tsx"
  },
  devtool: "inline-source-map",
  devServer: {
    contentBase: false,
    port: 8080,
    proxy: {
      "/api": "http://localhost:8081"
    },
    historyApiFallback: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    // new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      title: "Output Management",
      chunks: ["web"]
    }),
    new HtmlWebpackPlugin({
      title: "Output Management",
      filename: "desktop.html",
      chunks: ["desktop"]
    })
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist", "frontend")
  }
};
