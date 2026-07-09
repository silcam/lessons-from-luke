#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function getSpecFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  return (
    entries
      // Match cypress.config.js specPattern ("**/*.spec.{js,ts}"). Globbing only
      // *.spec.js silently drops TypeScript specs (e.g. password-reset.spec.ts) from
      // the randomized CI run, so they never execute and never gate a merge.
      .filter((e) => e.isFile() && /\.spec\.(js|ts)$/.test(e.name))
      .map((e) => path.join(e.parentPath ?? e.path, e.name))
  );
}

const specs = getSpecFiles("cypress/integration");

for (let i = specs.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [specs[i], specs[j]] = [specs[j], specs[i]];
}

process.stdout.write(specs.join(","));
