/// <reference types="jest" />

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

import fs from "fs";
import { resolveTemplatePath, validateTemplateAsset } from "./quarterStylesTemplate";

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

test("validateTemplateAsset does not throw when the file exists and is non-empty", () => {
  existsSyncMock.mockReturnValue(true);
  statSyncMock.mockReturnValue({ size: 1234 });

  expect(() => validateTemplateAsset("/some/path/quarter-styles-template.odt")).not.toThrow();
});
