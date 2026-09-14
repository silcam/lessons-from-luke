#!/usr/bin/env node
/**
 * Regenerate src/server/assembly/macro/module1Xba.ts from Module1.xba.
 *
 * The .xba is the source of truth; the generated .ts embeds its contents as a
 * string constant so the injected LibreOffice Basic macro survives every build
 * layout (dev-flat dist, prod-nested dist, jest source) without relying on tsc
 * to copy the non-.ts asset into dist. module1Xba.test.ts guards against drift.
 *
 * Run: node scripts/genMacroConstant.js
 */
const fs = require("fs");
const path = require("path");

const macroDir = path.join(__dirname, "..", "src", "server", "assembly", "macro");
const xba = fs.readFileSync(path.join(macroDir, "Module1.xba"), "utf8");

const header =
  "// AUTO-GENERATED — do not edit by hand.\n" +
  "// Source of truth: ./Module1.xba. Regenerate with scripts/genMacroConstant.js\n" +
  "// (drift is guarded by module1Xba.test.ts). Embedded as a string so the\n" +
  "// injected macro survives every build layout (dev-flat dist, prod-nested\n" +
  "// dist, jest source) without relying on tsc to copy the .xba asset.\n\n";
const body = `export const MODULE1_XBA = ${JSON.stringify(xba)};\n`;

fs.writeFileSync(path.join(macroDir, "module1Xba.ts"), header + body);
console.log("Regenerated module1Xba.ts from Module1.xba");
