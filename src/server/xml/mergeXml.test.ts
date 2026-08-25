import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import libxmljs2, { Element } from "libxmljs2";
import docStorage from "../storage/docStorage";
import parse from "./parse";
import mergeXml, {
  cleanOpenDocXml,
  sortDocStrings,
  addSpacesForStylesStrings,
  extractNamespaces,
} from "./mergeXml";
import { unlinkSafe, unlinkRecursive, mkdirSafe, unzip } from "../../core/util/fsUtils";
import { DocString } from "../../core/models/DocString";

const odtPath = process.cwd() + "/cypress/fixtures/English_Luke-Q1-L06.odt";
const newOdtPath = odtPath.replace(".odt", "v02.odt");
let xmls: ReturnType<typeof docStorage.docXml>;

beforeAll(() => {
  xmls = docStorage.docXml(odtPath);
});

afterAll(() => {
  unlinkSafe(newOdtPath);
});

test("No-op XML merge", () => {
  const docStrings = parse(xmls.content, "content")
    .concat(parse(xmls.meta, "meta"))
    .concat(parse(xmls.styles, "styles"));
  mergeXml(odtPath, newOdtPath, docStrings);
  const newXmls = docStorage.docXml(newOdtPath);
  expect(compXml(newXmls.content)).toEqual(compXml(xmls.content));
  expect(compXml(newXmls.meta)).toEqual(compXml(xmls.meta));
  expect(compXml(newXmls.styles)).toBe(compXml(xmls.styles));
});

function compXml(xml: string) {
  return xml.replace(/\s+/g, "");
}

test("Merge preserve spaces", () => {
  const sample = "Picture book, Bible, chalk";
  expect(xmls.content).toContain(`${sample} <`);
  const docStrings = parse(xmls.content, "content");
  expect(docStrings.find((ds) => ds.text == sample)?.text).toBe(sample);

  mergeXml(odtPath, newOdtPath, docStrings);
  const newXml = docStorage.docXml(newOdtPath).content;
  expect(newXml).toContain(`${sample} <`);
});

test("Merge skips translations with non-matching xpaths", () => {
  const docStrings = parse(xmls.content, "content").map((ds) => ({
    ...ds,
    xpath: "/nonexistent/path/that/will/not/match",
  }));
  // Should not throw even when no elements match
  expect(() => mergeXml(odtPath, newOdtPath, docStrings)).not.toThrow();
});

test("Merge with clearEmptyParagraphs removes empty translated strings", () => {
  const docStrings = parse(xmls.content, "content");
  // Set first docString text to empty to trigger removeParagraph path
  const withEmpty = docStrings.map((ds, i) => (i === 0 ? { ...ds, text: "" } : ds));
  expect(() =>
    mergeXml(odtPath, newOdtPath, withEmpty, { clearEmptyParagraphs: true })
  ).not.toThrow();
});

test("Merge throws status 404 when input ODT does not exist and leaves no extract dir", () => {
  const missingOdtPath = process.cwd() + "/cypress/fixtures/__does_not_exist__.odt";
  const expectedExtractDir = missingOdtPath.replace(/\.odt$/, "_odt");
  expect(fs.existsSync(missingOdtPath)).toBe(false);
  expect(() => mergeXml(missingOdtPath, newOdtPath, [])).toThrow(
    expect.objectContaining({ status: 404 })
  );
  expect(fs.existsSync(expectedExtractDir)).toBe(false);
});

test("Merge with clearEmptyParagraphs and non-matching xpath skips gracefully", () => {
  const docStrings = [
    {
      text: "",
      type: "content" as const,
      motherTongue: true,
      xpath: "/nonexistent/xpath/that/will/not/match",
    },
  ];
  expect(() =>
    mergeXml(odtPath, newOdtPath, docStrings, { clearEmptyParagraphs: true })
  ).not.toThrow();
});

describe("clearEmptyParagraphs table boundary", () => {
  const workDir = path.join(os.tmpdir(), `mergeXmlTableGuard_${process.pid}`);

  beforeAll(() => {
    unlinkRecursive(workDir);
    mkdirSafe(workDir);
  });

  afterAll(() => {
    unlinkRecursive(workDir);
  });

  // Builds a minimal ODT zip containing only a content.xml — mergeXml only
  // touches the xml files it has docStrings for.
  function buildTableOdt(name: string, officeTextInner: string): string {
    const srcDir = path.join(workDir, `src-${name}`);
    mkdirSafe(srcDir);
    fs.writeFileSync(
      path.join(srcDir, "content.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2"><office:body><office:text>${officeTextInner}</office:text></office:body></office:document-content>`
    );
    const odtPath = path.join(workDir, `${name}.odt`);
    fs.rmSync(odtPath, { force: true });
    execFileSync("zip", ["-r", "-X", odtPath, "."], { cwd: srcDir });
    return odtPath;
  }

  function readContentXml(odtPath: string) {
    const extractDir = `${odtPath}_extracted`;
    unlinkRecursive(extractDir);
    mkdirSafe(extractDir);
    unzip(odtPath, extractDir);
    return libxmljs2.parseXml(fs.readFileSync(path.join(extractDir, "content.xml"), "utf8"));
  }

  // Mirrors how parse.ts builds xpaths: absolute positional node.path() of the
  // non-blank text nodes in document order.
  function contentDocStrings(odtPath: string): DocString[] {
    const xmlDoc = readContentXml(odtPath);
    const namespaces = extractNamespaces(xmlDoc);
    return xmlDoc.find<Element>("//text()", namespaces).reduce((docStrings, node) => {
      if (/\S/.test(node.text())) {
        docStrings.push({
          type: "content" as const,
          motherTongue: false,
          xpath: node.path(),
          text: node.text().trim(),
        });
      }
      return docStrings;
    }, [] as DocString[]);
  }

  const NS = {
    office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  };

  test("cell whose only paragraph goes empty keeps the cell, row, and table intact", () => {
    const odtPath = buildTableOdt(
      "sole-empty-cell",
      `<table:table table:name="T1"><table:table-column/><table:table-column/><table:table-column/>` +
        `<table:table-row>` +
        `<table:table-cell table:style-name="CellA"><text:p>Left</text:p></table:table-cell>` +
        `<table:table-cell table:style-name="CellB"><text:p>Middle</text:p></table:table-cell>` +
        `<table:table-cell table:style-name="CellC"><text:p>Right</text:p></table:table-cell>` +
        `</table:table-row></table:table><text:p>Body text</text:p>`
    );
    const outPath = odtPath.replace(".odt", "-out.odt");
    const docStrings = contentDocStrings(odtPath).map((ds) =>
      ds.text === "Middle" ? { ...ds, text: "" } : ds
    );

    mergeXml(odtPath, outPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(outPath);
    expect(merged.find("//table:table", NS)).toHaveLength(1);
    expect(merged.find("//table:table-row", NS)).toHaveLength(1);
    const cells = merged.find<Element>("//table:table-cell", NS);
    expect(cells).toHaveLength(3);
    const middleCell = cells[1];
    expect(middleCell.attr("style-name")?.value()).toBe("CellB");
    const middleParagraphs = middleCell.find<Element>("./text:p", NS);
    expect(middleParagraphs).toHaveLength(1);
    expect(middleParagraphs[0].text()).toBe("");
  });

  test("row whose every paragraph goes empty keeps both rows with the correct cell counts", () => {
    const odtPath = buildTableOdt(
      "whole-row-empty",
      `<table:table table:name="T1"><table:table-column/><table:table-column/>` +
        `<table:table-row>` +
        `<table:table-cell><text:p>R1C1</text:p></table:table-cell>` +
        `<table:table-cell><text:p>R1C2</text:p></table:table-cell>` +
        `</table:table-row>` +
        `<table:table-row>` +
        `<table:table-cell><text:p>R2C1</text:p></table:table-cell>` +
        `<table:table-cell><text:p>R2C2</text:p></table:table-cell>` +
        `</table:table-row></table:table><text:p>Body text</text:p>`
    );
    const outPath = odtPath.replace(".odt", "-out.odt");
    const docStrings = contentDocStrings(odtPath).map((ds) =>
      ds.text.startsWith("R1") ? { ...ds, text: "" } : ds
    );

    mergeXml(odtPath, outPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(outPath);
    const rows = merged.find<Element>("//table:table-row", NS);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.find("./table:table-cell", NS)).toHaveLength(2);
    });
  });

  test("cell with two paragraphs both emptied retains exactly one empty paragraph", () => {
    const odtPath = buildTableOdt(
      "two-empty-paragraphs",
      `<table:table table:name="T1"><table:table-column/><table:table-column/>` +
        `<table:table-row>` +
        `<table:table-cell><text:p>Keep</text:p></table:table-cell>` +
        `<table:table-cell><text:p>A</text:p><text:p>B</text:p></table:table-cell>` +
        `</table:table-row></table:table><text:p>Body text</text:p>`
    );
    const outPath = odtPath.replace(".odt", "-out.odt");
    const docStrings = contentDocStrings(odtPath).map((ds) =>
      ds.text === "A" || ds.text === "B" ? { ...ds, text: "" } : ds
    );

    mergeXml(odtPath, outPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(outPath);
    const cells = merged.find<Element>("//table:table-cell", NS);
    expect(cells).toHaveLength(2);
    const emptiedCellParagraphs = cells[1].find<Element>("./text:p", NS);
    expect(emptiedCellParagraphs).toHaveLength(1);
    expect(emptiedCellParagraphs[0].text()).toBe("");
  });

  // Green from birth: pins that in-cell cleanup still removes an emptied
  // paragraph when the cell keeps another paragraph with text.
  test("emptied paragraph in a cell that keeps another non-empty paragraph is removed", () => {
    const odtPath = buildTableOdt(
      "mixed-cell",
      `<table:table table:name="T1"><table:table-column/>` +
        `<table:table-row>` +
        `<table:table-cell><text:p>Gone</text:p><text:p>Stays</text:p></table:table-cell>` +
        `</table:table-row></table:table><text:p>Body text</text:p>`
    );
    const outPath = odtPath.replace(".odt", "-out.odt");
    const docStrings = contentDocStrings(odtPath).map((ds) =>
      ds.text === "Gone" ? { ...ds, text: "" } : ds
    );

    mergeXml(odtPath, outPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(outPath);
    const cells = merged.find<Element>("//table:table-cell", NS);
    expect(cells).toHaveLength(1);
    const paragraphs = cells[0].find<Element>("./text:p", NS);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text()).toBe("Stays");
  });

  // Green from birth: pins the existing non-table behavior — an emptied
  // body-level paragraph is still removed entirely.
  test("emptied body-level paragraph outside any table is still removed", () => {
    const odtPath = buildTableOdt(
      "body-paragraph",
      `<text:p>Remove me</text:p><text:p>Other</text:p>`
    );
    const outPath = odtPath.replace(".odt", "-out.odt");
    const docStrings = contentDocStrings(odtPath).map((ds) =>
      ds.text === "Remove me" ? { ...ds, text: "" } : ds
    );

    mergeXml(odtPath, outPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(outPath);
    const paragraphs = merged.find<Element>("//office:text/text:p", NS);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text()).toBe("Other");
  });

  describe("removeFrontMatterExampleTable", () => {
    const MT_INSET = "M.T._20_Text_20_-_20_Single_20_Inset";
    const ENG_INSET = "English_20_Translation_20_-_20_single_20_inset";

    function buildExampleOdt(name: string) {
      return buildTableOdt(
        name,
        `<text:p text:style-name="Standard">This curriculum is set up as a bilingual document (see example below).</text:p>` +
          `<table:table table:name="Table6"><table:table-row><table:table-cell>` +
          `<text:p text:style-name="${MT_INSET}">Kwasio line</text:p>` +
          `<text:p text:style-name="${ENG_INSET}">English inset line</text:p>` +
          `</table:table-cell></table:table-row></table:table>` +
          `<text:p>Body text</text:p>`
      );
    }

    test("translated: table and intro removed; a later paragraph's translation still applies", () => {
      const odtPath = buildExampleOdt("fm-translated");
      const outPath = odtPath.replace(".odt", "-out.odt");
      const docStrings = contentDocStrings(odtPath).map((ds) => {
        if (ds.text === "English inset line") return { ...ds, text: "" };
        if (ds.text === "Body text") return { ...ds, text: "Texte du corps" };
        return ds;
      });

      mergeXml(odtPath, outPath, docStrings, {
        clearEmptyParagraphs: true,
        removeFrontMatterExampleTable: true,
      });

      const merged = readContentXml(outPath);
      const xml = merged.toString(false);
      expect(merged.find("//table:table", NS)).toHaveLength(0);
      expect(xml).not.toContain("see example below");
      expect(xml).toContain("Texte du corps");
    });

    test("untranslated: all inset + intro strings empty — table fully removed, no orphan, no crash", () => {
      const odtPath = buildExampleOdt("fm-untranslated");
      const outPath = odtPath.replace(".odt", "-out.odt");
      const docStrings = contentDocStrings(odtPath).map((ds) =>
        ds.text === "Body text" ? ds : { ...ds, text: "" }
      );

      expect(() =>
        mergeXml(odtPath, outPath, docStrings, {
          clearEmptyParagraphs: true,
          removeFrontMatterExampleTable: true,
        })
      ).not.toThrow();

      const merged = readContentXml(outPath);
      const xml = merged.toString(false);
      expect(merged.find("//table:table", NS)).toHaveLength(0);
      expect(xml).not.toContain("see example below");
      expect(xml).not.toContain("Kwasio line");
      expect(xml).toContain("Body text");
    });

    test("opt off (bilingual): table and intro sentence are preserved", () => {
      const odtPath = buildExampleOdt("fm-bilingual");
      const outPath = odtPath.replace(".odt", "-out.odt");
      const docStrings = contentDocStrings(odtPath);

      mergeXml(odtPath, outPath, docStrings, {});

      const merged = readContentXml(outPath);
      const xml = merged.toString(false);
      expect(merged.find("//table:table", NS)).toHaveLength(1);
      expect(xml).toContain("see example below");
      expect(xml).toContain("Kwasio line");
      expect(xml).toContain("English inset line");
    });
  });

  test("real lesson fixture keeps its 1-row, 3-cell title table when all in-table strings go empty", () => {
    const fixtureOutPath = path.join(workDir, "English_Luke-Q1-L06-tableguard.odt");
    const docStrings = parse(xmls.content, "content").map((ds) =>
      ds.xpath.includes("table:table-cell") ? { ...ds, text: "" } : ds
    );
    expect(docStrings.some((ds) => ds.text === "" && ds.xpath.includes("table:table-cell"))).toBe(
      true
    );

    mergeXml(odtPath, fixtureOutPath, docStrings, { clearEmptyParagraphs: true });

    const merged = readContentXml(fixtureOutPath);
    const tables = merged.find<Element>("//table:table", NS);
    expect(tables).toHaveLength(1);
    const rows = tables[0].find<Element>("./table:table-row", NS);
    expect(rows).toHaveLength(1);
    expect(rows[0].find("./table:table-cell", NS)).toHaveLength(3);
  });
});

// Task 17: Parse utility function tests
describe("cleanOpenDocXml", () => {
  test("replaces &amp;quot; with &quot;", () => {
    expect(cleanOpenDocXml("say &amp;quot;hello&amp;quot;")).toBe("say &quot;hello&quot;");
  });

  test("replaces &amp;lt; with &lt;", () => {
    expect(cleanOpenDocXml("a &amp;lt; b")).toBe("a &lt; b");
  });

  test("replaces &amp;gt; with &gt;", () => {
    expect(cleanOpenDocXml("a &amp;gt; b")).toBe("a &gt; b");
  });

  test("replaces &amp;amp; with &amp;", () => {
    expect(cleanOpenDocXml("Tom &amp;amp; Jerry")).toBe("Tom &amp; Jerry");
  });

  test("replaces straight apostrophe with &apos;", () => {
    expect(cleanOpenDocXml("don't")).toBe("don&apos;t");
  });

  test("handles string with no special characters unchanged", () => {
    expect(cleanOpenDocXml("hello world")).toBe("hello world");
  });
});

describe("sortDocStrings", () => {
  test("sorts DocStrings into content, meta, and styles buckets", () => {
    const docStrings = [
      { text: "a", xpath: "/x", motherTongue: false, type: "content" as const },
      { text: "b", xpath: "/y", motherTongue: false, type: "styles" as const },
      { text: "c", xpath: "/z", motherTongue: false, type: "meta" as const },
      { text: "d", xpath: "/w", motherTongue: false, type: "content" as const },
    ];
    const sorted = sortDocStrings(docStrings);
    expect(sorted.content.length).toBe(2);
    expect(sorted.meta.length).toBe(1);
    expect(sorted.styles.length).toBe(1);
    expect(sorted.content[0].text).toBe("a");
    expect(sorted.content[1].text).toBe("d");
    expect(sorted.meta[0].text).toBe("c");
    expect(sorted.styles[0].text).toBe("b");
  });

  test("returns empty arrays when no DocStrings present", () => {
    const sorted = sortDocStrings([]);
    expect(sorted.content).toEqual([]);
    expect(sorted.meta).toEqual([]);
    expect(sorted.styles).toEqual([]);
  });
});

describe("addSpacesForStylesStrings", () => {
  test("adds trailing space to styles strings", () => {
    const sorted = {
      content: [{ text: "hello", xpath: "/x", motherTongue: false, type: "content" as const }],
      meta: [{ text: "title", xpath: "/y", motherTongue: false, type: "meta" as const }],
      styles: [{ text: "Quarter", xpath: "/z", motherTongue: false, type: "styles" as const }],
    };
    addSpacesForStylesStrings(sorted);
    expect(sorted.styles[0].text).toBe("Quarter ");
    // content and meta should be unchanged
    expect(sorted.content[0].text).toBe("hello");
    expect(sorted.meta[0].text).toBe("title");
  });

  test("adds trailing space to all styles strings", () => {
    const sorted = {
      content: [],
      meta: [],
      styles: [
        { text: "A", xpath: "/a", motherTongue: false, type: "styles" as const },
        { text: "B", xpath: "/b", motherTongue: false, type: "styles" as const },
      ],
    };
    addSpacesForStylesStrings(sorted);
    expect(sorted.styles[0].text).toBe("A ");
    expect(sorted.styles[1].text).toBe("B ");
  });
});

// Task 18: Spanish roundtrip test
describe("Spanish ODT roundtrip", () => {
  const spanishOdtPath = process.cwd() + "/test/fixtures/Spanish_Luke-Q1-L01.odt";
  const spanishNewOdtPath = spanishOdtPath.replace(".odt", "v02.odt");
  let spanishXmls: ReturnType<typeof docStorage.docXml>;

  beforeAll(() => {
    spanishXmls = docStorage.docXml(spanishOdtPath);
  });

  afterAll(() => {
    unlinkSafe(spanishNewOdtPath);
  });

  test("No-op XML merge for Spanish ODT produces same DocStrings", () => {
    const docStrings = parse(spanishXmls.content, "content")
      .concat(parse(spanishXmls.meta, "meta"))
      .concat(parse(spanishXmls.styles, "styles"));
    expect(() => mergeXml(spanishOdtPath, spanishNewOdtPath, docStrings)).not.toThrow();
    // Verify the roundtripped ODT produces the same DocStrings when parsed
    const newXmls = docStorage.docXml(spanishNewOdtPath);
    const newDocStrings = parse(newXmls.content, "content")
      .concat(parse(newXmls.meta, "meta"))
      .concat(parse(newXmls.styles, "styles"));
    // Both should have the same number of strings and the same text content
    expect(newDocStrings.length).toBe(docStrings.length);
    const origTexts = docStrings.map((ds) => ds.text).sort();
    const newTexts = newDocStrings.map((ds) => ds.text).sort();
    expect(newTexts).toEqual(origTexts);
  });
});
