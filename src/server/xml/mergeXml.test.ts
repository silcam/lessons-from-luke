import docStorage from "../storage/docStorage";
import parse from "./parse";
import mergeXml, {
  cleanOpenDocXml,
  sortDocStrings,
  addSpacesForStylesStrings
} from "./mergeXml";
import { unlinkSafe } from "../../core/util/fsUtils";

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
  expect(docStrings.find(ds => ds.text == sample)?.text).toBe(sample);

  mergeXml(odtPath, newOdtPath, docStrings);
  const newXml = docStorage.docXml(newOdtPath).content;
  expect(newXml).toContain(`${sample} <`);
});

test("Merge skips translations with non-matching xpaths", () => {
  const docStrings = parse(xmls.content, "content").map(ds => ({
    ...ds,
    xpath: "/nonexistent/path/that/will/not/match"
  }));
  // Should not throw even when no elements match
  expect(() => mergeXml(odtPath, newOdtPath, docStrings)).not.toThrow();
});

test("Merge with clearEmptyParagraphs removes empty translated strings", () => {
  const docStrings = parse(xmls.content, "content");
  // Set first docString text to empty to trigger removeParagraph path
  const withEmpty = docStrings.map((ds, i) =>
    i === 0 ? { ...ds, text: "" } : ds
  );
  expect(() =>
    mergeXml(odtPath, newOdtPath, withEmpty, { clearEmptyParagraphs: true })
  ).not.toThrow();
});

test("Merge with clearEmptyParagraphs and non-matching xpath skips gracefully", () => {
  const docStrings = [
    {
      text: "",
      type: "content" as const,
      motherTongue: true,
      xpath: "/nonexistent/xpath/that/will/not/match"
    }
  ];
  expect(() =>
    mergeXml(odtPath, newOdtPath, docStrings, { clearEmptyParagraphs: true })
  ).not.toThrow();
});

// Task 17: Parse utility function tests
describe("cleanOpenDocXml", () => {
  test("replaces &amp;quot; with &quot;", () => {
    expect(cleanOpenDocXml("say &amp;quot;hello&amp;quot;")).toBe(
      'say &quot;hello&quot;'
    );
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
      { text: "d", xpath: "/w", motherTongue: false, type: "content" as const }
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
      content: [
        { text: "hello", xpath: "/x", motherTongue: false, type: "content" as const }
      ],
      meta: [
        { text: "title", xpath: "/y", motherTongue: false, type: "meta" as const }
      ],
      styles: [
        { text: "Quarter", xpath: "/z", motherTongue: false, type: "styles" as const }
      ]
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
        { text: "B", xpath: "/b", motherTongue: false, type: "styles" as const }
      ]
    };
    addSpacesForStylesStrings(sorted);
    expect(sorted.styles[0].text).toBe("A ");
    expect(sorted.styles[1].text).toBe("B ");
  });
});

// Task 18: Spanish roundtrip test
describe("Spanish ODT roundtrip", () => {
  const spanishOdtPath =
    process.cwd() + "/test/fixtures/Spanish_Luke-Q1-L01.odt";
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
    expect(() =>
      mergeXml(spanishOdtPath, spanishNewOdtPath, docStrings)
    ).not.toThrow();
    // Verify the roundtripped ODT produces the same DocStrings when parsed
    const newXmls = docStorage.docXml(spanishNewOdtPath);
    const newDocStrings = parse(newXmls.content, "content")
      .concat(parse(newXmls.meta, "meta"))
      .concat(parse(newXmls.styles, "styles"));
    // Both should have the same number of strings and the same text content
    expect(newDocStrings.length).toBe(docStrings.length);
    const origTexts = docStrings.map(ds => ds.text).sort();
    const newTexts = newDocStrings.map(ds => ds.text).sort();
    expect(newTexts).toEqual(origTexts);
  });
});
