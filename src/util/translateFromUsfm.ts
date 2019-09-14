import { TDocString } from "./Storage";

interface Options {
  overwrite: boolean;
}
const DEFAULT_OPTS: Options = { overwrite: false };

type BookName = "Luke" | "Acts";

interface VerseRef {
  asString: string;
  book: BookName;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export default function translateFromUsfm(
  tStrings: TDocString[],
  usfm: string,
  opts = DEFAULT_OPTS
): { tStrings: TDocString[]; errors: string[] } {
  const usfmBook = usfmParseBook(usfm);
  const errors: string[] = [];
  const newTStrings = tStrings.map(tString => {
    try {
      if (tString.targetText.length > 0 && !opts.overwrite) return tString;
      if (!tString.mtString) return tString;

      const ref = verseRefFromTString(tString);
      if (!ref || ref.book !== usfmBook || refOnlyString(tString, ref))
        return tString;

      const passageUsfm = usfmVersesText(usfm, ref);
      const passageText = stripUsfm(passageUsfm);
      const passageTextWithRef = ref.asString + " " + passageText;

      return { ...tString, targetText: passageTextWithRef };
    } catch (err) {
      errors.push(err.message);
      return tString;
    }
  });
  return {
    tStrings: newTStrings,
    errors
  };
}

export function usfmParseBook(usfm: string): BookName {
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

function verseRefFromTString(tString: TDocString): VerseRef | null {
  const pattern = /^(Luke|Luc|Acts|Actes) (\d{1,3})(\.|:|, )(\d{1,3})(-(\d{1,3}))?/;
  const match = pattern.exec(tString.src);
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

function refOnlyString(tString: TDocString, ref: VerseRef) {
  const textPart = tString.src.slice(ref.asString.length);
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

const USFM_STRIP_PATTERNS = [
  /(\\(rq|ca|va|vp|f|fe|x|sup|fig)).+?\1\*/g, // Markers with a closing marker
  /\\(rem|h|mt|ms|mr|s|r|d|cl|cp|cd|lit).*/g, // Markers that go with the rest of the line
  /\\(sts|v|c) \S+\s/g, // Markers followed by one word
  /\\[\w*+-]+\s/g, // Other markers
  /(~|\/\/)/g // Whitespace markers
];
function stripUsfm(usfm: string) {
  let text = usfm;
  USFM_STRIP_PATTERNS.forEach(pattern => {
    text = text.replace(pattern, "");
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
