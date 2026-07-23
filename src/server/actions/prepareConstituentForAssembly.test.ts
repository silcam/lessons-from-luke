/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { prepareConstituentForAssembly } from "./prepareConstituentForAssembly";
import { mkdirSafe, unlinkRecursive, unzip } from "../../core/util/fsUtils";

const NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
};

const workDir = "test/tmp-prepareConstituentForAssembly";

afterEach(() => {
  unlinkRecursive(workDir);
});

interface FixtureOpts {
  /** meta.xml custom-property values; property omitted when undefined. */
  quarterValue?: string;
  lessonValue?: string;
  /** meta.xml `dc:subject` (the per-lesson title); element omitted when undefined. */
  subject?: string;
  /** meta.xml `dc:title`; element omitted when undefined. */
  title?: string;
  /** Body markup inserted after `text:sequence-decls` (default: a plain paragraph, i.e. NO heading). */
  bodyXml?: string;
  /** Extra automatic styles inserted into content.xml. */
  contentAutoStylesXml?: string;
}

/**
 * Builds a minimal (non-LibreOffice-authored, but structurally valid) ODT
 * fixture mirroring the real lesson masters' shape: a footer with
 * `text:user-defined` Quarter/Lesson fields plus a named/display-named
 * master page, a `content.xml` body with `text:sequence-decls`, and a
 * `meta.xml` with the given properties. Deliberately packed WITHOUT the ODF
 * mimetype-first-uncompressed ordering (like a plain `zip -r`), so the
 * repack-ordering assertion is meaningful.
 */
function buildFixtureOdt(odtPath: string, opts: FixtureOpts = {}): void {
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

  const bodyXml = opts.bodyXml ?? `<text:p text:style-name="Body">ordinary content</text:p>`;
  fs.writeFileSync(
    `${srcDir}/content.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:automatic-styles>${opts.contentAutoStylesXml ?? ""}</office:automatic-styles>
  <office:body><office:text>
    <text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Figure"/></text:sequence-decls>
    ${bodyXml}
  </office:text></office:body>
</office:document-content>`
  );

  const metaProps: string[] = [];
  if (opts.title !== undefined) metaProps.push(`<dc:title>${opts.title}</dc:title>`);
  if (opts.subject !== undefined) metaProps.push(`<dc:subject>${opts.subject}</dc:subject>`);
  if (opts.quarterValue !== undefined)
    metaProps.push(
      `<meta:user-defined meta:name="Quarter" meta:value-type="float">${opts.quarterValue}</meta:user-defined>`
    );
  if (opts.lessonValue !== undefined)
    metaProps.push(
      `<meta:user-defined meta:name="Lesson" meta:value-type="float">${opts.lessonValue}</meta:user-defined>`
    );
  fs.writeFileSync(
    `${srcDir}/meta.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta>${metaProps.join("")}</office:meta>
</office:document-meta>`
  );

  fs.writeFileSync(
    `${srcDir}/styles.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:styles>
    <style:style style:name="Invisible_20_Title" style:family="paragraph" style:default-outline-level="1"/>
    <style:style style:name="Body" style:family="paragraph"/>
  </office:styles>
  <office:master-styles>
    <style:master-page style:name="Coloring_20_Page" style:display-name="Coloring Page">
      <style:footer>
        <text:p>Quarter <text:user-defined style:data-style-name="N0" text:name="Quarter">1</text:user-defined> Lesson <text:user-defined style:data-style-name="N0" text:name="Lesson">1</text:user-defined></text:p>
      </style:footer>
    </style:master-page>
    <style:master-page style:name="Front_20_matter" style:display-name="Front matter">
      <style:footer>
        <text:p><text:title>Lessons from Luke</text:title> <text:subject>subject here</text:subject> Lesson <text:user-defined style:data-style-name="N0" text:name="Lesson"/></text:p>
      </style:footer>
    </style:master-page>
  </office:master-styles>
</office:document-styles>`
  );

  const absOut = path.resolve(odtPath);
  fs.rmSync(absOut, { force: true });
  execFileSync("zip", ["-r", "-X", absOut, "."], { cwd: srcDir });
}

function extractXml(odtPath: string, entry: "styles.xml" | "content.xml"): XmlDocument {
  const extractDir = `${workDir}/extracted-${path.basename(odtPath, ".odt")}-${entry.replace(
    ".xml",
    ""
  )}`;
  unlinkRecursive(extractDir);
  unzip(odtPath, extractDir);
  return libxmljs2.parseXml(fs.readFileSync(`${extractDir}/${entry}`, "utf8"));
}

/** `unzip -v`'s parsed rows: entry name, compression method, in archive order. */
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

const LESSON_HEADING_XML =
  `<text:list text:style-name="Outline"><text:list-item>` +
  `<text:h text:style-name="P26" text:outline-level="1">The Twelve Apostles</text:h>` +
  `</text:list-item></text:list>`;

function defaultOptions(odtPath: string) {
  return {
    odtPath,
    series: 2,
    lesson: 14,
    isTOC: false,
    fallbackTitle: "Luke 2-14",
  };
}

describe("styles.xml footer chapterization", () => {
  test("replaces every Lesson text:user-defined field with a live chapter-number field cached to the meta.xml Lesson value", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const stylesDoc = extractXml(odtPath, "styles.xml");
    const lessonFields = stylesDoc.find<Element>(
      "//text:user-defined[@text:name='Lesson']",
      NAMESPACES
    );
    expect(lessonFields).toHaveLength(0);

    const chapterFields = stylesDoc.find<Element>(
      "//text:chapter[@text:display='number'][@text:outline-level='1']",
      NAMESPACES
    );
    expect(chapterFields).toHaveLength(2);
    chapterFields.forEach((field) => expect(field.text()).toBe("14"));
  });

  test("keeps the Quarter text:user-defined field LIVE, normalizing its cached text to the meta.xml Quarter value", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const stylesDoc = extractXml(odtPath, "styles.xml");
    const quarterFields = stylesDoc.find<Element>(
      "//text:user-defined[@text:name='Quarter']",
      NAMESPACES
    );
    expect(quarterFields).toHaveLength(1);
    expect(quarterFields[0].text()).toBe("2");
  });

  test("leaves text:title and text:subject footer fields live and untouched", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const stylesDoc = extractXml(odtPath, "styles.xml");
    expect(stylesDoc.find<Element>("//text:title", NAMESPACES)).toHaveLength(1);
    expect(stylesDoc.find<Element>("//text:subject", NAMESPACES)).toHaveLength(1);
  });

  test("falls back to the domain lesson number for a Lesson field's cached text when meta.xml has no Lesson property", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "2", bodyXml: LESSON_HEADING_XML });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const stylesDoc = extractXml(odtPath, "styles.xml");
    const chapterFields = stylesDoc.find<Element>("//text:chapter", NAMESPACES);
    expect(chapterFields.length).toBeGreaterThan(0);
    chapterFields.forEach((field) => expect(field.text()).toBe("14"));
  });

  test("caches an EMPTY chapter-number text for the TOC (never bakes the sentinel 99 into a rendered footer)", () => {
    const odtPath = `${workDir}/toc.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "2" });

    prepareConstituentForAssembly({
      odtPath,
      series: 2,
      lesson: 99,
      isTOC: true,
      fallbackTitle: "Table of Contents",
    });

    const stylesDoc = extractXml(odtPath, "styles.xml");
    const chapterFields = stylesDoc.find<Element>("//text:chapter", NAMESPACES);
    expect(chapterFields.length).toBeGreaterThan(0);
    chapterFields.forEach((field) => expect(field.text()).toBe(""));
  });

  test("does NOT rename master-page style names or display names (the fix for the duplicated-page-styles defect)", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const stylesDoc = extractXml(odtPath, "styles.xml");
    const masterPages = stylesDoc.find<Element>("//style:master-page", NAMESPACES);
    const names = masterPages.map((mp) => mp.attr("name")!.value());
    const displayNames = masterPages.map((mp) => mp.attr("display-name")?.value());
    expect(names).toEqual(["Coloring_20_Page", "Front_20_matter"]);
    expect(displayNames).toEqual(["Coloring Page", "Front matter"]);
  });
});

describe("content.xml hidden-heading injection", () => {
  test("leaves a lesson that already has exactly one level-1 heading untouched", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const contentDoc = extractXml(odtPath, "content.xml");
    const headings = contentDoc.find<Element>("//text:h[@text:outline-level='1']", NAMESPACES);
    expect(headings).toHaveLength(1);
    expect(headings[0].text()).toBe("The Twelve Apostles");
  });

  test("injects one hidden level-1 heading carrying the meta.xml dc:subject title into a heading-less (legacy) lesson", () => {
    const odtPath = `${workDir}/legacy.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "1",
      lessonValue: "1",
      subject: "The Book of Luke and the Birth of John the Baptizer",
    });

    prepareConstituentForAssembly({
      odtPath,
      series: 1,
      lesson: 1,
      isTOC: false,
      fallbackTitle: "Luke 1-1",
    });

    const contentDoc = extractXml(odtPath, "content.xml");
    const headings = contentDoc.find<Element>("//text:h[@text:outline-level='1']", NAMESPACES);
    expect(headings).toHaveLength(1);
    expect(headings[0].text()).toBe("The Book of Luke and the Birth of John the Baptizer");

    // Injected AFTER text:sequence-decls, at the top of the body.
    const following = contentDoc.get<Element>(
      "//text:sequence-decls/following-sibling::*[1]//text:h | //text:sequence-decls/following-sibling::text:h[1]",
      NAMESPACES
    );
    expect(following).toBeTruthy();
  });

  test("the injected heading's style hides it (text:display none), and neither heading nor style forces a page break (no master-page-name, no fo:break-before)", () => {
    const odtPath = `${workDir}/legacy.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "1", lessonValue: "1", subject: "A Title" });

    prepareConstituentForAssembly({
      odtPath,
      series: 1,
      lesson: 1,
      isTOC: false,
      fallbackTitle: "Luke 1-1",
    });

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h[@text:outline-level='1']", NAMESPACES)!;
    const styleName = heading.attr("style-name")!.value();

    const style = contentDoc.get<Element>(`//style:style[@style:name='${styleName}']`, NAMESPACES)!;
    expect(style).toBeTruthy();
    const textProps = style.get<Element>("style:text-properties", NAMESPACES)!;
    expect(textProps.attr("display")!.value()).toBe("none");
    expect(style.attr("master-page-name")).toBeNull();
    expect(contentDoc.toString(false)).not.toContain("fo:break-before");
  });

  test("decodes XML entities from dc:subject and re-escapes them safely in the injected heading (no double-escaping)", () => {
    const odtPath = `${workDir}/legacy.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "19",
      subject: "Jesus Heals the Centurion&apos;s Servant &amp; Friends",
    });

    prepareConstituentForAssembly({
      odtPath,
      series: 2,
      lesson: 19,
      isTOC: false,
      fallbackTitle: "Luke 2-19",
    });

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h[@text:outline-level='1']", NAMESPACES)!;
    expect(heading.text()).toBe("Jesus Heals the Centurion's Servant & Friends");
  });

  test("uses the fallback title for the injected heading when meta.xml has no dc:subject", () => {
    const odtPath = `${workDir}/legacy.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "1", lessonValue: "1" });

    prepareConstituentForAssembly({
      odtPath,
      series: 1,
      lesson: 1,
      isTOC: false,
      fallbackTitle: "Luke 1-1",
    });

    const contentDoc = extractXml(odtPath, "content.xml");
    const heading = contentDoc.get<Element>("//text:h[@text:outline-level='1']", NAMESPACES)!;
    expect(heading.text()).toBe("Luke 1-1");
  });

  test("never injects a heading into the TOC constituent", () => {
    const odtPath = `${workDir}/toc.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "2", subject: "Teacher's Guide" });

    prepareConstituentForAssembly({
      odtPath,
      series: 2,
      lesson: 99,
      isTOC: true,
      fallbackTitle: "Table of Contents",
    });

    const contentDoc = extractXml(odtPath, "content.xml");
    expect(contentDoc.find<Element>("//text:h", NAMESPACES)).toHaveLength(0);
  });
});

describe("outline-participant validation (chapter-field correctness gate)", () => {
  test("throws when a lesson ends up with MORE than one effective outline participant (a stray outline-level-1 paragraph would shift every later lesson's footer number)", () => {
    const odtPath = `${workDir}/lesson.odt`;
    // A real heading PLUS a text:p whose style chain inherits
    // style:default-outline-level="1" (styles.xml "Invisible_20_Title") —
    // LibreOffice counts BOTH toward chapter numbering (verified in the
    // spike: a demoted title paragraph inheriting the invisible style's
    // outline level shifted lessons 21-26 off by one).
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      contentAutoStylesXml:
        `<style:style style:name="PX" style:family="paragraph" ` +
        `style:parent-style-name="Invisible_20_Title"/>`,
      bodyXml:
        LESSON_HEADING_XML + `<text:p text:style-name="PX">stray outline participant</text:p>`,
    });

    expect(() => prepareConstituentForAssembly(defaultOptions(odtPath))).toThrow(
      /outline participant/i
    );
  });

  test("does NOT count a level-2 subheading as an outline participant (the real-world Acts pattern: 'Homework'/'Prayer' text:h outline-level 2 alongside the level-1 lesson heading)", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml:
        LESSON_HEADING_XML +
        `<text:h text:style-name="P27" text:outline-level="2">Homework</text:h>`,
    });

    expect(() => prepareConstituentForAssembly(defaultOptions(odtPath))).not.toThrow();

    const contentDoc = extractXml(odtPath, "content.xml");
    const subheading = contentDoc.get<Element>("//text:h[@text:outline-level='2']", NAMESPACES);
    expect(subheading?.text()).toBe("Homework");
  });

  test("throws for a second BARE text:h (no outline-level attribute, no outline style) — the ODF default makes it level 1", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML + `<text:h text:style-name="Body">bare heading</text:h>`,
    });

    expect(() => prepareConstituentForAssembly(defaultOptions(odtPath))).toThrow(
      /outline participant/i
    );
  });

  test("throws when the TOC carries any outline participant (it would consume the first lesson's chapter number)", () => {
    const odtPath = `${workDir}/toc.odt`;
    buildFixtureOdt(odtPath, { quarterValue: "2", bodyXml: LESSON_HEADING_XML });

    expect(() =>
      prepareConstituentForAssembly({
        odtPath,
        series: 2,
        lesson: 99,
        isTOC: true,
        fallbackTitle: "Table of Contents",
      })
    ).toThrow(/outline participant/i);
  });
});

describe("result metadata and repacking", () => {
  test("returns the constituent's decoded dc:title and dc:subject for the post-merge metadata patch", () => {
    const odtPath = `${workDir}/toc.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      title: "Lessons from Luke",
      subject: "Teacher&apos;s Guide",
    });

    const result = prepareConstituentForAssembly({
      odtPath,
      series: 2,
      lesson: 99,
      isTOC: true,
      fallbackTitle: "Table of Contents",
    });

    expect(result).toEqual({ title: "Lessons from Luke", subject: "Teacher's Guide" });
  });

  test("re-packs with the mimetype entry stored FIRST and UNCOMPRESSED (ODF requirement)", () => {
    const odtPath = `${workDir}/lesson.odt`;
    buildFixtureOdt(odtPath, {
      quarterValue: "2",
      lessonValue: "14",
      bodyXml: LESSON_HEADING_XML,
    });

    prepareConstituentForAssembly(defaultOptions(odtPath));

    const entries = listArchiveEntries(odtPath);
    expect(entries[0].name).toBe("mimetype");
    expect(entries[0].method).toBe("Stored");
  });
});
