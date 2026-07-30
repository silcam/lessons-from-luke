import fs from "fs";
import path from "path";
import { MODULE1_XBA } from "./module1Xba";

/**
 * Drift guard: module1Xba.ts embeds Module1.xba as a string so the injected
 * LibreOffice Basic macro survives every build layout (dev-flat dist,
 * prod-nested dist, jest source) without tsc copying the .xba asset. If the
 * .xba is edited without regenerating the constant (scripts/genMacroConstant.js),
 * the runtime would silently ship a stale macro — this catches that. (US2/FR-004:
 * covers the TemplateFail error-trap edit staying in sync with the constant.)
 */
describe("MODULE1_XBA embedded macro constant", () => {
  it("matches the Module1.xba source of truth verbatim", () => {
    const xba = fs.readFileSync(path.join(__dirname, "Module1.xba"), "utf8");
    expect(MODULE1_XBA).toBe(xba);
  });
});
