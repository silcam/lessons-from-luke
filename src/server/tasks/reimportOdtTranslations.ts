import fs from "fs";
import path from "path";
import readline from "readline";
import makeStorage from "../storage/makeStorage";
import { parseDocStrings } from "../actions/updateLesson";
import { Persistence } from "../../core/interfaces/Persistence";
import { DocString, makeDocStrings, singleLanguageize } from "../../core/models/DocString";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import {
  BaseLesson,
  Book,
  Lesson,
  lessonName,
  COVER_A3_LESSON,
  COVER_A4_LESSON,
  TOC_LESSON,
} from "../../core/models/Lesson";
import { LessonString, LessonStringType } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { findBy } from "../../core/util/arrayUtils";

/*
    This script is designed to be run manually to bring translations that were edited
    outside the app back into tStrings. The input is a pair of downloaded ODTs for
    one language and lesson:

      <original>  the ODT exactly as downloaded from Lessons from Luke
      <updated>   the same ODT after its text was edited elsewhere (e.g. via a USFM
                  round trip), with the paragraph structure left intact

    Evaluate (default): pair the two files by xpath, recover each string's masterId by
    rebuilding the download from the database, and write an evaluation file listing
    masterId, current DB text, old text and new text for every change. Nothing is
    written to the database.

      node dist/server/tasks/reimportOdtTranslations.js evaluate <original> <updated>
          [--language-id N] [--lesson-id N] [--majority-language-id N] [--out DIR]

    --majority-language-id matches the download's majorityLanguageId query parameter.
    0 means the single-language download. It defaults to what the document endpoint
    uses: defaultSrcLang for a mother-tongue language, otherwise the language itself.

    Evaluate without a database: pair the two files and classify the changes only.

      node dist/server/tasks/reimportOdtTranslations.js evaluate <original> <updated> --odt-only

    Parse: print the strings the app's parser takes from one ODT, in document order, the
    same list evaluate starts from. --xpath adds a TSV header and the number, type and
    xpath of each string. Reads no database.

      node dist/server/tasks/reimportOdtTranslations.js parse <file.odt> [--xpath] [--out FILE]

    Conflicts: list the masterIds that have more than one candidate translation across
    the given evaluation files (see findConflicts), and write conflicts.tsv for the
    translator to mark up. Reads only.

      node dist/server/tasks/reimportOdtTranslations.js conflicts <evaluation.json>...
          [--out conflicts.tsv]

    Resolve: walk through the undecided conflicts one at a time, choosing a candidate or
    typing a new text, or (--from) take the choices marked in a conflicts.tsv. Decisions
    are saved into the evaluation files, with "approve" set, after each answer.

      node dist/server/tasks/reimportOdtTranslations.js resolve <evaluation.json>...
          [--from conflicts.tsv] [--redo]

    Apply: save the rows of the reviewed evaluation files whose "approve" is true. Pass
    every file for the language together, so a shared masterId is saved once.

      node dist/server/tasks/reimportOdtTranslations.js apply <evaluation.json>...
          [--dry-run [--out apply-dry-run.tsv]]

    --dry-run saves nothing: it runs every check, reports each one that would stop a real
    run, and lists what would change (current text, new text, the lessons each shared
    tString reaches), also as apply-dry-run.tsv beside the first evaluation file.
*/

// A string as it appears in an exported ODT
export interface OdtString {
  type: LessonStringType;
  xpath: string;
  text: string;
}

// A string the database says the download would contain
export interface ExpectedString {
  type: LessonStringType;
  text: string;
  masterId: number;
  lessonString: LessonString;
  tString?: TString;
  // The language whose tString filled this position (the majority language for
  // non-mother-tongue positions in a bilingual download)
  fromLanguageId: number;
  englishFallback: boolean;
}

export type ChangeKind = "text" | "unicode-only" | "whitespace-only";

export type Resolution =
  | "exact" // original ODT text equals what the DB would export today
  | "position" // DB text differs, but the string sits alone in the same gap between exact matches
  | "unresolved"; // no masterId could be recovered

export type EvaluationFlag =
  | "already-in-db"
  | "majority-language-string"
  | "db-changed-since-export"
  | "was-english-fallback"
  | "digits-added"
  | "masterId-repeated-with-different-new-text"
  | "lesson-specific-override";

export interface EvaluationRow {
  type: LessonStringType;
  xpath: string;
  masterId: number | null;
  lessonStringId: number | null;
  overrideLessonStringId: number | null;
  motherTongue: boolean | null;
  dbText: string | null;
  oldText: string;
  newText: string;
  change: ChangeKind;
  resolution: Resolution;
  flags: EvaluationFlag[];
  approve: boolean;
  // Set by resolve; apply saves decision.text instead of newText
  decision?: Decision;
  // Unresolved rows only: masterIds in this lesson whose exported text equals oldText.
  // A hint for review; apply never uses it.
  candidateMasterIds?: number[];
}

// An occurrence of a changed masterId that the updated ODT left as it was
export interface UnchangedOccurrence {
  masterId: number;
  overrideLessonStringId: number | null;
  xpath: string;
  text: string;
}

// Strings the alignment could not pair (see alignToExpected)
export interface Unmatched {
  // In the original ODT but not in today's export: these have no masterId
  inOdtNotExpected: {
    type: LessonStringType;
    xpath: string;
    text: string;
    // Set when the updated ODT changed it; such a string is also an unresolved row
    newText?: string;
    // masterIds in this lesson whose exported text is the same (see candidateMasterIds)
    candidateMasterIds: number[];
  }[];
  // In today's export but not in the original ODT. xpath is the English master's.
  expectedNotInOdt: {
    type: LessonStringType;
    masterId: number;
    lessonStringId: number;
    motherTongue: boolean;
    xpath: string;
    text: string;
  }[];
}

export type CandidateSource = "updated-odt" | "db" | "unchanged-occurrence";

export interface Decision {
  text: string;
  from: CandidateSource | "typed";
  decided: string;
}

export interface Evaluation {
  generated: string;
  odtOnly: boolean;
  originalPath: string;
  updatedPath: string;
  languageId: number | null;
  lessonId: number | null;
  lessonVersion: number | null;
  majorityLanguageId: number | null;
  summary: {
    originalStrings: number;
    updatedStrings: number;
    changed: number;
    resolvedExact: number;
    resolvedByPosition: number;
    unresolved: number;
    expectedNotInOdt: number;
    odtNotInExpected: number;
    // Twin paragraphs left unchanged while their partner was edited (see evaluate)
    unchangedTwins?: number;
  };
  rows: EvaluationRow[];
  // Absent in evaluation files written before conflicts support
  unchangedOccurrences?: UnchangedOccurrence[];
  // Absent in evaluation files written before unmatched strings were listed
  unmatched?: Unmatched;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  );
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  if (command === "parse" && positional.length === 1) {
    printParse(positional[0], {
      xpath: flags.xpath === true,
      out: typeof flags.out === "string" ? flags.out : undefined,
    });
  } else if (command === "evaluate" && positional.length === 2) {
    const [originalPath, updatedPath] = positional;
    const odtOnly = flags["odt-only"] === true;
    const storage = odtOnly ? null : makeStorage();
    const evaluation = await evaluate(storage, originalPath, updatedPath, {
      languageId: numberFlag(flags["language-id"]),
      lessonId: numberFlag(flags["lesson-id"]),
      majorityLanguageId: numberFlag(flags["majority-language-id"]),
    });
    const outDir = typeof flags.out === "string" ? flags.out : path.dirname(updatedPath);
    writeEvaluation(evaluation, outDir, path.basename(updatedPath, ".odt"));
    printSummary(evaluation);
  } else if (command === "conflicts" && positional.length > 0) {
    await listConflicts(
      makeStorage(),
      positional,
      typeof flags.out === "string" ? flags.out : undefined
    );
  } else if (command === "resolve" && positional.length > 0) {
    await resolveConflicts(makeStorage(), positional, {
      from: typeof flags.from === "string" ? flags.from : undefined,
      redo: flags.redo === true,
    });
  } else if (command === "apply" && positional.length > 0) {
    await apply(makeStorage(), positional, {
      dryRun: flags["dry-run"] === true,
      out: typeof flags.out === "string" ? flags.out : undefined,
    });
  } else {
    throw (
      "Usage: reimportOdtTranslations parse <file.odt> [--xpath] [--out FILE]\n" +
      "       reimportOdtTranslations evaluate <original.odt> <updated.odt> [--odt-only] [--language-id N] [--lesson-id N] [--majority-language-id N] [--out DIR]\n" +
      "       reimportOdtTranslations conflicts <evaluation.json>... [--out conflicts.tsv]\n" +
      "       reimportOdtTranslations resolve <evaluation.json>... [--from conflicts.tsv] [--redo]\n" +
      "       reimportOdtTranslations apply <evaluation.json>... [--dry-run [--out apply-dry-run.tsv]]"
    );
  }
}

export async function evaluate(
  storage: Persistence | null,
  originalPath: string,
  updatedPath: string,
  opts: { languageId?: number; lessonId?: number; majorityLanguageId?: number } = {}
): Promise<Evaluation> {
  const original = readOdtStrings(originalPath);
  const updated = readOdtStrings(updatedPath);
  const pairs = pairByXpath(original, updated);

  let language: Language | null = null;
  let lesson: Lesson | null = null;
  let majorityLangId: number | null = null;
  let resolved = new Map<number, Resolved>();
  let expected: ExpectedString[] = [];
  if (storage) {
    language = await resolveLanguage(storage, originalPath, opts.languageId);
    lesson = await resolveLesson(storage, originalPath, opts.lessonId);
    majorityLangId =
      opts.majorityLanguageId ??
      (language.motherTongue ? language.defaultSrcLang : language.languageId);
    expected = await expectedExportStrings(storage, lesson, language, majorityLangId);
    resolved = alignToExpected(original, expected);
  }

  const rows = pairs
    .filter(({ index, newText }) => original[index].text !== newText)
    .map(({ index, newText }) =>
      evaluationRow(
        original[index],
        newText,
        language?.languageId ?? null,
        storage ? resolved.get(index) : undefined
      )
    );
  // Unchanged occurrences of a changed masterId in this language's own text. Where the
  // download shows this language in both paragraphs of a twin pair (a non-mother-tongue
  // language), an outside edit to one paragraph leaves its twin as it was; saving the
  // tString updates the twin too, so twins are only counted. A repeat in the same kind of
  // paragraph (same motherTongue) is a real disagreement.
  const ownRows = rows.filter((row) => !row.flags.includes("majority-language-string"));
  let unchangedTwins = 0;
  const unchangedOccurrences = pairs
    .filter(({ index, newText }) => original[index].text === newText)
    .flatMap(({ index }): UnchangedOccurrence[] => {
      const res = resolved.get(index);
      if (!res || res.expected.fromLanguageId !== language?.languageId) return [];
      const sameMasterId = ownRows.filter((row) => row.masterId === res.expected.masterId);
      if (sameMasterId.length === 0) return [];
      if (
        !sameMasterId.some((row) => row.motherTongue === res.expected.lessonString.motherTongue)
      ) {
        ++unchangedTwins;
        return [];
      }
      return [
        {
          masterId: res.expected.masterId,
          overrideLessonStringId: res.expected.tString?.lessonStringId ?? null,
          xpath: original[index].xpath,
          text: original[index].text,
        },
      ];
    });
  flagRepeatedMasterIds(rows, unchangedOccurrences);
  rows.forEach((row) => (row.approve = defaultApproval(row, !!storage)));

  const resolutions = [...resolved.values()];
  const matchedExpected = new Set(resolutions.map((res) => res.expected));
  const candidates = candidateMasterIds(expected);
  rows
    .filter((row) => row.resolution === "unresolved" && storage)
    .forEach((row) => (row.candidateMasterIds = candidates(row.type, row.oldText)));
  const unmatched: Unmatched | undefined = storage
    ? {
        inOdtNotExpected: pairs
          .filter(({ index }) => !resolved.has(index))
          .map(({ index, newText }) => ({
            type: original[index].type,
            xpath: original[index].xpath,
            text: original[index].text,
            ...(newText !== original[index].text ? { newText } : {}),
            candidateMasterIds: candidates(original[index].type, original[index].text),
          })),
        expectedNotInOdt: expected
          .filter((exp) => !matchedExpected.has(exp))
          .map((exp) => ({
            type: exp.type,
            masterId: exp.masterId,
            lessonStringId: exp.lessonString.lessonStringId,
            motherTongue: exp.lessonString.motherTongue,
            xpath: exp.lessonString.xpath,
            text: exp.text,
          })),
      }
    : undefined;
  return {
    generated: new Date().toISOString(),
    odtOnly: !storage,
    originalPath,
    updatedPath,
    languageId: language?.languageId ?? null,
    lessonId: lesson?.lessonId ?? null,
    lessonVersion: lesson?.version ?? null,
    majorityLanguageId: majorityLangId,
    summary: {
      originalStrings: original.length,
      updatedStrings: updated.length,
      changed: rows.length,
      resolvedExact: rows.filter((r) => r.resolution === "exact").length,
      resolvedByPosition: rows.filter((r) => r.resolution === "position").length,
      unresolved: rows.filter((r) => r.resolution === "unresolved").length,
      expectedNotInOdt: storage ? expected.length - resolutions.length : 0,
      odtNotInExpected: storage ? original.length - resolutions.length : 0,
      unchangedTwins,
    },
    rows,
    unchangedOccurrences,
    unmatched,
  };
}

export function readOdtStrings(odtPath: string): OdtString[] {
  if (!fs.existsSync(odtPath)) throw `File not found: ${odtPath}`;
  return parseDocStrings(odtPath).map((docStr) => ({
    type: docStr.type,
    xpath: docStr.xpath,
    text: docStr.text,
  }));
}

// One string per line, as parseDocStrings returns them; with xpath, a TSV that also
// gives each string's number, type and xpath
export function printParse(odtPath: string, opts: { xpath?: boolean; out?: string } = {}) {
  const strings = readOdtStrings(odtPath);
  const lines = opts.xpath
    ? [
        ["n", "type", "xpath", "text"].join("\t"),
        ...strings.map((str, i) => [i + 1, str.type, str.xpath, tsvCell(str.text)].join("\t")),
      ]
    : strings.map((str) => tsvCell(str.text));
  const output = lines.join("\n") + "\n";
  if (opts.out) {
    fs.writeFileSync(opts.out, output);
    console.log(`Wrote ${strings.length} string(s) to ${opts.out}`);
  } else process.stdout.write(output);
}

// The updated ODT must have exactly the original's strings, at the same xpaths.
// If the outside tool added, removed or reordered paragraphs, stop: pairing by xpath
// would be wrong and this script is not the right tool for that file.
export function pairByXpath(original: OdtString[], updated: OdtString[]) {
  const key = (str: OdtString) => `${str.type}|${str.xpath}`;
  const updatedByKey = new Map(updated.map((str) => [key(str), str]));
  const missing = original.filter((str) => !updatedByKey.has(key(str)));
  const originalKeys = new Set(original.map(key));
  const extra = updated.filter((str) => !originalKeys.has(key(str)));
  if (missing.length > 0 || extra.length > 0)
    throw (
      `The updated ODT's structure differs from the original: ${missing.length} string(s) ` +
      `only in the original, ${extra.length} only in the updated file. First: ` +
      (missing[0]?.xpath ?? extra[0]?.xpath)
    );
  return original.map((str, index) => ({ index, newText: updatedByKey.get(key(str))!.text }));
}

// Mirrors makeLessonFile: the same docStrings and, for the single-language download
// (majorityLangId 0), the same suppression of majority-language twins. Empty texts
// differ by mode: the single-language download leaves the English master text in
// place, while the bilingual download blanks the paragraph.
export async function expectedExportStrings(
  storage: Persistence,
  lesson: Lesson,
  language: Language,
  majorityLangId: number
): Promise<ExpectedString[]> {
  const singleLangDoc = majorityLangId == 0;
  const mtTStrings = await storage.tStrings({
    languageId: language.languageId,
    lessonId: lesson.lessonId,
  });
  const otherLangId =
    majorityLangId > 0 && majorityLangId != language.languageId
      ? majorityLangId
      : language.languageId;
  const otherTStrings =
    otherLangId == language.languageId
      ? mtTStrings
      : await storage.tStrings({ languageId: otherLangId, lessonId: lesson.lessonId });
  const engTStrings = await storage.tStrings({ languageId: ENGLISH_ID, lessonId: lesson.lessonId });

  let docStrings = makeDocStrings(lesson.lessonStrings, mtTStrings, otherTStrings);
  if (singleLangDoc) docStrings = singleLanguageize(lesson.lessonStrings, docStrings);

  return docStrings.reduce((expected: ExpectedString[], docStr: DocString, i) => {
    if (docStr.suppressed) return expected;
    const lessonString = lesson.lessonStrings[i];
    const englishFallback = singleLangDoc && docStr.text === "";
    const text = englishFallback
      ? (findBy(engTStrings, "masterId", lessonString.masterId)?.text ?? "")
      : docStr.text;
    if (!/\S/.test(text)) return expected; // parse skips whitespace-only text nodes
    if (lessonString.type === "styles" && /^\d+$/.test(text.trim())) return expected; // and pure-number styles strings
    const fromLanguageId = lessonString.motherTongue ? language.languageId : otherLangId;
    expected.push({
      type: lessonString.type,
      text,
      masterId: lessonString.masterId,
      lessonString,
      tString: findBy(
        fromLanguageId == language.languageId ? mtTStrings : otherTStrings,
        "masterId",
        lessonString.masterId
      ),
      fromLanguageId,
      englishFallback,
    });
    return expected;
  }, []);
}

interface Resolved {
  expected: ExpectedString;
  resolution: "exact" | "position";
}

// Lines the original ODT up with the strings the DB would export, per type.
// An LCS on normalized text anchors every unchanged string; this tolerates the
// elements mergeXml removes by style (cover repetitions, the TOC example table),
// which simply show up as expected strings with no partner. Inside a gap between
// anchors, strings are paired by position only when both sides have the same count.
export function alignToExpected(
  original: OdtString[],
  expected: ExpectedString[]
): Map<number, Resolved> {
  const resolved = new Map<number, Resolved>();
  const types: LessonStringType[] = ["content", "styles", "meta"];
  types.forEach((type) => {
    const origIdx = indexesOfType(original, type);
    const expIdx = indexesOfType(expected, type);
    const a = origIdx.map((i) => normalize(original[i].text));
    const b = expIdx.map((i) => normalize(expected[i].text));
    const anchors = lcsPairs(a, b);

    let prevA = -1;
    let prevB = -1;
    [...anchors, [a.length, b.length] as [number, number]].forEach(([ai, bi]) => {
      const gapA = ai - prevA - 1;
      const gapB = bi - prevB - 1;
      if (gapA > 0 && gapA === gapB)
        for (let k = 1; k <= gapA; ++k)
          resolved.set(origIdx[prevA + k], {
            expected: expected[expIdx[prevB + k]],
            resolution: "position",
          });
      if (ai < a.length)
        resolved.set(origIdx[ai], { expected: expected[expIdx[bi]], resolution: "exact" });
      prevA = ai;
      prevB = bi;
    });
  });
  return resolved;
}

function indexesOfType(strs: { type: LessonStringType }[], type: LessonStringType) {
  return strs.reduce((idx: number[], str, i) => (str.type === type ? [...idx, i] : idx), []);
}

export function lcsPairs(a: string[], b: string[]): [number, number][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; --i)
    for (let j = b.length - 1; j >= 0; --j)
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      ++i;
      ++j;
    } else if (table[i + 1][j] >= table[i][j + 1]) ++i;
    else ++j;
  }
  return pairs;
}

export function normalize(text: string) {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

// A string the alignment could not place in order may still have the exact text of a
// string in this lesson, e.g. a twin paragraph when the wrong download mode was given.
// Returns those strings' masterIds (all of them: the same text can have several).
export function candidateMasterIds(expected: ExpectedString[]) {
  const byText = new Map<string, number[]>();
  expected.forEach((exp) => {
    const key = `${exp.type}|${normalize(exp.text)}`;
    const masterIds = byText.get(key) ?? [];
    if (!masterIds.includes(exp.masterId)) byText.set(key, [...masterIds, exp.masterId]);
  });
  return (type: LessonStringType, text: string) => byText.get(`${type}|${normalize(text)}`) ?? [];
}

export function classifyChange(oldText: string, newText: string): ChangeKind {
  if (oldText.normalize("NFC") === newText.normalize("NFC")) return "unicode-only";
  if (normalize(oldText) === normalize(newText)) return "whitespace-only";
  return "text";
}

function evaluationRow(
  orig: OdtString,
  newText: string,
  languageId: number | null,
  resolved?: Resolved
): EvaluationRow {
  const flags: EvaluationFlag[] = [];
  if (digits(newText).length > digits(orig.text).length) flags.push("digits-added");

  if (!resolved)
    return {
      type: orig.type,
      xpath: orig.xpath,
      masterId: null,
      lessonStringId: null,
      overrideLessonStringId: null,
      motherTongue: null,
      dbText: null,
      oldText: orig.text,
      newText,
      change: classifyChange(orig.text, newText),
      resolution: "unresolved",
      flags,
      approve: false,
    };

  const { expected } = resolved;
  if (expected.fromLanguageId !== languageId) flags.push("majority-language-string");
  if (normalize(expected.text) === normalize(newText)) flags.push("already-in-db");
  else if (normalize(expected.text) !== normalize(orig.text)) flags.push("db-changed-since-export");
  if (expected.englishFallback) flags.push("was-english-fallback");
  const overrideId = expected.tString?.lessonStringId ?? null;
  if (overrideId != null) flags.push("lesson-specific-override");
  return {
    type: orig.type,
    xpath: orig.xpath,
    masterId: expected.masterId,
    lessonStringId: expected.lessonString.lessonStringId,
    overrideLessonStringId: overrideId,
    motherTongue: expected.lessonString.motherTongue,
    dbText: expected.englishFallback ? null : expected.text,
    oldText: orig.text,
    newText,
    change: classifyChange(orig.text, newText),
    resolution: resolved.resolution,
    flags,
    approve: false,
  };
}

function digits(text: string) {
  return text.replace(/\D/g, "");
}

// tStrings are language-wide per masterId: one masterId can only take one new text.
// An occurrence left unchanged counts too: saving the new text changes it as well.
function flagRepeatedMasterIds(rows: EvaluationRow[], unchanged: UnchangedOccurrence[]) {
  const byMasterId = new Map<number, EvaluationRow[]>();
  rows.forEach((row) => {
    if (row.masterId == null || row.flags.includes("majority-language-string")) return;
    byMasterId.set(row.masterId, [...(byMasterId.get(row.masterId) ?? []), row]);
  });
  byMasterId.forEach((group, masterId) => {
    const texts = [
      ...group.map((row) => row.newText),
      ...unchanged.filter((occ) => occ.masterId === masterId).map((occ) => occ.text),
    ];
    if (new Set(texts.map(normalize)).size > 1)
      group.forEach((row) => row.flags.push("masterId-repeated-with-different-new-text"));
  });
}

function defaultApproval(row: EvaluationRow, haveDb: boolean) {
  return haveDb && row.resolution === "exact" && row.change === "text" && row.flags.length === 0;
}

// TODO: add the other lessons using each changed masterId to the evaluation output too.
// apply --dry-run reports them (lessonsUsingMasterIds); the reviewer would see them
// earlier if evaluate wrote them into the TSV.

async function resolveLanguage(
  storage: Persistence,
  odtPath: string,
  languageId?: number
): Promise<Language> {
  if (languageId) {
    const language = await storage.language({ languageId });
    if (!language) throw `No language with id ${languageId}`;
    return language;
  }
  // Downloads are named "<Language name>_<lesson>.odt" (makeLessonFile)
  const name = path.basename(odtPath).split("_")[0];
  const language = (await storage.languages()).find(
    (lang) => lang.name.toLowerCase() === name.toLowerCase()
  );
  if (!language) throw `No language named "${name}"; pass --language-id`;
  if (language.languageId === ENGLISH_ID) throw "English is the master language, not a translation";
  return language;
}

async function resolveLesson(
  storage: Persistence,
  odtPath: string,
  lessonId?: number
): Promise<Lesson> {
  if (!lessonId) {
    const meta = lessonMetaFromFilename(path.basename(odtPath));
    if (!meta) throw `Can't tell the lesson from "${path.basename(odtPath)}"; pass --lesson-id`;
    const match = (await storage.lessons()).find(
      (lsn: BaseLesson) =>
        lsn.book === meta.book && lsn.series === meta.series && lsn.lesson === meta.lesson
    );
    if (!match) throw `No lesson ${meta.book} ${meta.series}-${meta.lesson}; pass --lesson-id`;
    lessonId = match.lessonId;
  }
  const lesson = await storage.lesson(lessonId);
  if (!lesson) throw `No lesson with id ${lessonId}`;
  return lesson;
}

// Matches the lessonName() part of a download name, e.g. "Luke-Q1-L13", "Luke-Q1-TOC"
export function lessonMetaFromFilename(
  filename: string
): { book: Book; series: number; lesson: number } | null {
  const match = /(Luke|Acts)-Q(\d+)-(L(\d+)|TOC|Cover-A4|Cover-A3)/i.exec(filename);
  if (!match) return null;
  const book: Book = match[1].toLowerCase() === "acts" ? "Acts" : "Luke";
  const lesson = match[4]
    ? parseInt(match[4])
    : /toc/i.test(match[3])
      ? TOC_LESSON
      : /a4/i.test(match[3])
        ? COVER_A4_LESSON
        : COVER_A3_LESSON;
  return { book, series: parseInt(match[2]), lesson };
}

export function writeEvaluation(
  evaluation: Evaluation,
  outDir: string,
  baseName: string,
  quiet = false
) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${baseName}.evaluation.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(evaluation, null, 2));

  const header = [
    "approve",
    "masterId",
    "resolution",
    "change",
    "flags",
    "motherTongue",
    "type",
    "dbText",
    "oldText",
    "newText",
    "decision",
    "xpath",
    "candidateMasterIds",
  ];
  const lines = evaluation.rows.map((row) =>
    [
      row.approve,
      row.masterId,
      row.resolution,
      row.change,
      row.flags.join(","),
      row.motherTongue,
      row.type,
      row.dbText,
      row.oldText,
      row.newText,
      row.decision?.text,
      row.xpath,
      row.candidateMasterIds?.join(","),
    ]
      .map(tsvCell)
      .join("\t")
  );
  const tsvPath = path.join(outDir, `${baseName}.evaluation.tsv`);
  fs.writeFileSync(tsvPath, [header.join("\t"), ...lines].join("\n") + "\n");
  if (!quiet) console.log(`Wrote ${jsonPath}\nWrote ${tsvPath}`);

  if (evaluation.unmatched) {
    const unmatchedPath = path.join(outDir, `${baseName}.unmatched.tsv`);
    fs.writeFileSync(unmatchedPath, unmatchedTsv(evaluation.unmatched));
    if (!quiet) console.log(`Wrote ${unmatchedPath}`);
  }
}

// Both kinds of unmatched string, in document order, one table
function unmatchedTsv(unmatched: Unmatched) {
  const header = [
    "side",
    "type",
    "masterId",
    "lessonStringId",
    "motherTongue",
    "text",
    "newText",
    "xpath",
    "candidateMasterIds",
  ];
  const lines = [
    ...unmatched.inOdtNotExpected.map((str) => [
      "in-ODT-but-unexpected",
      str.type,
      null,
      null,
      null,
      str.text,
      str.newText,
      str.xpath,
      str.candidateMasterIds.join(","),
    ]),
    ...unmatched.expectedNotInOdt.map((str) => [
      "expected-but-absent",
      str.type,
      str.masterId,
      str.lessonStringId,
      str.motherTongue,
      str.text,
      null,
      str.xpath,
      null,
    ]),
  ].map((cells) => cells.map(tsvCell).join("\t"));
  return [header.join("\t"), ...lines].join("\n") + "\n";
}

function tsvCell(val: unknown) {
  return val == null ? "" : String(val).replace(/[\t\n]/g, " ");
}

function printSummary(evaluation: Evaluation) {
  const { summary, rows } = evaluation;
  const lessonInfo = evaluation.odtOnly
    ? "ODT-only: no masterIds"
    : `languageId=${evaluation.languageId} lessonId=${evaluation.lessonId} v${evaluation.lessonVersion}`;
  console.log(`\n${path.basename(evaluation.updatedPath)} (${lessonInfo})`);
  console.log(
    `  strings: ${summary.originalStrings}, changed: ${summary.changed} ` +
      `(text ${count(rows, "text")}, unicode-only ${count(rows, "unicode-only")}, ` +
      `whitespace-only ${count(rows, "whitespace-only")})`
  );
  if (!evaluation.odtOnly)
    console.log(
      `  masterId resolved: exact ${summary.resolvedExact}, by position ${summary.resolvedByPosition}, ` +
        `unresolved ${summary.unresolved}; expected-but-absent ${summary.expectedNotInOdt}, ` +
        `in-ODT-but-unexpected ${summary.odtNotInExpected}`
    );
  if (evaluation.unmatched) {
    const { inOdtNotExpected, expectedNotInOdt } = evaluation.unmatched;
    printSome(
      "in the ODT but unexpected (no masterId)",
      inOdtNotExpected.map(
        (str) =>
          `${str.text}${str.newText != null ? "  [changed]" : ""}` +
          (str.candidateMasterIds.length > 0
            ? `  (same text as m${str.candidateMasterIds.join(", m")})`
            : "")
      )
    );
    const withCandidates = inOdtNotExpected.filter((str) => str.candidateMasterIds.length > 0);
    if (withCandidates.length > 0)
      console.log(
        `    ${withCandidates.length} of ${inOdtNotExpected.length} have the same text as a ` +
          `string in this lesson: check the download mode (--majority-language-id)`
      );
    printSome(
      "expected but absent",
      expectedNotInOdt.map((str) => `m${str.masterId}: ${str.text}`)
    );
  }
  const flagged = rows.filter((row) => row.flags.length > 0);
  if (flagged.length > 0) console.log(`  flagged rows: ${flagged.length}`);
  if (summary.unchangedTwins)
    console.log(
      `  twin paragraphs left unchanged (saving updates them too): ${summary.unchangedTwins}`
    );
  console.log(`  approved by default: ${rows.filter((row) => row.approve).length}`);
}

// Lists up to 5 strings; the rest are in the .unmatched.tsv
function printSome(label: string, texts: string[]) {
  if (texts.length === 0) return;
  const shown = 5;
  console.log(`  ${label}:`);
  texts.slice(0, shown).forEach((text) => console.log(`    ${truncate(text, 70)}`));
  if (texts.length > shown) console.log(`    … ${texts.length - shown} more in the .unmatched.tsv`);
}

function truncate(text: string, length: number) {
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}

function count(rows: EvaluationRow[], change: ChangeKind) {
  return rows.filter((row) => row.change === change).length;
}

// Every file must be for the same language. Apply them together so that a masterId
// shared between lessons is saved once, after checking all files agree on its text.
// With dryRun, nothing is saved: every check runs and is reported instead of stopping
// the run, and the planned changes are printed and written to apply-dry-run.tsv.
export async function apply(
  storage: Persistence,
  evaluationPaths: string[],
  opts: { dryRun?: boolean; out?: string } = {}
) {
  const problems: string[] = [];
  const refuse = (message: string) => {
    if (!opts.dryRun) throw message;
    problems.push(message);
  };
  const evals = loadEvaluations(evaluationPaths);
  const languageId = evals[0].evaluation.languageId!;
  for (const { evaluation } of evals) {
    const lesson = await storage.lesson(evaluation.lessonId!);
    if (!lesson) throw `No lesson with id ${evaluation.lessonId}`;
    if (lesson.version !== evaluation.lessonVersion)
      refuse(
        `Lesson ${lessonName(lesson)} is now v${lesson.version}, but was v${evaluation.lessonVersion} when evaluated; re-run evaluate`
      );
  }
  const language = await storage.language({ languageId });
  if (!language) throw `No language with id ${languageId}`;

  const approved = evals.flatMap(({ evaluation }) =>
    evaluation.rows.filter((row) => row.approve && row.masterId != null)
  );
  const byKey = new Map<string, EvaluationRow[]>();
  approved.forEach((row) => {
    const key = conflictKey(row.masterId!, row.overrideLessonStringId);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  });
  const disagreeing = [...byKey.keys()].filter(
    (key) => new Set(byKey.get(key)!.map((row) => normalize(approvedText(row)))).size > 1
  );
  if (disagreeing.length > 0)
    refuse(
      `${disagreeing.length} masterId(s) have approved rows with different texts ` +
        `(${disagreeing.join(", ")}); run "conflicts" and "resolve" on these files first`
    );
  const masterIds = [...new Set(approved.map((row) => row.masterId!))];
  if (masterIds.length === 0) {
    console.log("No approved rows; nothing to save.");
    return;
  }

  // Re-check that nobody edited these strings between evaluate and apply
  const current = await storage.tStrings({ languageId: language.languageId, masterIds });
  const stale = approved.filter(
    (row) =>
      (current.find(
        (ts) => ts.masterId === row.masterId && ts.lessonStringId == row.overrideLessonStringId
      )?.text ?? null) !== row.dbText
  );
  if (stale.length > 0)
    refuse(
      `${stale.length} approved row(s) changed in the database since evaluation ` +
        `(masterIds ${[...new Set(stale.map((row) => row.masterId))].join(", ")}); re-run evaluate`
    );

  // TODO: decide what "source" should record. The translation screen stores the text the
  // translator worked from (the source language, usually defaultSrcLang, e.g. French);
  // DocStringsPage stores English. Here it is the defaultSrcLang text when present.
  const srcTStrings = await storage.tStrings({ languageId: language.defaultSrcLang, masterIds });

  const tStrings: TString[] = [...byKey.values()].map(([row]) => {
    const src = findBy(srcTStrings, "masterId", row.masterId!);
    const tString: TString = {
      masterId: row.masterId!,
      languageId: language.languageId,
      text: approvedText(row).trim(),
      history: [],
      source: src?.text ?? null,
      sourceLanguageId: src ? language.defaultSrcLang : null,
    };
    if (row.overrideLessonStringId != null) tString.lessonStringId = row.overrideLessonStringId;
    return tString;
  });

  if (opts.dryRun) {
    await reportDryRun(storage, {
      language,
      evals,
      tStrings,
      current,
      byKey,
      problems,
      stale,
      outPath: opts.out ?? path.join(path.dirname(evaluationPaths[0]), "apply-dry-run.tsv"),
    });
    return;
  }
  const saved = await storage.saveTStrings(tStrings, { awaitProgress: true });
  console.log(
    `Saved ${saved.length} tString(s) for ${language.name} from ${evals.length} evaluation file(s) ` +
      `(${tStrings.length - saved.length} unchanged)`
  );
}

function approvedText(row: EvaluationRow) {
  return row.decision?.text ?? row.newText;
}

// A tString with no lessonStringId is shared by every lesson containing its masterId,
// so saving it changes all of them. Reads every lesson: slow, but only for a dry run.
async function lessonsUsingMasterIds(storage: Persistence, masterIds: number[]) {
  const wanted = new Set(masterIds);
  const using = new Map<number, string[]>(masterIds.map((id) => [id, []]));
  for (const base of await storage.lessons()) {
    const lesson = await storage.lesson(base.lessonId);
    if (!lesson) continue;
    new Set(lesson.lessonStrings.map((ls) => ls.masterId)).forEach((id) => {
      if (wanted.has(id)) using.get(id)!.push(lessonName(lesson));
    });
  }
  return using;
}

async function reportDryRun(
  storage: Persistence,
  plan: {
    language: Language;
    evals: LoadedEvaluation[];
    tStrings: TString[];
    current: TString[];
    byKey: Map<string, EvaluationRow[]>;
    problems: string[];
    stale: EvaluationRow[];
    outPath: string;
  }
) {
  const { language, evals, tStrings, current, byKey, problems, stale } = plan;
  const using = await lessonsUsingMasterIds(
    storage,
    tStrings.map((ts) => ts.masterId)
  );
  const staleIds = new Set(stale.map((row) => row.masterId));
  const lines = tStrings.map((ts) => {
    const key = conflictKey(ts.masterId, ts.lessonStringId ?? null);
    const rows = byKey.get(key)!;
    const currentText =
      current.find((cur) => cur.masterId === ts.masterId && cur.lessonStringId == ts.lessonStringId)
        ?.text ?? null;
    const action = currentText == null ? "add" : currentText === ts.text ? "unchanged" : "update";
    const lessons = ts.lessonStringId == null ? using.get(ts.masterId)! : ["(this lesson only)"];
    return {
      key,
      action,
      currentText,
      text: ts.text,
      from: rows[0].decision ? `resolved: ${FROM_LABEL[rows[0].decision.from]}` : "updated ODT",
      rows: rows.length,
      lessons,
      problem: staleIds.has(ts.masterId) ? "changed in the database since evaluation" : "",
    };
  });

  console.log(
    `\nDRY RUN - nothing was saved. ${language.name}, ${evals.length} evaluation file(s).`
  );
  lines
    .filter((line) => line.action !== "unchanged")
    .forEach((line) => {
      console.log(
        `\n  m${line.key}  ${line.action}  [${line.from}; ${line.lessons.length} lesson(s)]`
      );
      if (line.currentText != null) console.log(`    now:  ${line.currentText}`);
      console.log(`    new:  ${line.text}`);
      if (line.problem) console.log(`    PROBLEM: ${line.problem}`);
    });
  const count = (action: string) => lines.filter((line) => line.action === action).length;
  const otherLessons = new Set(
    lines.filter((l) => l.action !== "unchanged").flatMap((l) => l.lessons)
  );
  console.log(
    `\nWould save ${count("update") + count("add")} tString(s) ` +
      `(${count("update")} update, ${count("add")} add; ${count("unchanged")} already equal), ` +
      `reaching ${otherLessons.size} lesson(s), then recalculate ${language.name}'s progress.`
  );
  if (problems.length > 0) {
    console.log(`\nA real run would REFUSE:`);
    problems.forEach((problem) => console.log(`  - ${problem}`));
  } else console.log("All checks passed; a real run would proceed.");

  const header = [
    "masterId",
    "action",
    "currentText",
    "newText",
    "from",
    "evaluationRows",
    "lessonCount",
    "lessons",
    "problem",
  ];
  const tsvLines = lines.map((line) =>
    [
      line.key,
      line.action,
      line.currentText,
      line.text,
      line.from,
      line.rows,
      line.lessons.length,
      line.lessons.join(", "),
      line.problem,
    ]
      .map(tsvCell)
      .join("\t")
  );
  fs.writeFileSync(plan.outPath, [header.join("\t"), ...tsvLines].join("\n") + "\n");
  console.log(`Wrote ${plan.outPath}`);
}

interface LoadedEvaluation {
  path: string;
  evaluation: Evaluation;
}

export function loadEvaluations(evaluationPaths: string[]): LoadedEvaluation[] {
  const evals = evaluationPaths.map((evalPath) => ({
    path: evalPath,
    evaluation: JSON.parse(fs.readFileSync(evalPath).toString()) as Evaluation,
  }));
  evals.forEach(({ path: evalPath, evaluation }) => {
    if (evaluation.odtOnly || evaluation.languageId == null || evaluation.lessonId == null)
      throw `${evalPath} was made with --odt-only and has no masterIds; re-run evaluate against the database`;
  });
  const languageIds = new Set(evals.map(({ evaluation }) => evaluation.languageId));
  if (languageIds.size > 1)
    throw `The evaluation files are for different languages (${[...languageIds].join(", ")})`;
  return evals;
}

function saveEvaluations(evals: LoadedEvaluation[]) {
  evals.forEach(({ path: evalPath, evaluation }) =>
    writeEvaluation(
      evaluation,
      path.dirname(evalPath),
      path.basename(evalPath, ".evaluation.json"),
      true
    )
  );
}

/*
    Conflicts: one masterId (one tString) for which the reviewed material offers more
    than one text. The candidates are, after normalizing whitespace and Unicode:
      - each distinct new text in the updated ODTs (repeats in one lesson, or the
        same string in several lessons' files)
      - the current database text, when it was edited in the app after the export
      - the text of an occurrence the updated ODT left unchanged
*/

export interface Candidate {
  text: string;
  sources: CandidateSource[]; // one text can be in the database and an updated ODT
  where: string[]; // "<updated file> <xpath>" of its places in the updated ODTs
}

export interface Conflict {
  key: string; // "<masterId>" or "<masterId>/<lessonStringId>" for a lesson-specific override
  masterId: number;
  oldText: string;
  dbText: string | null;
  candidates: Candidate[];
  rows: EvaluationRow[];
  decision?: Decision; // set when every row carries the same decision
}

function conflictKey(masterId: number, overrideLessonStringId: number | null) {
  return overrideLessonStringId == null ? `${masterId}` : `${masterId}/${overrideLessonStringId}`;
}

export function findConflicts(evals: LoadedEvaluation[]): Conflict[] {
  const groups = new Map<string, Conflict>();
  const addCandidate = (
    conflict: Conflict,
    text: string,
    from: CandidateSource,
    where: string | null
  ) => {
    let candidate = conflict.candidates.find((cand) => normalize(cand.text) === normalize(text));
    if (!candidate) {
      candidate = { text: text.trim(), sources: [], where: [] };
      conflict.candidates.push(candidate);
    }
    if (!candidate.sources.includes(from)) candidate.sources.push(from);
    if (where && !candidate.where.includes(where)) candidate.where.push(where);
  };

  evals.forEach(({ evaluation }) => {
    const file = path.basename(evaluation.updatedPath, ".odt");
    evaluation.rows.forEach((row) => {
      // A majority-language row edits another language's text: never a candidate here
      if (row.masterId == null || row.flags.includes("majority-language-string")) return;
      const key = conflictKey(row.masterId, row.overrideLessonStringId);
      if (!groups.has(key))
        groups.set(key, {
          key,
          masterId: row.masterId,
          oldText: row.oldText,
          dbText: row.dbText,
          candidates: [],
          rows: [],
        });
      const conflict = groups.get(key)!;
      conflict.rows.push(row);
      addCandidate(conflict, row.newText, "updated-odt", `${file} ${row.xpath}`);
      if (row.dbText != null && row.flags.includes("db-changed-since-export"))
        addCandidate(conflict, row.dbText, "db", null);
    });
  });
  evals.forEach(({ evaluation }) => {
    const file = path.basename(evaluation.updatedPath, ".odt");
    (evaluation.unchangedOccurrences ?? []).forEach((occ) => {
      const conflict = groups.get(conflictKey(occ.masterId, occ.overrideLessonStringId));
      if (conflict)
        addCandidate(conflict, occ.text, "unchanged-occurrence", `${file} ${occ.xpath}`);
    });
  });

  return [...groups.values()]
    .filter((conflict) => conflict.candidates.length > 1)
    .map((conflict) => {
      const decisions = new Set(conflict.rows.map((row) => row.decision?.text));
      return decisions.size === 1 && conflict.rows[0].decision
        ? { ...conflict, decision: conflict.rows[0].decision }
        : conflict;
    });
}

export function decide(conflict: Conflict, text: string, from: Decision["from"]) {
  const decision: Decision = { text: text.trim(), from, decided: new Date().toISOString() };
  conflict.rows.forEach((row) => {
    row.decision = decision;
    row.approve = true;
  });
  conflict.decision = decision;
}

// The English and source-language (defaultSrcLang) text of each masterId, for the
// translator's reference. Reads only.
interface ReferenceTexts {
  sourceLanguageName: string | null;
  english: Map<number, string>;
  source: Map<number, string>;
}

async function referenceTexts(
  storage: Persistence,
  languageId: number,
  masterIds: number[]
): Promise<ReferenceTexts> {
  const language = await storage.language({ languageId });
  if (!language) throw `No language with id ${languageId}`;
  const toMap = (tStrings: TString[]) => new Map(tStrings.map((ts) => [ts.masterId, ts.text]));
  const english = toMap(await storage.tStrings({ languageId: ENGLISH_ID, masterIds }));
  if (language.defaultSrcLang === ENGLISH_ID || !language.defaultSrcLang)
    return { sourceLanguageName: null, english, source: new Map() };
  const srcLanguage = await storage.language({ languageId: language.defaultSrcLang });
  return {
    sourceLanguageName: srcLanguage?.name ?? `language ${language.defaultSrcLang}`,
    english,
    source: toMap(await storage.tStrings({ languageId: language.defaultSrcLang, masterIds })),
  };
}

const FROM_LABEL: Record<Decision["from"], string> = {
  "updated-odt": "updated ODT",
  db: "current database (edited in the app after the export)",
  "unchanged-occurrence": "left unchanged in the updated ODT",
  typed: "typed in",
};

function sourcesLabel(candidate: Candidate) {
  return candidate.sources.map((source) => FROM_LABEL[source]).join(" + ");
}

function printConflict(conflict: Conflict, refs: ReferenceTexts, heading: string) {
  console.log(`\n${heading}  masterId ${conflict.key}`);
  console.log(`  English:   ${refs.english.get(conflict.masterId) ?? "?"}`);
  if (refs.sourceLanguageName)
    console.log(
      `  ${(refs.sourceLanguageName + ":").padEnd(10)} ${refs.source.get(conflict.masterId) ?? "?"}`
    );
  console.log(`  Exported:  ${conflict.oldText.trim()}`);
  conflict.candidates.forEach((cand, i) => {
    const files = [...new Set(cand.where.map((where) => where.split(" ")[0]))];
    const places =
      cand.where.length > 0 ? ` - ${cand.where.length} place(s) in ${files.join(", ")}` : "";
    console.log(`  ${i + 1}) ${cand.text}\n       [${sourcesLabel(cand)}${places}]`);
  });
  if (conflict.decision)
    console.log(`  Decided:   ${conflict.decision.text}  [${FROM_LABEL[conflict.decision.from]}]`);
}

export async function listConflicts(
  storage: Persistence,
  evaluationPaths: string[],
  tsvPath?: string
) {
  const evals = loadEvaluations(evaluationPaths);
  const conflicts = findConflicts(evals);
  if (conflicts.length === 0) {
    console.log("No conflicting translations.");
    return;
  }
  const refs = await referenceTexts(
    storage,
    evals[0].evaluation.languageId!,
    conflicts.map((conflict) => conflict.masterId)
  );
  conflicts.forEach((conflict, i) =>
    printConflict(conflict, refs, `[${i + 1}/${conflicts.length}]`)
  );
  const decided = conflicts.filter((conflict) => conflict.decision).length;
  console.log(`\n${conflicts.length} conflict(s), ${decided} decided.`);

  const outPath = tsvPath ?? path.join(path.dirname(evaluationPaths[0]), "conflicts.tsv");
  writeConflictsTsv(conflicts, refs, outPath);
  console.log(`Wrote ${outPath}`);
}

/*
    conflicts.tsv is for the translator. Each conflict has one line per candidate plus a
    "new" line. Put an x in "choose" on exactly one line per masterId; the text on that
    line is what is saved, so it may be corrected in place, or typed on the "new" line.
    Lines are read back by "resolve --from"; masterIds with no x stay undecided.
*/
const CONFLICT_TSV_HEADER = ["masterId", "option", "choose", "text", "from", "where", "exported"];

function writeConflictsTsv(conflicts: Conflict[], refs: ReferenceTexts, outPath: string) {
  const header = [
    ...CONFLICT_TSV_HEADER,
    "English",
    ...(refs.sourceLanguageName ? [refs.sourceLanguageName] : []),
  ];
  const lines = conflicts.flatMap((conflict) => {
    const refCells = [
      refs.english.get(conflict.masterId),
      ...(refs.sourceLanguageName ? [refs.source.get(conflict.masterId)] : []),
    ];
    const chosen = conflict.decision
      ? conflict.candidates.findIndex((cand) => cand.text === conflict.decision!.text)
      : -1;
    const typed = conflict.decision && chosen < 0 ? conflict.decision.text : "";
    return [
      ...conflict.candidates.map((cand, i) => [
        conflict.key,
        i + 1,
        i === chosen ? "x" : "",
        cand.text,
        sourcesLabel(cand),
        cand.where.join(" | "),
        conflict.oldText,
        ...refCells,
      ]),
      [conflict.key, "new", typed ? "x" : "", typed, "", "", conflict.oldText, ...refCells],
    ].map((cells) => cells.map(tsvCell).join("\t"));
  });
  fs.writeFileSync(outPath, [header.join("\t"), ...lines].join("\n") + "\n");
}

// Applies the choices marked in a conflicts.tsv; returns how many were decided
export function decideFromTsv(conflicts: Conflict[], tsvPath: string) {
  const [headerLine, ...lines] = fs.readFileSync(tsvPath).toString().split(/\r?\n/);
  const header = headerLine.split("\t");
  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx < 0) throw `${tsvPath} has no "${name}" column`;
    return idx;
  };
  const [keyCol, optionCol, chooseCol, textCol] = ["masterId", "option", "choose", "text"].map(col);

  const chosenByKey = new Map<string, string[][]>();
  lines
    .map((line) => line.split("\t"))
    .filter((cells) => (cells[chooseCol] ?? "").trim() !== "")
    .forEach((cells) =>
      chosenByKey.set(cells[keyCol], [...(chosenByKey.get(cells[keyCol]) ?? []), cells])
    );

  let decided = 0;
  conflicts.forEach((conflict) => {
    const chosen = chosenByKey.get(conflict.key);
    if (!chosen) return;
    if (chosen.length > 1) throw `masterId ${conflict.key} has more than one line chosen`;
    const [cells] = chosen;
    const text = (cells[textCol] ?? "").trim();
    if (text === "") throw `masterId ${conflict.key}: the chosen line has no text`;
    const candidate = conflict.candidates[parseInt(cells[optionCol]) - 1];
    decide(conflict, text, candidate && candidate.text === text ? candidate.sources[0] : "typed");
    ++decided;
  });
  return decided;
}

export async function resolveConflicts(
  storage: Persistence,
  evaluationPaths: string[],
  opts: { from?: string; redo?: boolean } = {}
) {
  const evals = loadEvaluations(evaluationPaths);
  const conflicts = findConflicts(evals);
  if (opts.from) {
    const decided = decideFromTsv(conflicts, opts.from);
    saveEvaluations(evals);
    console.log(
      `Decided ${decided} of ${conflicts.length} conflict(s) from ${opts.from}; ` +
        `${conflicts.filter((conflict) => !conflict.decision).length} still undecided.`
    );
    return;
  }

  const pending = conflicts.filter((conflict) => opts.redo || !conflict.decision);
  if (pending.length === 0) {
    console.log(`No undecided conflicts (${conflicts.length} decided; --redo to revisit).`);
    return;
  }
  const refs = await referenceTexts(
    storage,
    evals[0].evaluation.languageId!,
    pending.map((conflict) => conflict.masterId)
  );
  // Lines are read through the iterator rather than rl.question(), which drops lines that
  // arrive while no question is pending (piped input) and never returns at end of input.
  // End of input counts as quit.
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    process.stdout.write(prompt);
    const line = await lines.next();
    return line.done ? null : line.value.trim();
  };
  try {
    for (let i = 0; i < pending.length; ++i) {
      const conflict = pending[i];
      printConflict(conflict, refs, `[${i + 1}/${pending.length}]`);
      const count = conflict.candidates.length;
      for (;;) {
        const answer = await ask(`  Choose 1-${count}, (e)nter new text, (s)kip, (q)uit: `);
        if (answer == null || answer === "q") return;
        const choice = parseInt(answer);
        if (choice >= 1 && choice <= count) {
          const candidate = conflict.candidates[choice - 1];
          decide(conflict, candidate.text, candidate.sources[0]);
        } else if (answer === "e") {
          const text = await ask("  New text: ");
          if (text == null) return;
          if (text === "") continue;
          decide(conflict, text, "typed");
        } else if (answer === "s" || answer === "") {
          break;
        } else {
          continue;
        }
        saveEvaluations(evals); // after every decision, so quitting loses nothing
        break;
      }
    }
  } finally {
    rl.close();
    const undecided = conflicts.filter((conflict) => !conflict.decision).length;
    console.log(`\n${conflicts.length - undecided} of ${conflicts.length} conflict(s) decided.`);
  }
}

function parseArgs(args: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; ++i) {
    const arg = args[i];
    if (!arg.startsWith("--")) positional.push(arg);
    else if (["--odt-only", "--redo", "--dry-run", "--xpath"].includes(arg))
      flags[arg.slice(2)] = true;
    else flags[arg.slice(2)] = args[++i];
  }
  return { positional, flags };
}

function numberFlag(val: string | true | undefined) {
  if (typeof val !== "string") return undefined;
  const num = parseInt(val);
  if (isNaN(num)) throw `Not a number: ${val}`;
  return num;
}
