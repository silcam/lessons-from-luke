const baseProdConfig = require("./production.config");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer")
  .BundleAnalyzerPlugin;

module.exports = {
  ...baseProdConfig,
  plugins: [...baseProdConfig.plugins, new BundleAnalyzerPlugin()]
};
