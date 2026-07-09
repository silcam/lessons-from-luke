/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Document as XmlDocument, Element } from "libxmljs2";
import { renameMasterPageStyles } from "./renameMasterPageStyles";
import { mkdirSafe, unlinkRecursive, unzip } from "../../core/util/fsUtils";

const NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
};

const workDir = "test/tmp-renameMasterPageStyles";

afterEach(() => {
  unlinkRecursive(workDir);
});

/**
 * Builds a minimal (non-LibreOffice-authored, but structurally valid) ODT
 * fixture modeling the real shared-template collision this fix guards
 * against: two master-pages ("Standard" and "First"), each with its own
 * page-layout ("Mpm1"/"Mpm2"), "First" chaining to "Standard" via
 * `style:next-style-name`, and a `content.xml` paragraph style that forces a
 * break onto "First" via `style:master-page-name` — the exact attribute
 * shape LibreOffice's shared-template constituents produce.
 */
function buildFixtureOdt(odtPath: string): void {
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
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
  );

  fs.writeFileSync(
    `${srcDir}/content.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph" style:master-page-name="First"/>
  </office:automatic-styles>
  <office:body><office:text/></office:body>
</office:document-content>`
  );

  fs.writeFileSync(
    `${srcDir}/styles.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:page-layout style:name="Mpm1"><style:page-layout-properties/></style:page-layout>
    <style:page-layout style:name="Mpm2"><style:page-layout-properties/></style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="First" style:display-name="First Page" style:page-layout-name="Mpm2" style:next-style-name="Standard"/>
    <style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>
  </office:master-styles>
</office:document-styles>`
  );

  const absOut = path.resolve(odtPath);
  fs.rmSync(absOut, { force: true });
  execFileSync("zip", ["-r", "-X", absOut, "."], { cwd: srcDir });
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

function extractXml(odtPath: string, filename: "styles.xml" | "content.xml"): XmlDocument {
  const extractDir = `${workDir}/extracted-${path.basename(odtPath, ".odt")}`;
  unzip(odtPath, extractDir);
  return libxmljs2.parseXml(fs.readFileSync(`${extractDir}/${filename}`, "utf8"));
}

test("suffixes every master-page and page-layout name with the given suffix", () => {
  const odtPath = `${workDir}/names.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "00" });

  const doc = extractXml(odtPath, "styles.xml");
  const masterPageNames = doc
    .find<Element>("//style:master-page", NAMESPACES)
    .map((el) => el.attr("name")!.value())
    .sort();
  expect(masterPageNames).toEqual(["First_00", "Standard_00"]);

  const pageLayoutNames = doc
    .find<Element>("//style:page-layout", NAMESPACES)
    .map((el) => el.attr("name")!.value())
    .sort();
  expect(pageLayoutNames).toEqual(["Mpm1_00", "Mpm2_00"]);
});

test("rewrites each master-page's page-layout-name to its renamed layout", () => {
  const odtPath = `${workDir}/layout-refs.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "07" });

  const doc = extractXml(odtPath, "styles.xml");
  const first = doc.get<Element>("//style:master-page[@style:name='First_07']", NAMESPACES)!;
  expect(first.attr("page-layout-name")!.value()).toBe("Mpm2_07");

  const standard = doc.get<Element>("//style:master-page[@style:name='Standard_07']", NAMESPACES)!;
  expect(standard.attr("page-layout-name")!.value()).toBe("Mpm1_07");
});

test("rewrites next-style-name chains between renamed master-pages", () => {
  const odtPath = `${workDir}/next-style.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "12" });

  const doc = extractXml(odtPath, "styles.xml");
  const first = doc.get<Element>("//style:master-page[@style:name='First_12']", NAMESPACES)!;
  expect(first.attr("next-style-name")!.value()).toBe("Standard_12");
});

test("suffixes style:display-name too (LibreOffice's insertDocumentFromURL de-dupes imported master-pages by DISPLAY NAME, not style:name alone)", () => {
  const odtPath = `${workDir}/display-name.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "09" });

  const doc = extractXml(odtPath, "styles.xml");
  const first = doc.get<Element>("//style:master-page[@style:name='First_09']", NAMESPACES)!;
  expect(first.attr("display-name")!.value()).toBe("First Page 09");
});

test("rewrites content.xml's style:master-page-name references consistently", () => {
  const odtPath = `${workDir}/content-refs.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "03" });

  const doc = extractXml(odtPath, "content.xml");
  const p1 = doc.get<Element>("//style:style[@style:name='P1']", NAMESPACES)!;
  expect(p1.attr("master-page-name")!.value()).toBe("First_03");
});

test("produces distinct, collision-free names across two constituents suffixed differently", () => {
  const odtPathA = `${workDir}/a.odt`;
  const odtPathB = `${workDir}/b.odt`;
  buildFixtureOdt(odtPathA);
  buildFixtureOdt(odtPathB);

  renameMasterPageStyles({ odtPath: odtPathA, suffix: "00" });
  renameMasterPageStyles({ odtPath: odtPathB, suffix: "01" });

  const namesA = new Set(
    extractXml(odtPathA, "styles.xml")
      .find<Element>("//style:master-page", NAMESPACES)
      .map((el) => el.attr("name")!.value())
  );
  const namesB = new Set(
    extractXml(odtPathB, "styles.xml")
      .find<Element>("//style:master-page", NAMESPACES)
      .map((el) => el.attr("name")!.value())
  );
  namesA.forEach((name) => expect(namesB.has(name)).toBe(false));
});

test("re-zips with mimetype stored first and uncompressed", () => {
  const odtPath = `${workDir}/repack.odt`;
  buildFixtureOdt(odtPath);

  renameMasterPageStyles({ odtPath, suffix: "05" });

  const entries = listArchiveEntries(odtPath);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0].name).toBe("mimetype");
  expect(entries[0].method).toBe("Stored");
});
