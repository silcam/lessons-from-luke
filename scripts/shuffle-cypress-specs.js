#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function getSpecFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.spec.js'))
    .map(e => path.join(e.parentPath ?? e.path, e.name));
}

const specs = getSpecFiles('cypress/integration');

for (let i = specs.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [specs[i], specs[j]] = [specs[j], specs[i]];
}

process.stdout.write(specs.join(','));
