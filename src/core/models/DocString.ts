import { LessonStringType, LessonString } from "./LessonString";
import { TString } from "./TString";
import { findBy } from "../util/arrayUtils";

export interface DocString {
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
  text: string;
  /**
   * Set by `singleLanguageize` on majority-language strings it blanked
   * because a mother-tongue twin covers them. Distinguishes "blank because
   * suppressed" (paragraph should be removed from the doc) from "blank
   * because untranslated" (`text: ""` from `makeDocStrings` — the source
   * text should be left in place).
   */
  suppressed?: boolean;
}

export function makeDocStrings(
  lessonStrings: LessonString[],
  mtTStrings: TString[],
  otherTStrings: TString[]
): DocString[] {
  return lessonStrings.map((lsnStr) => ({
    type: lsnStr.type,
    xpath: lsnStr.xpath,
    motherTongue: lsnStr.motherTongue,
    text:
      findBy(lsnStr.motherTongue ? mtTStrings : otherTStrings, "masterId", lsnStr.masterId)?.text ||
      "",
  }));
}

// For creating a single-language document for a lesson
// It needs to strip majority language strings when there are corresponding mother language strings
// This algorithm works by moving through the strings keeping track of the idSuppressQueue
// Any found mother tongue strings put their master id in the queue
// When a corresponding majority language string is found, that id is removed from the queue along with any
// other ids before it in the queue (Some may not have matches due to inconsistency in the doc; this
// approach keeps them from matching further down than they should)
// Matched majority language strings have their text replaced with "" in the docstrings
export function singleLanguageize(lessonStrings: LessonString[], docStrings: DocString[]) {
  const idSuppressQueue: { masterId: number; scope: string }[] = [];
  return docStrings.map((docString, i) => {
    const lessonString = lessonStrings[i];
    if (lessonString.motherTongue) {
      idSuppressQueue.push({
        masterId: lessonString.masterId,
        scope: suppressionScope(docString.xpath),
      });
      return docString;
    }

    // Scope guard: a queued MT string only covers a majority-language twin
    // in the SAME container (table cell, text box, body...). masterIds are
    // deduped by exact text across the whole document, so without this an
    // MT string anywhere (e.g. the front-matter subtitle's "Quarter"/"2")
    // falsely suppresses identical text in unrelated paragraphs (the TOC
    // header) — a cross-container id match is NOT a twin and must neither
    // suppress nor consume the queue.
    const scope = suppressionScope(docString.xpath);
    const matchIndex = idSuppressQueue.findIndex(
      (entry) => entry.masterId === lessonString.masterId && entry.scope === scope
    );
    if (matchIndex >= 0) {
      idSuppressQueue.splice(0, matchIndex + 1);
      return { ...docString, text: "", suppressed: true };
    }

    return docString;
  });
}

/**
 * The xpath of the container a string's paragraph lives in — everything
 * before the string's LAST `text:p`/`text:h` step (twins are sibling
 * paragraphs, so their shared container is the paragraph's parent: a table
 * cell, a draw:text-box, or office:text itself), with `text:list`/
 * `text:list-item` steps dropped: lists are formatting wrappers around
 * paragraphs, and real masters routinely put the MT twin in a bullet list
 * with its majority-language twin as a plain sibling paragraph. Non-paragraph
 * xpaths (synthetic, meta, styles) fall back to dropping the trailing
 * `text()` and final step.
 */
function suppressionScope(xpath: string): string {
  const paragraphMatch = xpath.match(/^(.*)\/text:[ph](\[\d+\])?(\/.*)?$/);
  const container = paragraphMatch
    ? paragraphMatch[1]
    : xpath.replace(/\/text\(\)$/, "").replace(/\/[^/]*$/, "");
  return container.replace(/\/text:list(-item|-header)?(\[\d+\])?(?=\/|$)/g, "");
}

export function makeWebifyDocStrings(lessonStrings: LessonString[]): DocString[] {
  return lessonStrings.map((lsnStr) => ({
    type: lsnStr.type,
    xpath: lsnStr.xpath,
    motherTongue: lsnStr.motherTongue,
    text: `##${lsnStr.lessonStringId}##`,
  }));
}
