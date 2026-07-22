/// <reference types="jest" />

/**
 * RED (US3): LibreOffice round-trip integration test for the reference
 * splitter (spec.md FR-008, SC-004; plan.md Decision 3, Testing section).
 * Opt-in, `yarn test:integration` only (real `soffice`, serialized) —
 * mirrors assembleQuarter.integration.test.ts's golden-reference pattern:
 * PDF render + `pdftotext -layout` text extraction, not a byte-for-byte
 * ODT diff.
 *
 * IMPORTANT — soffice hangs inside the default Bash sandbox; this file (and
 * the jest run driving it) MUST be executed with the sandbox disabled.
 *
 * Fixture: `test/docs/serverDocs/Luke-1-02v03.odt`, a real admin-uploaded
 * master already containing a residual unsplit reference —
 * `<text:p text:style-name="Lesson_20_Title_20_Scrip_20_Reference">Luke
 * 1:26–38</text:p>` — a single text run with no `<text:s/>` marker, matching
 * the exact corpus shape `splitUnsplitReferences` targets. Treated as a
 * strictly read-only input; all work happens on tmp copies.
 *
 * Two assertions:
 *  1. Round-trip fidelity (FR-008/SC-004): render the untouched original and
 *     the split output to PDF and extract text via `pdftotext -layout`; the
 *     visible text must be identical — splitting the reference into a
 *     book-name run + `<text:s/>` + numeric run must not change what a
 *     reader sees.
 *  2. Idempotency (FR-009): running the splitter a second time on its own
 *     output must produce zero further change — diff the two splitter
 *     outputs' `content.xml` and assert they are identical.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { unzip } from "../../core/util/fsUtils";
import { splitReferencesInDocument } from "./referenceSplitter";

// The real merge/render comfortably exceeds Jest's 5s default; give the
// soffice conversions (two per test) generous headroom.
jest.setTimeout(120_000);

const FIXTURE_PATH = path.join(process.cwd(), "test", "docs", "serverDocs", "Luke-1-02v03.odt");

// Convert both `.odt` files to PDF in a single `soffice` invocation, sharing
// one profile dir. Two separate `soffice --convert-to` process launches
// against the same fresh profile were observed to occasionally render the
// *entire* document shifted by one column-width uniformly (not localized to
// the split reference), i.e. process-level render nondeterminism unrelated
// to the splitter's own output. Converting both inputs in one soffice
// process/session removes that source of variance so the comparison below
// stays sensitive only to genuine differences the splitter introduces.
function convertBothToPdf(
  originalOdtPath: string,
  splitOdtPath: string,
  workDir: string,
  profileDir: string
): { originalPdfPath: string; splitPdfPath: string } {
  const outDir = path.join(workDir, "pdf-out");
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(
    "soffice",
    [
      "--headless",
      "--norestore",
      "--nologo",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      originalOdtPath,
      splitOdtPath,
    ],
    { timeout: 60_000 }
  );
  const originalPdfPath = path.join(outDir, `${path.basename(originalOdtPath, ".odt")}.pdf`);
  const splitPdfPath = path.join(outDir, `${path.basename(splitOdtPath, ".odt")}.pdf`);
  if (!fs.existsSync(originalPdfPath)) {
    throw new Error(`soffice --convert-to pdf did not produce ${originalPdfPath}`);
  }
  if (!fs.existsSync(splitPdfPath)) {
    throw new Error(`soffice --convert-to pdf did not produce ${splitPdfPath}`);
  }
  return { originalPdfPath, splitPdfPath };
}

function pdfToText(pdfPath: string): string {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
}

function readContentXml(odtPath: string, workDir: string): string {
  const extractDir = path.join(workDir, `extract-${path.basename(odtPath, ".odt")}-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  unzip(odtPath, extractDir);
  return fs.readFileSync(path.join(extractDir, "content.xml"), "utf8");
}

describe("referenceSplitter (real soffice round-trip, US3 FR-008/FR-009/SC-004)", () => {
  let workDir: string;
  let originalCopyPath: string;
  let splitOnceOutputPath: string;
  let splitTwiceOutputPath: string;

  beforeAll(() => {
    // Confirm the external toolchain this test depends on is actually
    // present BEFORE doing any work, so a missing dependency fails loudly
    // and immediately rather than mid-conversion.
    execFileSync("soffice", ["--version"]);
    execFileSync("pdftotext", ["-v"]);

    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "referenceSplitter-integration-"));

    // Never touch the checked-in fixture in place — copy it first.
    originalCopyPath = path.join(workDir, "original.odt");
    fs.copyFileSync(FIXTURE_PATH, originalCopyPath);

    splitOnceOutputPath = path.join(workDir, "split-once.odt");
    splitReferencesInDocument(originalCopyPath, splitOnceOutputPath);

    splitTwiceOutputPath = path.join(workDir, "split-twice.odt");
    splitReferencesInDocument(splitOnceOutputPath, splitTwiceOutputPath);
  });

  it("renders visually/textually identical to the original after splitting the residual unsplit reference (FR-008, SC-004)", () => {
    const sharedProfileDir = path.join(workDir, "profile-shared");
    const { originalPdfPath, splitPdfPath } = convertBothToPdf(
      originalCopyPath,
      splitOnceOutputPath,
      workDir,
      sharedProfileDir
    );

    const originalText = pdfToText(originalPdfPath);
    const splitText = pdfToText(splitPdfPath);

    expect(splitText).toBe(originalText);
  });

  it("is idempotent: splitting an already-split document a second time produces zero further change (FR-009)", () => {
    const contentXmlAfterFirstSplit = readContentXml(splitOnceOutputPath, workDir);
    const contentXmlAfterSecondSplit = readContentXml(splitTwiceOutputPath, workDir);

    expect(contentXmlAfterSecondSplit).toBe(contentXmlAfterFirstSplit);
  });
});
