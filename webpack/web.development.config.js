const HtmlWebpackPlugin = require("html-webpack-plugin");
const baseConfig = require("./web.base.config");
const path = require("path");

// Dev parity for the ENFORCE_WEB_AUTH flag: production serves the meta tag from
// the Express catch-all (per request), but dev HTML comes from webpack-dev-server,
// so we bake the tag in here instead. Semantics mirror
// src/server/util/webEnforcementFlag.ts — unset/empty/"0" → off — but the value
// is fixed at dev-server start, not per request. The production webpack build
// (web.production.config.js) must NOT emit this tag: the server injects it there.
const rawEnforceWebAuth = process.env.ENFORCE_WEB_AUTH;
const enforceWebAuth = !rawEnforceWebAuth || rawEnforceWebAuth === "0" ? "0" : "1";

module.exports = {
  ...baseConfig,
  mode: "development",
  devtool: "inline-source-map",
  devServer: {
    static: false,
    port: 8080,
    proxy: [{ context: ["/api", "/webified"], target: "http://localhost:8081" }],
    historyApiFallback: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "Lessons from Luke",
      meta: { "enforce-web-auth": enforceWebAuth },
    }),
  ],
  output: {
    filename: "web.bundle.js",
    path: path.resolve(__dirname, "..", "dist", "frontend"),
    publicPath: "/",
  },
};
