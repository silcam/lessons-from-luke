import { TString } from "../../core/models/TString";
import { Book } from "../../core/models/Lesson";

interface VerseRef {
  asString: string;
  book: Book;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

interface Translation {
  sourceTString: TString;
  text: string;
}

export const VerseStringPattern = /^(Luke|Luc|Acts|Actes) (\d{1,3})(\.|:|, )(\d{1,3})(-(\d{1,3}))?/;

export default function translateFromUsfm(
  engStrings: TString[],
  usfm: string
): { translations: Translation[]; errors: string[] } {
  const usfmBook = usfmParseBook(usfm);
  const mtBookName = usfmParseLocalBookName(usfm);
  const errors: string[] = [];
  const translations = engStrings.reduce(
    (translations: Translation[], engString) => {
      try {
        const ref = verseRefFromTString(engString);
        if (!ref || ref.book !== usfmBook || refOnlyString(engString, ref))
          return translations;

        const passageUsfm = usfmVersesText(usfm, ref);
        const passageText = stripUsfm(passageUsfm);
        const passageTextWithRef =
          localRef(ref, mtBookName) + " " + passageText;

        return translations.concat({
          sourceTString: engString,
          text: passageTextWithRef
        });
      } catch (err) {
        errors.push(err.message);
        return translations;
      }
    },
    []
  );
  return {
    translations,
    errors
  };
}

function localRef(ref: VerseRef, mtBookName: string | null) {
  return mtBookName ? ref.asString.replace(/^\w+/, mtBookName) : ref.asString;
}

export function usfmParseBook(usfm: string): Book {
  const idMarkerIndex = indexOfMarker(usfm, "id");
  if (idMarkerIndex === null) throw parseError("\\id not found");
  const bookName = usfm.substr(idMarkerIndex + 4, 3);
  switch (bookName) {
    case "LUK":
      return "Luke";
    case "ACT":
      return "Acts";
  }
  throw parseError("File not for Luke or Acts");
}

export function usfmParseLocalBookName(usfm: string): string | null {
  const match = /^\\h (.+)/m.exec(usfm);
  return match && match[1];
}

function verseRefFromTString(tString: TString): VerseRef | null {
  const match = VerseStringPattern.exec(tString.text);
  if (!match) return null;
  const bookName = match[1].startsWith("Lu") ? "Luke" : "Acts";
  const startVerse = parseInt(match[4]);
  return {
    asString: match[0],
    book: bookName,
    chapter: parseInt(match[2]),
    startVerse,
    endVerse: match[6] ? parseInt(match[6]) : startVerse
  };
}

function refOnlyString(tString: TString, ref: VerseRef) {
  const textPart = tString.text.slice(ref.asString.length);
  return !/\w/.test(textPart);
}

function usfmVersesText(usfm: string, ref: VerseRef): string {
  const chapterUsfm = usfmChapterText(usfm, ref.chapter);
  const verseStartIndex = indexOfMarker(
    chapterUsfm,
    `v ${ref.startVerse}(-\\d+)?`
  );
  if (verseStartIndex === null)
    throw parseError(
      `Verse ${ref.startVerse} not found in chapter ${ref.chapter}.`
    );

  // First check for a marker for the endVerse
  let verseEndIndex = indexOfMarker(
    chapterUsfm,
    `v ${ref.endVerse}`,
    verseStartIndex
  );
  // It may be in a \v x-y pattern
  if (verseEndIndex === null)
    verseEndIndex = indexOfMarker(chapterUsfm, `v \\d+-${ref.endVerse}`);
  if (verseEndIndex === null)
    throw parseError(
      `Verse ${ref.endVerse} not found in chapter ${ref.chapter}.`
    );

  // Now find any \v after the end verse marker
  const endPassageIndex = indexOfMarker(chapterUsfm, "v", verseEndIndex + 2);

  return endPassageIndex
    ? chapterUsfm.slice(verseStartIndex, endPassageIndex)
    : chapterUsfm.slice(verseStartIndex); // End verse was the last verse in the chapter
}

function usfmChapterText(usfm: string, chapter: number) {
  const text = usfmSubsection(usfm, "c", chapter, chapter);
  if (text === null) throw parseError(`Chapter ${chapter} not found.`);
  return text;
}

function usfmSubsection(
  usfm: string,
  mrkr: string,
  start: number,
  end: number
) {
  const startIndex = indexOfMarker(usfm, `${mrkr} ${start}`);
  if (startIndex === null) return null;
  let endIndex = indexOfMarker(usfm, `${mrkr} ${end + 1}`);
  if (endIndex === null) endIndex = usfm.length;
  return usfm.slice(startIndex, endIndex);
}

// Each replace pattern is an array where the first element is a regex to find
// And the optional second element is what to replace it with
// If no second element is given, the search pattern is replaced with an empty string
const USFM_REPLACE_PATTERNS: Array<[RegExp, string] | [RegExp]> = [
  [/\\w (.+?)\|.+?\\w\*/g, "$1"], // Word tags with attributes
  [/(\\(rq|ca|va|vp|f|fe|x|sup|fig)).+?\1\*/g], // Markers with a closing marker
  [/\\(rem|h|mt|ms|mr|s|r|d|cl|cp|cd|lit).*/g], // Markers that go with the rest of the line
  [/\\(sts|v|c) \S+\s/g], // Markers followed by one word
  [/\\[\w*+-]+/g], // Other markers
  [/(~|\/\/)/g] // Whitespace markers
];
function stripUsfm(usfm: string) {
  let text = usfm;
  USFM_REPLACE_PATTERNS.forEach(replacePattern => {
    text = text.replace(replacePattern[0], replacePattern[1] || "");
  });
  text = text.replace(/\s+/g, " "); // Replace all whitespace sections with a single space
  return text.trim();
}

function indexOfMarker(usfm: string, mrkr: string, startIndex?: number) {
  const pattern = RegExp(`\\\\${mrkr}\\s`);
  const searchText = startIndex ? usfm.slice(startIndex) : usfm;
  const match = searchText.match(pattern);
  if (!match) return null;
  return match.index! + (startIndex || 0);
}

function parseError(msg: string) {
  return Error(`USFM Parse Error - ${msg}`);
}
