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
      // A bare `fs.rename`/`renameSync` fails EXDEV across filesystems, and
      // that failure hides in development and surfaces in CI or production:
      // on macOS `/tmp`, `docs/` and the workspace share a device; inside a
      // CI container — or on a host where `docs/` is its own mount — they do
      // not. `moveFileSync` (src/core/util/fsUtils.ts) falls back to a copy.
      // A genuine same-directory ATOMIC replace is the one legitimate
      // exception: disable inline WITH a comment saying why (see
      // `LocalStorage.writeTextFile`).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name=/^(fs|fsPromises)$/][property.name=/^rename(Sync)?$/]",
          message:
            "Use moveFileSync from src/core/util/fsUtils — a bare fs.rename fails EXDEV across filesystems (passes locally, fails in CI containers).",
        },
        {
          selector: "MemberExpression[object.property.name='promises'][property.name='rename']",
          message:
            "Use moveFileSync from src/core/util/fsUtils — a bare fs.rename fails EXDEV across filesystems (passes locally, fails in CI containers).",
        },
      ],
      // Downgraded pending opportunistic refactor — too many call sites to
      // gate commits on. New violations should still be addressed during
      // touched-file work.
      "@typescript-eslint/no-explicit-any": "warn",
      // `_`-prefix marks intentionally unused (interface conformance, etc.)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // CommonJS .js and .cjs files (configs, scripts, webpack, migrations, mocks, root tooling)
  {
    files: [
      "**/*.config.js",
      "**/*Sequencer.js",
      "webpack/**/*.js",
      "scripts/**/*.js",
      "scripts/**/*.cjs",
      "migrations/**/*.js",
      "__mocks__/**/*.js",
      // All `.cjs` are CommonJS by definition (Jest shims under any
      // src/**/__mocks__, root tooling, etc.) — match them everywhere so a new
      // mock dir can't fall through to the default config (no node globals →
      // `'module' is not defined`). CI's `eslint .` lints these even though
      // lint-staged's `**/*.{ts,tsx}` glob never does.
      "**/*.cjs",
      "*.js",
    ],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      // Same `_`-prefix = intentionally-unused convention as the TS block above.
      // CJS shims (e.g. no-op better-auth plugin mocks) name unused factory args
      // `_opts` for interface conformance; without this the base rule flags them.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // `moveFileSync` itself is the one place allowed to call `fs.renameSync`.
  {
    files: ["src/core/util/fsUtils.ts"],
    rules: { "no-restricted-syntax": "off" },
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
    files: ["cypress/**/*.{js,ts}"],
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
