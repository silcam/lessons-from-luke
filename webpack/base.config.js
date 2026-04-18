const webpack = require("webpack");

module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: { transpileOnly: true }
        },
        exclude: /node_modules/
      },
      {
        test: /\.(jpg|png|svg)$/,
        type: "asset/resource"
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  }
};
