/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { flattenFooterFields } from "./flattenFooterFields";
import { mkdirSafe, unlinkRecursive, unzip } from "../../core/util/fsUtils";

const NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
};

const workDir = "test/tmp-flattenFooterFields";

afterEach(() => {
  unlinkRecursive(workDir);
});

/**
 * Builds a minimal (non-LibreOffice-authored, but structurally valid) ODT
 * fixture: `mimetype` + `META-INF/manifest.xml` + `content.xml` + `meta.xml`
 * (with the given custom properties, or none) + `styles.xml` (with a footer
 * referencing `text:user-defined` Quarter/Lesson fields). The archive is
 * deliberately packed WITHOUT the ODF mimetype-first-uncompressed ordering,
 * mirroring a real `zip -r`-produced ODT (research.md R4) — this is fixture
 * SETUP, not the behavior under test.
 */
function buildFixtureOdt(
  odtPath: string,
  opts: { quarterValue?: string; lessonValue?: string; omitMetaProps?: boolean }
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
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:body><office:text/></office:body>
</office:document-content>`
  );

  const userDefinedProps = opts.omitMetaProps
    ? ""
    : `    <meta:user-defined meta:name="Quarter" meta:value-type="string">${
        opts.quarterValue ?? ""
      }</meta:user-defined>
    <meta:user-defined meta:name="Lesson" meta:value-type="string">${
      opts.lessonValue ?? ""
    }</meta:user-defined>`;
  fs.writeFileSync(
    `${srcDir}/meta.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">
  <office:meta>
${userDefinedProps}
  </office:meta>
</office:document-meta>`
  );

  fs.writeFileSync(
    `${srcDir}/styles.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:master-styles>
    <style:master-page style:name="Standard">
      <style:footer>
        <text:p>Quarter <text:user-defined style:data-style-name="N0" text:name="Quarter">1</text:user-defined> Lesson <text:user-defined style:data-style-name="N0" text:name="Lesson">1</text:user-defined></text:p>
      </style:footer>
    </style:master-page>
  </office:master-styles>
</office:document-styles>`
  );

  // Pack WITHOUT mimetype-first-uncompressed ordering (like a plain `zip -r`),
  // so the ordering assertion below is meaningful.
  const absOut = path.resolve(odtPath);
  fs.rmSync(absOut, { force: true });
  execFileSync("zip", ["-r", "-X", absOut, "."], { cwd: srcDir });
}

/** `unzip -v`'s parsed rows: entry name, compression method, and archive order. */
function listArchiveEntries(odtPath: string): { name: string; method: string }[] {
  const out = execFileSync("unzip", ["-v", odtPath], { encoding: "utf8" });
  const lines = out.split("\n").slice(3, -3); // drop header/footer rows
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { method: parts[1], name: parts[parts.length - 1] };
    });
}

function extractStylesXml(odtPath: string): XmlDocument {
  const extractDir = `${workDir}/extracted-${path.basename(odtPath, ".odt")}`;
  unzip(odtPath, extractDir);
  const xml = fs.readFileSync(`${extractDir}/styles.xml`, "utf8");
  return libxmljs2.parseXml(xml);
}

test("XML-escapes metacharacter-bearing Quarter/Lesson values when flattening the footer", () => {
  const odtPath = `${workDir}/metachars.odt`;
  buildFixtureOdt(odtPath, {
    quarterValue: "1 & 2 <3>",
    lessonValue: '"quoted" <b>',
  });

  flattenFooterFields({ odtPath, series: 9, lesson: 9 });

  const doc = extractStylesXml(odtPath);
  const userDefinedNodes = doc.find("//text:user-defined", NAMESPACES);
  // The field elements must be gone entirely — flattened to literal text.
  expect(userDefinedNodes.length).toBe(0);

  const footerText = doc.get<Element>("//style:footer", NAMESPACES)!.text();
  expect(footerText).toContain("1 & 2 <3>");
  expect(footerText).toContain('"quoted" <b>');
});

test("falls back to the lesson's own series/lesson when meta.xml properties are absent", () => {
  const odtPath = `${workDir}/missing-props.odt`;
  buildFixtureOdt(odtPath, { omitMetaProps: true });

  flattenFooterFields({ odtPath, series: 2, lesson: 5 });

  const doc = extractStylesXml(odtPath);
  const userDefinedNodes = doc.find("//text:user-defined", NAMESPACES);
  expect(userDefinedNodes.length).toBe(0);

  const footerText = doc.get<Element>("//style:footer", NAMESPACES)!.text();
  expect(footerText).toContain("2");
  expect(footerText).toContain("5");
});

test("re-zips with mimetype stored first and uncompressed, and the field reads as literal text", () => {
  const odtPath = `${workDir}/repack.odt`;
  buildFixtureOdt(odtPath, { quarterValue: "3", lessonValue: "7" });

  flattenFooterFields({ odtPath, series: 3, lesson: 7 });

  const entries = listArchiveEntries(odtPath);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0].name).toBe("mimetype");
  expect(entries[0].method).toBe("Stored");

  // Field became literal text, not merely present somewhere in the XML.
  const doc = extractStylesXml(odtPath);
  expect(doc.find("//text:user-defined", NAMESPACES).length).toBe(0);
  const footerText = doc.get<Element>("//style:footer", NAMESPACES)!.text();
  expect(footerText).toContain("3");
  expect(footerText).toContain("7");
});
