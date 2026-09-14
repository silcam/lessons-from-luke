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
import { MONOLINGUAL_PARAGRAPH_STYLE_RENAMES } from "../xml/monolingualRestyle";

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

  /**
   * Both lesson-title style families must keep chapter numbering alive.
   * The footer's lesson number is a `text:chapter` field resolved from the
   * nearest level-1 outline heading, and each lesson master's hidden title
   * heading styles itself from one of two families: plain
   * `Lesson title - invisible` (Luke Q3/Q4 masters) or
   * `M.T. Lesson title - invisible` (Luke Q1/Q2 masters). The merge loads
   * template styles with `OverwriteStyles=True`, so a template whose copy of
   * either style lacks `style:default-outline-level="1"` DEMOTES that
   * family's headings to plain paragraphs — every footer then renders
   * `Quarter <Q> Lesson ` with no number and `measureLessonOneParity`'s
   * locator fails the whole assembly ("assembly failed to measure lesson 1's
   * opening page", the 2026-08 Kwasio bilingual Q3/Q4 defect).
   */
  describe.each(["quarter-styles-template.odt", "quarter-styles-template-monolingual.odt"])(
    "assets/%s keeps every lesson-title style family outline-level-1",
    (assetFilename) => {
      test('every *Lesson_20_title_20_-_20_invisible style carries style:default-outline-level="1"', () => {
        const assetPath = path.join(process.cwd(), "assets", assetFilename);
        const stylesXml = extractStylesXml(assetPath);

        // A template may legitimately OMIT a family (the monolingual asset
        // has no M.T. variant — an undefined style leaves the constituent's
        // own definition untouched); what it must never do is DEFINE one
        // without the outline level. The plain family must exist in both.
        const styleTags = stylesXml.match(
          /<style:style[^>]*style:name="[^"]*Lesson_20_title_20_-_20_invisible"[^>]*>/g
        );
        expect(styleTags).not.toBeNull();
        expect(styleTags!.length).toBeGreaterThanOrEqual(1);
        for (const tag of styleTags!) {
          expect(tag).toContain('style:default-outline-level="1"');
        }
      });
    }
  );

  /**
   * The assembled book's pagination hangs off two master pages the code
   * addresses BY NAME: `finalizeAssembledQuarter` pins each lesson's opening
   * heading to `First_20_Page` (finalizeAssembledQuarter.ts
   * FIRST_PAGE_MASTER_NAME), and `prepareConstituentForAssembly` keys its
   * TOC/front-matter break handling on automatic styles bound to
   * `Front_20_matter` (prepareConstituentForAssembly.ts). Runtime asset
   * validation only checks exists+nonzero, so renaming or deleting either
   * master in a template edit would ship silently — with wrong pagination —
   * without this guard.
   */
  describe.each(["quarter-styles-template.odt", "quarter-styles-template-monolingual.odt"])(
    "assets/%s defines the master pages the assembly pipeline addresses by name",
    (assetFilename) => {
      test.each(["First_20_Page", "Front_20_matter"])("master page %s exists", (masterName) => {
        const assetPath = path.join(process.cwd(), "assets", assetFilename);
        const stylesXml = extractStylesXml(assetPath);

        expect(stylesXml).toMatch(new RegExp(`<style:master-page[^>]*style:name="${masterName}"`));
      });
    }
  );

  /**
   * The `Lesson_20_Content` master's footer renders each page's lesson
   * number from a LIVE `text:chapter` field (resolved against the nearest
   * level-1 outline heading) and its quarter number from a live
   * `text:user-defined text:name="Quarter"` field
   * (`normalizeQuarterFieldCache` refreshes its cache per book). A template
   * edit that "fixes" the footer by typing static text in place of either
   * field has no runtime guard — every page would silently show one
   * lesson/quarter number book-wide. The assertion is scoped to the
   * `Lesson_20_Content` master-page block: the `Standard` master carries the
   * same fields, so a whole-file check would pass even after the real
   * footer lost them.
   */
  describe.each(["quarter-styles-template.odt", "quarter-styles-template-monolingual.odt"])(
    "assets/%s keeps live footer fields on the Lesson_20_Content master",
    (assetFilename) => {
      function lessonContentMasterBlock(): string {
        const assetPath = path.join(process.cwd(), "assets", assetFilename);
        const stylesXml = extractStylesXml(assetPath);
        const block = stylesXml.match(
          /<style:master-page[^>]*style:name="Lesson_20_Content"[^>]*>[\s\S]*?<\/style:master-page>/
        );
        expect(block).not.toBeNull();
        return block![0];
      }

      test("footer carries a live text:chapter lesson-number field", () => {
        expect(lessonContentMasterBlock()).toContain("<text:chapter");
      });

      test('footer carries a live text:user-defined text:name="Quarter" field', () => {
        expect(lessonContentMasterBlock()).toMatch(/<text:user-defined[^>]*text:name="Quarter"/);
      });
    }
  );

  /**
   * The monolingual restyle rewrites M.T. style references to the plain
   * targets in `MONOLINGUAL_PARAGRAPH_STYLE_RENAMES`, which only the
   * template assets define. `assertRestyleTargetsDefined` already fails the
   * assembly job at runtime when a target is missing; this promotes that to
   * a build-time failure against the committed monolingual asset.
   */
  test("assets/quarter-styles-template-monolingual.odt defines every plain restyle-target paragraph style", () => {
    const assetPath = path.join(process.cwd(), "assets", "quarter-styles-template-monolingual.odt");
    const stylesXml = extractStylesXml(assetPath);

    for (const { to } of MONOLINGUAL_PARAGRAPH_STYLE_RENAMES) {
      expect(stylesXml).toMatch(
        new RegExp(`<style:style[^>]*style:name="${to}"[^>]*style:family="paragraph"`)
      );
    }
  });
});
