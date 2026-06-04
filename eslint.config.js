import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

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
      ".specify/",
      ".claude/skills/",
      ".claude/agents/",
      ".claude/commands/",
      // TS build leakage — `src/**/*.js` is gitignored compiled output (see .gitignore)
      "src/**/*.js",
      "src/**/*.js.map",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Project-wide TypeScript rule tuning
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Downgraded pending opportunistic refactor — too many call sites to
      // gate commits on. New violations should still be addressed during
      // touched-file work.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // CommonJS .js files (configs, scripts, webpack, migrations, mocks, root tooling)
  {
    files: [
      "**/*.config.js",
      "**/*Sequencer.js",
      "webpack/**/*.js",
      "scripts/**/*.js",
      "migrations/**/*.js",
      "__mocks__/**/*.js",
      "*.js",
    ],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  // Jest test files
  {
    files: ["**/*.test.{ts,tsx}", "**/jest*.ts", "src/testSupport/**/*.ts"],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  // Node-side runtime + tooling
  {
    files: ["src/server/**", "src/desktop/**", "migrations/**"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Cypress specs and support (Mocha-style globals + cypress)
  {
    files: ["cypress/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        ...globals.browser,
        cy: "readonly",
        Cypress: "readonly",
      },
    },
  },
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
