/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { finalizeAssembledQuarter } from "./finalizeAssembledQuarter";
import { mkdirSafe, unlinkRecursive, unzip } from "../../core/util/fsUtils";

const NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
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
function buildMergedFixtureOdt(odtPath: string, officeTextInner = ""): void {
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
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
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
    </text:outline-style>
  </office:styles>
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

test("re-packs with the mimetype entry stored FIRST and UNCOMPRESSED (ODF requirement)", () => {
  const odtPath = `${workDir}/assembled.odt`;
  buildMergedFixtureOdt(odtPath);

  finalizeAssembledQuarter(defaultOptions(odtPath));

  const entries = listArchiveEntries(odtPath);
  expect(entries[0].name).toBe("mimetype");
  expect(entries[0].method).toBe("Stored");
});
