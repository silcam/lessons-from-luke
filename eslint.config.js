import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "dist/",
      "dist-desktop/",
      ".desktop-build-stage/",
      "coverage/",
      "node_modules/",
      "log/",
      "strings/",
      "docs/",
      "cypress/",
      "migrations/",
      "scripts/",
      "webpack/",
      ".specify/",
      ".claude/skills/",
      ".claude/agents/",
      ".claude/commands/",
      "*.config.js",
      "*Sequencer.js",
      "build-desktop.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/frontend/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "18" } },
  },
  prettier,
];
