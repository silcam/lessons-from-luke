/// <reference types="jest" />

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

import fs from "fs";
import {
  isMonolingualTemplatePath,
  resolveTemplatePath,
  validateTemplateAsset,
} from "./quarterStylesTemplate";

const existsSyncMock = fs.existsSync as unknown as jest.Mock;
const statSyncMock = fs.statSync as unknown as jest.Mock;

afterEach(() => {
  existsSyncMock.mockReset();
  statSyncMock.mockReset();
});

test("resolveTemplatePath returns the bilingual asset path by default, with no I/O", () => {
  const result = resolveTemplatePath();

  expect(result).toBe(`${process.cwd()}/assets/quarter-styles-template.odt`);
  expect(existsSyncMock).not.toHaveBeenCalled();
  expect(statSyncMock).not.toHaveBeenCalled();
});

test("resolveTemplatePath(false) returns the bilingual asset path, with no I/O", () => {
  const result = resolveTemplatePath(false);

  expect(result).toBe(`${process.cwd()}/assets/quarter-styles-template.odt`);
  expect(existsSyncMock).not.toHaveBeenCalled();
  expect(statSyncMock).not.toHaveBeenCalled();
});

test("resolveTemplatePath(true) returns the monolingual asset path, with no I/O", () => {
  const result = resolveTemplatePath(true);

  expect(result).toBe(`${process.cwd()}/assets/quarter-styles-template-monolingual.odt`);
  expect(existsSyncMock).not.toHaveBeenCalled();
  expect(statSyncMock).not.toHaveBeenCalled();
});

test("validateTemplateAsset throws the curated message when the file is missing", () => {
  existsSyncMock.mockReturnValue(false);

  expect(() => validateTemplateAsset("/some/path/quarter-styles-template.odt")).toThrow(
    "quarter styles template asset is missing or unreadable"
  );
});

test("validateTemplateAsset throws the curated message when the file is zero-length", () => {
  existsSyncMock.mockReturnValue(true);
  statSyncMock.mockReturnValue({ size: 0 });

  expect(() => validateTemplateAsset("/some/path/quarter-styles-template.odt")).toThrow(
    "quarter styles template asset is missing or unreadable"
  );
});

test("isMonolingualTemplatePath is true for a path whose basename is the monolingual template filename", () => {
  expect(isMonolingualTemplatePath("/any/dir/quarter-styles-template-monolingual.odt")).toBe(true);
});

test("isMonolingualTemplatePath is false for the bilingual template filename", () => {
  expect(isMonolingualTemplatePath("/any/dir/quarter-styles-template.odt")).toBe(false);
});

test("isMonolingualTemplatePath is false for other basenames (bilingual template-swap fixtures)", () => {
  expect(isMonolingualTemplatePath("/fixtures/swap-template.odt")).toBe(false);
  expect(isMonolingualTemplatePath("/fixtures/some-other.odt")).toBe(false);
});

test("validateTemplateAsset does not throw when the file exists and is non-empty", () => {
  existsSyncMock.mockReturnValue(true);
  statSyncMock.mockReturnValue({ size: 1234 });

  expect(() => validateTemplateAsset("/some/path/quarter-styles-template.odt")).not.toThrow();
});

/**
 * 017 FR-004/SC-005, contracts/pagination-and-assembly.md §1: neither
 * committed template asset may carry a `text:page-adjust` offset anywhere.
 * Today each asset carries exactly one occurrence, on the `Front_20_matter`
 * master's footer page-number field (`-1` bilingual, `-2` monolingual) — so
 * this is RED until that attribute is removed from both assets.
 *
 * Reads the REAL committed `.odt` files (not the mocked `fs` module this
 * file otherwise uses for the path-resolution tests above) via
 * `jest.requireActual("fs")` and the real `unzip` binary, matching the
 * extraction technique `assembleQuarter.integration.test.ts` already uses.
 */
describe("committed template assets carry no text:page-adjust offset (017 FR-004/SC-005)", () => {
  const realFs = jest.requireActual("fs") as typeof fs;

  const { execFileSync } = jest.requireActual("child_process") as typeof import("child_process");

  const os = jest.requireActual("os") as typeof import("os");

  const path = jest.requireActual("path") as typeof import("path");

  function extractStylesXml(assetPath: string): string {
    const workDir = realFs.mkdtempSync(path.join(os.tmpdir(), "quarter-styles-template-asset-"));
    try {
      execFileSync("unzip", ["-o", "-q", assetPath, "styles.xml", "-d", workDir]);
      return realFs.readFileSync(path.join(workDir, "styles.xml"), "utf8");
    } finally {
      realFs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  test("assets/quarter-styles-template.odt (bilingual) contains no text:page-adjust anywhere", () => {
    const assetPath = path.join(process.cwd(), "assets", "quarter-styles-template.odt");
    expect(realFs.existsSync(assetPath)).toBe(true);

    const stylesXml = extractStylesXml(assetPath);

    expect(stylesXml).not.toContain("text:page-adjust");
  });

  test("assets/quarter-styles-template-monolingual.odt contains no text:page-adjust anywhere", () => {
    const assetPath = path.join(process.cwd(), "assets", "quarter-styles-template-monolingual.odt");
    expect(realFs.existsSync(assetPath)).toBe(true);

    const stylesXml = extractStylesXml(assetPath);

    expect(stylesXml).not.toContain("text:page-adjust");
  });
});
