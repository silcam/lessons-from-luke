/// <reference types="jest" />

/**
 * pdfRenderOptions.test.ts — RED tests (F2a) for the shared render-oracle
 * helpers: the pinned PDF filter target, `pdfinfo` reconciliation, and the
 * page-class signature table. See contracts/pagination-and-assembly.md §3.
 *
 * These are pure-function unit tests (no `soffice`/`pdftotext`/`pdfinfo`
 * invocation) — the render-then-classify integration is covered separately
 * by assembleQuarter.integration.test.ts, which imports these same helpers
 * so a helper edit cannot silently diverge from what the real render exercises.
 */

import {
  PDF_CONVERT_TO_TARGET,
  PdfPageReconciliationError,
  reconcilePdfPages,
  classifyPage,
} from "./pdfRenderOptions";

describe("PDF_CONVERT_TO_TARGET (contract §3, IsSkipEmptyPages pinned to false)", () => {
  test("encodes IsSkipEmptyPages=false as a JSON filter-argument third field on the --convert-to target", () => {
    // The value, not just the name: IsSkipEmptyPages=false INCLUDES
    // LibreOffice's automatically-inserted blank pages. `true` would SKIP
    // them, silently shortening the PDF on books carrying an implicit
    // page-usage="left" blank (e.g. via Inside_20_cover).
    expect(PDF_CONVERT_TO_TARGET).toBe(
      'pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}'
    );
  });
});

describe("reconcilePdfPages (contract §3, pdfinfo reconciliation)", () => {
  test("pdftotext emits a trailing form feed after the last page — split yields renderedPageCount + 1 entries with an empty tail", () => {
    const fullText = "page one text\fpage two text\fpage three text\f";
    // Sanity on the raw pdftotext shape this function must reconcile.
    expect(fullText.split("\f")).toHaveLength(4);
    expect(fullText.split("\f")[3]).toBe("");
  });

  test("drops exactly the trailing empty entry, returning exactly renderedPageCount classifiable entries", () => {
    const fullText = "page one text\fpage two text\fpage three text\f";
    const pages = reconcilePdfPages(fullText, 3);
    expect(pages).toEqual(["page one text", "page two text", "page three text"]);
  });

  test("a page-count mismatch throws a curated, path-free reason rather than being silently absorbed", () => {
    const fullText = "page one text\fpage two text\fpage three text\f";
    // renderedPageCount claims 4 pages; the extraction only carries 3.
    expect(() => reconcilePdfPages(fullText, 4)).toThrow(PdfPageReconciliationError);
  });

  test("a non-empty tail (extraction did not end on the expected trailing form feed) also throws, never silently classified", () => {
    // No trailing "\f" — the last split entry is non-empty, describing a
    // document `pdftotext` did not emit the way pdfinfo's count expects.
    const fullText = "page one text\fpage two text\fpage three text";
    expect(() => reconcilePdfPages(fullText, 3)).toThrow(PdfPageReconciliationError);
  });

  test("the thrown reason never contains an absolute filesystem path", () => {
    const fullText = "page one text\fpage two text\f";
    try {
      reconcilePdfPages(fullText, 99);
      throw new Error("expected reconcilePdfPages to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PdfPageReconciliationError);
      expect((err as Error).message).not.toMatch(/\/(Users|tmp|home)\//);
    }
  });
});

describe("classifyPage (contract §3, page-class signature table)", () => {
  test("blank class: no extractable text at all after whitespace trim", () => {
    expect(classifyPage("")).toBe("blank");
  });

  test("blank class: whitespace-only text (pdftotext -layout commonly yields newlines/spaces, not the empty string) — checked BEFORE lesson-title", () => {
    expect(classifyPage("   \n  \n")).toBe("blank");
  });

  test("lesson title page class: no footer at all, but real body text (NOT the same as 'no extractable text')", () => {
    expect(classifyPage("The Prodigal Son\n\nOnce there was a man who had two sons...")).toBe(
      "lesson-title"
    );
  });

  test("coloring page class: the Quarter/Lesson marker present TWICE, no Page number, 'Lessons from Luke' present — the master's footer literally contains the run twice, once per printed half-sheet", () => {
    const footer =
      "Lessons from Luke  Quarter 2  Lesson 14  Lessons from Luke  Quarter 2  Lesson 14";
    expect(classifyPage(footer)).toBe("coloring");
  });

  test("lesson content page class: the marker present once, plus a Page number", () => {
    const footer = "Quarter 2  Lesson 14  The Prodigal Son  Page 5";
    expect(classifyPage(footer)).toBe("lesson-content");
  });

  test("front matter class: Quarter <Q> alone (no Lesson <N>), has a Page number, 'Lessons from Luke' + \"Teacher's Guide\"", () => {
    const footer = "Lessons from Luke  Teacher's Guide – Quarter 2 Page 3";
    expect(classifyPage(footer)).toBe("front-matter");
  });

  test("table of contents class: same near-identical footer as front matter, distinguished by the '– Quarter <Q>' run being absent", () => {
    const footer = "Lessons from Luke: Teacher's Guide  Page 2";
    expect(classifyPage(footer)).toBe("table-of-contents");
  });

  test("the lesson marker requires BOTH tokens on whole-token boundaries: front matter's lone 'Quarter <Q>' token must not misclassify as coloring page", () => {
    // Front_20_matter's own footer carries "Quarter <Q>" without "Lesson <N>".
    // A discriminator keyed on either token alone would classify every
    // front-matter page as coloring-page class.
    const footer = "Lessons from Luke  Teacher's Guide – Quarter 2 Page 3";
    expect(classifyPage(footer)).not.toBe("coloring");
  });

  test("whole-token boundary matching: 'Lesson 1' must not match inside 'Lesson 14' (Quarter <series> Lesson <firstLessonNumber> uses real absolute lesson numbers, never the literal '1')", () => {
    const footer = "Quarter 2  Lesson 14  Review Lesson  Page 12";
    // A substring match on "Lesson 1" would wrongly fire here; the page must
    // still classify correctly as ordinary lesson content.
    expect(classifyPage(footer)).toBe("lesson-content");
  });
});
