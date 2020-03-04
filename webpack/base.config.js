const HtmlWebpackPlugin = require("html-webpack-plugin");
// const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: {
    desktop: "./src/frontend/desktopApp.tsx",
    web: "./src/frontend/webApp.tsx"
  },
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
