/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import {
  finalizeAssembledQuarter,
  FinalizeAssembledQuarterOptions,
} from "./finalizeAssembledQuarter";
import { mkdirSafe, unlinkRecursive, unzip } from "../../core/util/fsUtils";

const NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  meta: "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
  dc: "http://purl.org/dc/elements/1.1/",
};

const workDir = "test/tmp-finalizeAssembledQuarter";

afterEach(() => {
  unlinkRecursive(workDir);
});

/**
 * Builds a minimal merged-output-shaped ODT fixture: a `styles.xml` whose
 * `text:outline-style` level-1 entry has the blank base document's EMPTY
 * `style:num-format` (the exact defect the finalization patches — chapter
 * NUMBER fields render blank against it), and a `meta.xml` with no
 * Quarter property. Packed WITHOUT mimetype-first ordering so the repack
 * assertion is meaningful.
 */
function buildMergedFixtureOdt(
  odtPath: string,
  officeTextInner = "",
  opts: { omitPlainRestyleTargets?: boolean; automaticStylesInner?: string } = {}
): void {
  const srcDir = `${workDir}/src-${path.basename(odtPath, ".odt")}`;
  mkdirSafe(workDir);
  mkdirSafe(srcDir);
  mkdirSafe(`${srcDir}/META-INF`);

  fs.writeFileSync(`${srcDir}/mimetype`, "application/vnd.oasis.opendocument.text");
  fs.writeFileSync(
    `${srcDir}/META-INF/manifest.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
  );
  fs.writeFileSync(
    `${srcDir}/content.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="P7" style:family="paragraph" style:parent-style-name="M.T._20_Lesson_20_Title"/>
    <style:style style:name="P8" style:family="paragraph" style:parent-style-name="M.T._20_Text"/>${
      opts.automaticStylesInner ?? ""
    }
  </office:automatic-styles>
  <office:body><office:text>${officeTextInner}</office:text></office:body>
</office:document-content>`
  );
  fs.writeFileSync(
    `${srcDir}/meta.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta><meta:generator>test</meta:generator><dc:title>stale title</dc:title></office:meta>
</office:document-meta>`
  );
  fs.writeFileSync(
    `${srcDir}/styles.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" office:version="1.2">
  <office:styles>
    <text:outline-style style:name="Outline">
      <text:outline-level-style text:level="1" loext:num-list-format="%1%" style:num-format=""/>
      <text:outline-level-style text:level="2" loext:num-list-format="%2%" style:num-format=""/>
    </text:outline-style>${
      opts.omitPlainRestyleTargets
        ? ""
        : `
    <style:style style:name="Lesson_20_Title" style:family="paragraph"/>
    <style:style style:name="Lesson_20_title_20_-_20_invisible" style:family="paragraph"/>
    <style:style style:name="Coloring_20_Page_20_-_20_Memory_20_Verse" style:family="paragraph"/>
    <style:style style:name="Coloring_20_Page_20_-_20_Truth" style:family="paragraph"/>`
    }
    <style:style style:name="M.T._20_Lesson_20_Title" style:family="paragraph"/>
    <style:style style:name="M.T._20_Coloring_20_Page_20_-_20_Truth" style:family="paragraph"/>
  </office:styles>
  <office:automatic-styles>
    <style:style style:name="MP1" style:family="paragraph" style:parent-style-name="M.T._20_Coloring_20_Page_20_-_20_Truth"/>
  </office:automatic-styles>
</office:document-styles>`
  );

  const absOut = path.resolve(odtPath);
  fs.rmSync(absOut, { force: true });
  execFileSync("zip", ["-r", "-X", absOut, "."], { cwd: srcDir });
}

function extractXml(
  odtPath: string,
  entry: "styles.xml" | "meta.xml" | "content.xml"
): XmlDocument {
  const extractDir = `${workDir}/extracted-${entry.replace(".xml", "")}`;
  unlinkRecursive(extractDir);
  unzip(odtPath, extractDir);
  return libxmljs2.parseXml(fs.readFileSync(`${extractDir}/${entry}`, "utf8"));
}

function listArchiveEntries(odtPath: string): { name: string; method: string }[] {
  const out = execFileSync("unzip", ["-v", odtPath], { encoding: "utf8" });
  const lines = out.split("\n").slice(3, -3);
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { method: parts[1], name: parts[parts.length - 1] };
    });
}

function defaultOptions(odtPath: string) {
  return {
    odtPath,
    series: 2,
    firstLessonNumber: 14,
    title: "Lessons from Luke",
    subject: "Teacher's Guide",
  };
}

/** Builds a content.xml `<style:style>` automatic-style fragment for a paragraph family. */
function autoStyleTag(name: string, inner: string, attrs = ""): string {
  return `<style:style style:name="${name}" style:family="paragraph"${attrs}>${inner}</style:style>`;
}

test("patches the level-1 outline style so chapter-number footer fields render: num-format 1, %1% list format, start-value = the quarter's first absolute lesson number", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const stylesDoc = extractXml(odtPath, "styles.xml");
  const level1 = stylesDoc.get<Element>("//text:outline-level-style[@text:level='1']", NAMESPACES)!;
  expect(level1.attr("num-format")!.value()).toBe("1");
  expect(level1.attr("start-value")!.value()).toBe("14");
  expect(level1.attr("num-list-format")!.value()).toBe("%1%");
});

test("leaves the other outline levels untouched", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const stylesDoc = extractXml(odtPath, "styles.xml");
  const level2 = stylesDoc.get<Element>("//text:outline-level-style[@text:level='2']", NAMESPACES)!;
  expect(level2.attr("num-format")!.value()).toBe("");
  expect(level2.attr("start-value")).toBeNull();
});

test("writes the book-level metadata the surviving live footer fields resolve against: Quarter custom property, dc:title, dc:subject (SOP §16.2)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const metaDoc = extractXml(odtPath, "meta.xml");
  const quarter = metaDoc.get<Element>("//meta:user-defined[@meta:name='Quarter']", NAMESPACES)!;
  expect(quarter.text()).toBe("2");
  expect(metaDoc.get<Element>("//dc:title", NAMESPACES)!.text()).toBe("Lessons from Luke");
  expect(metaDoc.get<Element>("//dc:subject", NAMESPACES)!.text()).toBe("Teacher's Guide");
  // No duplicate dc:title left behind (the merged doc had a stale one).
  expect(metaDoc.find<Element>("//dc:title", NAMESPACES)).toHaveLength(1);
});

test("skips writing an empty title/subject rather than blanking the merged document's metadata", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter({ ...defaultOptions(odtPath), title: "", subject: "" });

  const metaDoc = extractXml(odtPath, "meta.xml");
  expect(metaDoc.get<Element>("//dc:title", NAMESPACES)!.text()).toBe("stale title");
  expect(metaDoc.find<Element>("//dc:subject", NAMESPACES)).toHaveLength(0);
});

test("throws when the merged document has no level-1 outline style to patch (chapter numbers would silently render blank)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);
  // Corrupt the fixture: strip the outline style entirely.
  const extractDir = `${workDir}/corrupt`;
  unzip(odtPath, extractDir);
  const styles = fs
    .readFileSync(`${extractDir}/styles.xml`, "utf8")
    .replace(/<text:outline-style[\s\S]*?<\/text:outline-style>/, "");
  fs.writeFileSync(`${extractDir}/styles.xml`, styles);
  fs.rmSync(path.resolve(odtPath), { force: true });
  execFileSync("zip", ["-r", "-X", path.resolve(odtPath), "."], { cwd: extractDir });

  expect(() => finalizeAssembledQuarter(defaultOptions(odtPath))).toThrow(/outline/i);
});

test("strips the empty leading paragraph that forces a blank recto page 1 (Q1 Inside_20_cover verso master)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  // The Q1 TOC opens with an empty paragraph on the verso master, then the cover.
  buildMergedFixtureOdt(
    odtPath,
    `<text:sequence-decls/>` +
      `<text:p text:style-name="P1"><text:soft-page-break/></text:p>` +
      `<text:p text:style-name="Body">Somo kutoka kitabu cha Luka.</text:p>`
  );

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const contentDoc = extractXml(odtPath, "content.xml");
  const paragraphs = contentDoc.find<Element>("//office:text/text:p", NAMESPACES);
  expect(paragraphs).toHaveLength(1);
  expect(paragraphs[0].text().trim()).toBe("Somo kutoka kitabu cha Luka.");
});

test("removes multiple consecutive empty leading paragraphs, stopping at the first with content", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(
    odtPath,
    `<text:p text:style-name="P1"><text:soft-page-break/></text:p>` +
      `<text:p text:style-name="P2"/>` +
      `<text:p text:style-name="Body">cover</text:p>` +
      `<text:p text:style-name="Body"/>`
  );

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const contentDoc = extractXml(odtPath, "content.xml");
  const paragraphs = contentDoc.find<Element>("//office:text/text:p", NAMESPACES);
  // Both leading empties removed; the trailing empty (after content) is kept.
  expect(paragraphs.map((p) => p.text().trim())).toEqual(["cover", ""]);
});

test("leaves a non-empty first paragraph untouched (other quarters open directly on the cover)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(
    odtPath,
    `<text:p text:style-name="P1">Somo kutoka kitabu cha Luka.</text:p>`
  );

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const contentDoc = extractXml(odtPath, "content.xml");
  const paragraphs = contentDoc.find<Element>("//office:text/text:p", NAMESPACES);
  expect(paragraphs).toHaveLength(1);
  expect(paragraphs[0].text().trim()).toBe("Somo kutoka kitabu cha Luka.");
});

/**
 * Monolingual restyle (feature 014): the mono template deliberately omits
 * four M.T. paragraph styles, so a single-language assembly must restyle
 * their references to the plain equivalents.
 */
function optionsWithSingleLanguage(
  odtPath: string,
  singleLanguage: boolean
): FinalizeAssembledQuarterOptions {
  return { ...defaultOptions(odtPath), singleLanguage };
}

const MT_OFFICE_TEXT_INNER =
  `<text:h text:style-name="M.T._20_Lesson_20_Title">Yesu</text:h>` +
  `<text:p text:style-name="M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse">verse</text:p>` +
  `<text:p text:style-name="M.T._20_Text">body</text:p>`;

test("singleLanguage: true restyles M.T. references in BOTH content.xml and styles.xml to the plain styles", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath, MT_OFFICE_TEXT_INNER);

  finalizeAssembledQuarter(optionsWithSingleLanguage(odtPath, true));

  const contentDoc = extractXml(odtPath, "content.xml");
  const heading = contentDoc.get<Element>("//text:h", NAMESPACES)!;
  expect(heading.attr("style-name")!.value()).toBe("Lesson_20_Title");
  const verse = contentDoc.get<Element>("//office:text/text:p[1]", NAMESPACES)!;
  expect(verse.attr("style-name")!.value()).toBe("Coloring_20_Page_20_-_20_Memory_20_Verse");
  const p7 = contentDoc.get<Element>("//style:style[@style:name='P7']", NAMESPACES)!;
  expect(p7.attr("parent-style-name")!.value()).toBe("Lesson_20_Title");
  // Out-of-scope M.T. Text stays, in content refs and auto-style parents alike.
  const body = contentDoc.get<Element>("//office:text/text:p[2]", NAMESPACES)!;
  expect(body.attr("style-name")!.value()).toBe("M.T._20_Text");
  const p8 = contentDoc.get<Element>("//style:style[@style:name='P8']", NAMESPACES)!;
  expect(p8.attr("parent-style-name")!.value()).toBe("M.T._20_Text");

  const stylesDoc = extractXml(odtPath, "styles.xml");
  const mp1 = stylesDoc.get<Element>("//style:style[@style:name='MP1']", NAMESPACES)!;
  expect(mp1.attr("parent-style-name")!.value()).toBe("Coloring_20_Page_20_-_20_Truth");
  // Definitions are never renamed.
  const defNames = stylesDoc
    .find<Element>("//office:styles/style:style", NAMESPACES)
    .map((el) => el.attr("name")!.value());
  expect(defNames).toContain("M.T._20_Lesson_20_Title");
});

test("singleLanguage: false leaves every M.T. reference intact (bilingual output byte-for-byte unaffected)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath, MT_OFFICE_TEXT_INNER);

  finalizeAssembledQuarter(optionsWithSingleLanguage(odtPath, false));

  const contentDoc = extractXml(odtPath, "content.xml");
  expect(contentDoc.get<Element>("//text:h", NAMESPACES)!.attr("style-name")!.value()).toBe(
    "M.T._20_Lesson_20_Title"
  );
  const stylesDoc = extractXml(odtPath, "styles.xml");
  const mp1 = stylesDoc.get<Element>("//style:style[@style:name='MP1']", NAMESPACES)!;
  expect(mp1.attr("parent-style-name")!.value()).toBe("M.T._20_Coloring_20_Page_20_-_20_Truth");
});

test("omitting singleLanguage defaults to bilingual — M.T. references intact", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath, MT_OFFICE_TEXT_INNER);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const contentDoc = extractXml(odtPath, "content.xml");
  expect(contentDoc.get<Element>("//text:h", NAMESPACES)!.attr("style-name")!.value()).toBe(
    "M.T._20_Lesson_20_Title"
  );
});

test("singleLanguage: true throws loudly when a plain restyle target is missing from styles.xml (template-asset regression)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath, MT_OFFICE_TEXT_INNER, { omitPlainRestyleTargets: true });

  expect(() => finalizeAssembledQuarter(optionsWithSingleLanguage(odtPath, true))).toThrow(
    /restyle/i
  );
});

/**
 * Lesson-opening master-page normalization (feature 014, workstream 2):
 * every visible level-1 heading whose content.xml automatic style lacks a
 * `style:master-page-name` must get `First_20_Page`, in BOTH modes — the
 * production Luke-1-09 constituent ships the defect (break-before only),
 * which makes the whole lesson inherit the previous page's master.
 */
describe("lesson-opening master-page normalization", () => {
  function autoStyle(name: string, inner: string, attrs = ""): string {
    return `<style:style style:name="${name}" style:family="paragraph"${attrs}>${inner}</style:style>`;
  }

  test("adds master-page-name First_20_Page to a level-1 opening whose auto style has only fo:break-before (the Lesson-9 defect shape), keeping the break", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="P20" text:outline-level="1">Somo 9</text:h>`,
      {
        automaticStylesInner: autoStyle(
          "P20",
          `<style:paragraph-properties fo:break-before="page"/>`
        ),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const p20 = contentDoc.get<Element>("//style:style[@style:name='P20']", NAMESPACES)!;
    expect(p20.attr("master-page-name")!.value()).toBe("First_20_Page");
    const props = p20.get<Element>("style:paragraph-properties", NAMESPACES)!;
    expect(props.attr("break-before")!.value()).toBe("page");
  });

  test("normalizes an opening whose auto style lacks BOTH master-page-name and break-before (outline-level attribute absent = level 1)", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(odtPath, `<text:h text:style-name="P21">Somo 10</text:h>`, {
      automaticStylesInner: autoStyle("P21", ""),
    });

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const p21 = contentDoc.get<Element>("//style:style[@style:name='P21']", NAMESPACES)!;
    expect(p21.attr("master-page-name")!.value()).toBe("First_20_Page");
  });

  test("leaves an already-correct opening untouched and preserves an existing non-First-Page master", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="P22" text:outline-level="1">Somo 1</text:h>` +
        `<text:h text:style-name="P23" text:outline-level="1">Somo 2</text:h>`,
      {
        automaticStylesInner:
          autoStyle("P22", "", ` style:master-page-name="First_20_Page"`) +
          autoStyle("P23", "", ` style:master-page-name="Inside_20_cover"`),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const p22 = contentDoc.get<Element>("//style:style[@style:name='P22']", NAMESPACES)!;
    expect(p22.attr("master-page-name")!.value()).toBe("First_20_Page");
    const p23 = contentDoc.get<Element>("//style:style[@style:name='P23']", NAMESPACES)!;
    expect(p23.attr("master-page-name")!.value()).toBe("Inside_20_cover");
    // No clone was minted for the already-correct openings.
    expect(
      contentDoc.find<Element>("//office:automatic-styles/style:style", NAMESPACES)
    ).toHaveLength(4); // P7, P8, P22, P23
  });

  test("never touches the hidden injected heading (auto style with text:display='none')", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PHidden" text:outline-level="1">Somo 14</text:h>`,
      {
        automaticStylesInner: autoStyle("PHidden", `<style:text-properties text:display="none"/>`),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const hidden = contentDoc.get<Element>("//style:style[@style:name='PHidden']", NAMESPACES)!;
    expect(hidden.attr("master-page-name")).toBeNull();
  });

  test("clones a shared auto style, patching and repointing only the heading; the co-referencing paragraph and original style are unchanged", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PS" text:outline-level="1">Somo 3</text:h>` +
        `<text:p text:style-name="PS">shared-style body</text:p>`,
      {
        automaticStylesInner: autoStyle(
          "PS",
          `<style:paragraph-properties fo:break-before="page"/>`
        ),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h", NAMESPACES)!;
    const headingStyleName = heading.attr("style-name")!.value();
    expect(headingStyleName).not.toBe("PS");
    const clone = contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${headingStyleName}']`,
      NAMESPACES
    )!;
    expect(clone.attr("master-page-name")!.value()).toBe("First_20_Page");
    expect(
      clone.get<Element>("style:paragraph-properties", NAMESPACES)!.attr("break-before")!.value()
    ).toBe("page");
    // The paragraph still references the original, unpatched style.
    const paragraph = contentDoc.get<Element>("//office:text/text:p", NAMESPACES)!;
    expect(paragraph.attr("style-name")!.value()).toBe("PS");
    const original = contentDoc.get<Element>("//style:style[@style:name='PS']", NAMESPACES)!;
    expect(original.attr("master-page-name")).toBeNull();
  });

  test("ignores level-2+ headings and headings referencing common named styles", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="P24" text:outline-level="2">Sehemu</text:h>` +
        `<text:h text:style-name="Heading_20_1" text:outline-level="1">Somo 4</text:h>`,
      {
        automaticStylesInner: autoStyle(
          "P24",
          `<style:paragraph-properties fo:break-before="page"/>`
        ),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const p24 = contentDoc.get<Element>("//style:style[@style:name='P24']", NAMESPACES)!;
    expect(p24.attr("master-page-name")).toBeNull();
    // The named-common-style heading is skipped: no auto style minted for it.
    const named = contentDoc.find<Element>("//office:automatic-styles/style:style", NAMESPACES);
    expect(named.map((s) => s.attr("name")!.value())).toEqual(["P7", "P8", "P24"]);
  });
});

/**
 * Body restart (017 US1-T3, FR-005, INV-3, contract §2.2/§2.5, data-model.md
 * INV-3): the FIRST visible level-1 opening's automatic style must carry
 * BOTH `style:master-page-name="First_20_Page"` and an explicit
 * `style:page-number="1"` restart, and it must be the ONLY paragraph in the
 * book carrying that restart. This is a NEW pass, distinct from — and not
 * gated by — `normalizeLessonOpeningMasterPages`' skip conditions: that
 * function trusts (skips cloning for) an auto style that already carries a
 * master, and skips entirely when the heading rides a common named style.
 * Neither skip is safe for the restart (contract §2.2), so the restart pass
 * must guarantee its own isolation regardless.
 */
describe("body restart (FR-005 / INV-3)", () => {
  test('sets style:page-number="1" alongside master-page-name=First_20_Page on the FIRST visible level-1 opening\'s own (isolated) automatic style', () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="P30" text:outline-level="1">Somo 1</text:h>` +
        `<text:h text:style-name="P31" text:outline-level="1">Somo 2</text:h>`,
      { automaticStylesInner: autoStyleTag("P30", "") + autoStyleTag("P31", "") }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading1 = contentDoc.get<Element>("//office:body//text:h[1]", NAMESPACES)!;
    const style1Name = heading1.attr("style-name")!.value();
    const style1 = contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${style1Name}']`,
      NAMESPACES
    )!;
    expect(style1.attr("master-page-name")!.value()).toBe("First_20_Page");
    const props1 = style1.get<Element>("style:paragraph-properties", NAMESPACES);
    expect(props1?.attr("page-number")?.value()).toBe("1");
  });

  test('exactly one paragraph in the book carries the explicit style:page-number="1" restart — the second (and every later) opening\'s automatic style carries NO style:page-number attribute', () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="P32" text:outline-level="1">Somo 1</text:h>` +
        `<text:h text:style-name="P33" text:outline-level="1">Somo 2</text:h>` +
        `<text:h text:style-name="P34" text:outline-level="1">Somo 3</text:h>`,
      {
        automaticStylesInner:
          autoStyleTag("P32", "") + autoStyleTag("P33", "") + autoStyleTag("P34", ""),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const restarts = contentDoc
      .find<Element>("//office:automatic-styles/style:style", NAMESPACES)
      .filter(
        (style) =>
          style
            .get<Element>("style:paragraph-properties", NAMESPACES)
            ?.attr("page-number")
            ?.value() === "1"
      );
    expect(restarts).toHaveLength(1);
  });

  test("skips the injected hidden heading (text:display='none') when locating the first VISIBLE opening — the restart lands on the first heading that actually renders", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PHiddenR" text:outline-level="1">hidden</text:h>` +
        `<text:h text:style-name="P35" text:outline-level="1">Somo 1</text:h>`,
      {
        automaticStylesInner:
          autoStyleTag("PHiddenR", `<style:text-properties text:display="none"/>`) +
          autoStyleTag("P35", ""),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const hidden = contentDoc.get<Element>("//style:style[@style:name='PHiddenR']", NAMESPACES)!;
    expect(
      hidden.get<Element>("style:paragraph-properties", NAMESPACES)?.attr("page-number")
    ).toBeNull();
    const p35 = contentDoc.get<Element>("//style:style[@style:name='P35']", NAMESPACES)!;
    expect(
      p35.get<Element>("style:paragraph-properties", NAMESPACES)!.attr("page-number")!.value()
    ).toBe("1");
  });
});

/**
 * Restart isolation (INV-3): the restart's target automatic style must have
 * the first heading as its ONLY referencer — cloned and repointed where it
 * is not, REGARDLESS of whether the style already carries a
 * `style:master-page-name` (contract §2.2: "the restart must NOT inherit
 * that skip"). Deliberately builds a fixture that
 * `normalizeLessonOpeningMasterPages` would leave untouched (already-pinned
 * master) to prove the restart pass does not rely on that function's
 * cloning.
 */
describe("restart isolation (INV-3)", () => {
  test("clones and repoints when the first opening's auto style is SHARED with a non-heading paragraph, even though it already carries style:master-page-name (the case normalizeLessonOpeningMasterPages trusts and skips)", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PSR" text:outline-level="1">Somo 1</text:h>` +
        `<text:p text:style-name="PSR">shared-style body</text:p>`,
      {
        automaticStylesInner: autoStyleTag("PSR", "", ` style:master-page-name="First_20_Page"`),
      }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h", NAMESPACES)!;
    const headingStyleName = heading.attr("style-name")!.value();
    // The heading must no longer reference the shared style.
    expect(headingStyleName).not.toBe("PSR");
    const clone = contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${headingStyleName}']`,
      NAMESPACES
    )!;
    expect(clone.attr("master-page-name")!.value()).toBe("First_20_Page");
    expect(
      clone.get<Element>("style:paragraph-properties", NAMESPACES)!.attr("page-number")!.value()
    ).toBe("1");
    // The co-referencing paragraph keeps the ORIGINAL, un-restarted style.
    const paragraph = contentDoc.get<Element>("//office:text/text:p", NAMESPACES)!;
    expect(paragraph.attr("style-name")!.value()).toBe("PSR");
    const original = contentDoc.get<Element>("//style:style[@style:name='PSR']", NAMESPACES)!;
    expect(
      original.get<Element>("style:paragraph-properties", NAMESPACES)?.attr("page-number")
    ).toBeNull();
  });
});

/**
 * Throw, don't skip (contract §2.3): a heading on a common NAMED style with
 * no automatic style to clone leaves the restart pass nothing to isolate —
 * finalize must throw the curated, path-free reason rather than silently
 * leaving FR-005 unmet.
 */
describe("throw when the restart target cannot be isolated", () => {
  test("throws when the first visible level-1 opening rides a common NAMED style (no automatic style exists to clone)", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="Heading_20_1" text:outline-level="1">Somo 1</text:h>`
    );

    expect(() => finalizeAssembledQuarter(defaultOptions(odtPath))).toThrow(
      /assembly failed to finalize the merged book/i
    );
  });
});

/**
 * Deterministic clone naming (contract §2.2/§2.4, INV-13a): the restart's
 * clone name is derived deterministically from the heading's own style
 * name — or an existing restart clone is detected and reused — never
 * minted by probing for the next free suffix. A non-deterministic name
 * would break the `finalize(finalize(doc,false),true)` mixed-mode fixed
 * point the US1-T5/T6 tasks depend on.
 */
describe("deterministic clone naming", () => {
  test("the restart clone's name is a deterministic function of the original style name, not a probed suffix", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PDN" text:outline-level="1">Somo 1</text:h>` +
        `<text:p text:style-name="PDN">shared-style body</text:p>`,
      { automaticStylesInner: autoStyleTag("PDN", "") }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h", NAMESPACES)!;
    // Deterministically derived from the heading's own original style name —
    // not a `_QA`-suffix probe (the naming scheme
    // `normalizeLessonOpeningMasterPages` uses for its OWN, unrelated clone).
    expect(heading.attr("style-name")!.value()).toBe("PDN_Restart");
  });

  test("a second finalize pass over an already-restarted document reuses the SAME clone name — no new clone is minted", () => {
    const odtPath = `${workDir}/assembled.odt`;
    buildMergedFixtureOdt(
      odtPath,
      `<text:h text:style-name="PDN2" text:outline-level="1">Somo 1</text:h>` +
        `<text:p text:style-name="PDN2">shared-style body</text:p>`,
      { automaticStylesInner: autoStyleTag("PDN2", "") }
    );

    finalizeAssembledQuarter(defaultOptions(odtPath));
    const firstPassContentDoc = extractXml(odtPath, "content.xml");
    const firstPassStyleName = firstPassContentDoc
      .get<Element>("//text:h", NAMESPACES)!
      .attr("style-name")!
      .value();

    finalizeAssembledQuarter(defaultOptions(odtPath));

    const secondPassContentDoc = extractXml(odtPath, "content.xml");
    const secondPassStyleName = secondPassContentDoc
      .get<Element>("//text:h", NAMESPACES)!
      .attr("style-name")!
      .value();
    expect(secondPassStyleName).toBe(firstPassStyleName);
    // Exactly one restart clone exists — no `_Restart_Restart` double-clone.
    const restartClones = secondPassContentDoc
      .find<Element>("//office:automatic-styles/style:style", NAMESPACES)
      .filter((style) => style.attr("name")!.value().endsWith("_Restart"));
    expect(restartClones).toHaveLength(1);
  });
});

test("re-packs with the mimetype entry stored FIRST and UNCOMPRESSED (ODF requirement)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const entries = listArchiveEntries(odtPath);
  expect(entries[0].name).toBe("mimetype");
  expect(entries[0].method).toBe("Stored");
});
