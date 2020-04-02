const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  entry: {
    web: "./src/frontend/webApp.tsx"
  }
};
