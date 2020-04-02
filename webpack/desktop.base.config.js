const baseConfig = require("./base.config");

module.exports = {
  ...baseConfig,
  entry: { desktop: "./src/frontend/desktopApp.tsx" },
  target: "electron-renderer"
};
