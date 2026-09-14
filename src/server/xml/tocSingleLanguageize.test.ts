/**
 * Characterization of `singleLanguageize` against the REAL series-2 TOC
 * master (`test/docs/serverDocs/Luke-2-99v01.odt`) — pins the mechanism
 * behind the Q2 single-language TOC defect before fixing it.
 *
 * masterIds are synthesized by exact source text, mirroring
 * `PGStorage.addOrFindMasterStrings` (which `findBy`s existing English
 * TStrings by `text`, so identical texts anywhere in the doc share one
 * masterId).
 *
 * Originally characterized the DEFECT: the M.T. front-matter subtitle
 * ("Teacher's Guide – Quarter 2") queued masterIds for its "Quarter" and "2"
 * text nodes, and the suppress queue then falsely blanked the SAME-masterId
 * text nodes of the non-MT "Quarter 2 Table of Contents" header paragraph
 * (P25 — the paragraph carrying the front-matter page break + master-page
 * switch). Now pins the FIX (1c): the queue is container-scoped, so the
 * subtitle (inside its draw:text-box) no longer covers the header (under
 * office:text), while genuine same-cell twins are still suppressed.
 */
import path from "path";
import docStorage from "../storage/docStorage";
import parse from "./parse";
import { singleLanguageize } from "../../core/models/DocString";
import { LessonString } from "../../core/models/LessonString";

const TOC_FIXTURE = path.join(process.cwd(), "test", "docs", "serverDocs", "Luke-2-99v01.odt");

function parsedWithSyntheticMasterIds() {
  const docStrings = parse(docStorage.docXml(TOC_FIXTURE).content, "content");
  const masterIdByText = new Map<string, number>();
  const lessonStrings: LessonString[] = docStrings.map((docString, i) => {
    if (!masterIdByText.has(docString.text)) {
      masterIdByText.set(docString.text, masterIdByText.size + 1);
    }
    return {
      lessonStringId: i + 1,
      masterId: masterIdByText.get(docString.text)!,
      lessonId: 1,
      lessonVersion: 1,
      type: docString.type,
      xpath: docString.xpath,
      motherTongue: docString.motherTongue,
    };
  });
  return { docStrings, lessonStrings };
}

test("container-scoped suppress queue spares the TOC header's Quarter/2 nodes but still blanks genuine same-cell twins", () => {
  const { docStrings, lessonStrings } = parsedWithSyntheticMasterIds();

  // Stand-in for "everything translated": every string keeps its source text.
  const result = singleLanguageize(lessonStrings, docStrings);

  const blanked = result
    .map((docString, i) => ({ ...docString, source: docStrings[i].text }))
    .filter((docString) => docString.text === "" && docString.source !== "");

  // The MT subtitle really does precede the header and carry the same texts.
  const subtitleXpaths = docStrings
    .filter((ds) => ds.motherTongue && ["Quarter", "2"].includes(ds.text))
    .map((ds) => ds.xpath);
  expect(subtitleXpaths.length).toBeGreaterThanOrEqual(2);

  // The defect's trigger, FIXED: the header paragraph's own "Quarter" and
  // "2" nodes — non-MT, outside any table, in a different container from
  // the MT subtitle — are NOT blanked anymore.
  const headerBlanked = blanked.filter(
    (ds) =>
      !ds.motherTongue && !ds.xpath.includes("table:table") && ["Quarter", "2"].includes(ds.source)
  );
  expect(headerBlanked).toEqual([]);

  // LEGITIMATE suppressions: the TOC rows' non-MT English twin paragraphs
  // (each sits in the SAME table cell as its MT twin).
  const twelveApostles = blanked.filter((ds) => ds.source === "The Twelve Apostles");
  expect(twelveApostles).toHaveLength(1);
  expect(twelveApostles[0].motherTongue).toBe(false);

  // The TOC column-heading cells are NOT suppressed by the queue — their
  // client-visible blanking comes from the untranslated-string path in
  // `makeDocStrings` (text: "" when no TString matches), not from here.
  const headings = blanked.filter((ds) => ["No.", "Title", "Truth", "Story"].includes(ds.source));
  expect(headings).toEqual([]);

  // "Table of Contents" has no earlier MT twin — the header's third node
  // survives suppression (its loss in production is the untranslated path).
  const toc = blanked.filter((ds) => ds.source === "Table of Contents");
  expect(toc).toEqual([]);
});
