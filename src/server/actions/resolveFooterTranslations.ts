import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { AllBooks, Lesson, lessonStringsFromLesson } from "../../core/models/Lesson";
import { TString } from "../../core/models/TString";
import {
  QUARTER_FOOTER_LITERALS,
  TEACHERS_GUIDE_CURLY,
  TEACHERS_GUIDE_STRAIGHT,
  bookTitleLiteral,
} from "../assembly/footerVocabulary";
import { ConstituentMeta } from "./prepareConstituentForAssembly";

/**
 * resolveFooterTranslations — the storage-facing half of the assembled
 * book's footer translation (see `footerVocabulary.ts` for the pure half).
 *
 * The quarter styles templates hard-code English footer text AND the Luke
 * book title, in both bilingual and monolingual masters. Everything they
 * say is already translated somewhere in the per-lesson corpus, so this
 * resolves each literal READ-ONLY:
 *
 * 1. the English corpus (`storage.tStrings({ languageId: ENGLISH_ID })`)
 *    maps each English literal's exact text to the master id(s) carrying
 *    it — exact text is NOT unique, so every match is kept, in order;
 * 2. one master-id-scoped read in the footer language turns those ids into
 *    translations, first non-empty winning.
 *
 * **Read-only is a hard requirement.** A download path must never write, so
 * this deliberately does NOT use `addOrFindMasterStrings` (which INSERTs a
 * master string on a miss). A literal with no master string simply stays
 * English.
 *
 * **The book title is fixed unconditionally**, even for an English book
 * with zero translations: the templates say "Lessons from Luke" verbatim,
 * so an Acts quarter would otherwise ship under the Luke title. Both book
 * literals — and the TOC's own English title, whatever it says — map to the
 * resolved title, which is why the English short-circuit below still
 * returns a vocabulary even though it issues no query.
 */
export interface FooterTranslations {
  /** English footer literal → its replacement. A literal absent here stays English. */
  vocabulary: Record<string, string>;
  /** The book title to write into `meta.xml` and into `text:title` caches. */
  title: string;
  /** The book subtitle to write into `meta.xml` and into `text:subject` caches. */
  subject: string;
}

export interface ResolveFooterTranslationsOptions {
  storage: Persistence;
  /**
   * The language the footers render in: the majority-translation language
   * when there is one, else the mother tongue. Styles-type LessonStrings are
   * `motherTongue: false`, so this reproduces exactly the language a
   * per-lesson download's footers show (see `makeLessonFile`'s
   * `otherTStrings` selection).
   */
  footerLanguageId: number;
  /** The TOC constituent's lesson — its meta-type strings identify the book title/subject master ids. */
  tocLesson: Lesson;
  /** The TOC constituent's own `dc:title`/`dc:subject`, already translated by `makeLessonFile` where a translation existed. */
  constituentMeta: ConstituentMeta;
}

/** `dc:title`/`dc:subject` meta-string xpath fragments, as `parse` emits them. */
const TITLE_XPATH_FRAGMENT = "dc:title";
const SUBJECT_XPATH_FRAGMENT = "dc:subject";

/**
 * Apostrophe-insensitive lookup key. The templates spell the guide
 * subtitle with a curly apostrophe in one footer and a straight one in
 * another; the corpus may carry either.
 */
function lookupKey(text: string): string {
  return text.trim().replace(/[’‘]/g, "'");
}

/** The master ids of the TOC's meta strings whose xpath names `fragment`. */
function metaMasterIds(lesson: Lesson, fragment: string): number[] {
  return lessonStringsFromLesson(lesson)
    .filter((lessonStr) => lessonStr.type === "meta" && lessonStr.xpath.includes(fragment))
    .map((lessonStr) => lessonStr.masterId);
}

/**
 * The book-title and subtitle remap — the part that must hold even with
 * zero translations available. Empty values contribute no key, so nothing
 * is ever blanked.
 */
function bookVocabulary(
  title: string,
  subject: string,
  englishTitle: string,
  englishSubject: string
): Record<string, string> {
  const vocabulary: Record<string, string> = {};
  const map = (literal: string, replacement: string): void => {
    // An entry that replaces a literal with itself is not a translation.
    // Compared apostrophe-insensitively so an English book's curly
    // "Teacher’s Guide" is not gratuitously respelled to the straight
    // metadata form — and so `assembleQuarter` can skip the footer pass
    // entirely when nothing would actually change.
    if (literal && replacement && lookupKey(literal) !== lookupKey(replacement)) {
      vocabulary[literal] = replacement;
    }
  };
  if (title) {
    AllBooks.forEach((book) => map(bookTitleLiteral(book), title));
    map(englishTitle, title);
  }
  if (subject) {
    map(TEACHERS_GUIDE_CURLY, subject);
    map(TEACHERS_GUIDE_STRAIGHT, subject);
    map(englishSubject, subject);
  }
  return vocabulary;
}

export async function resolveFooterTranslations(
  options: ResolveFooterTranslationsOptions
): Promise<FooterTranslations> {
  const { storage, footerLanguageId, tocLesson, constituentMeta } = options;
  const metaTitle = constituentMeta.title.trim();
  const metaSubject = constituentMeta.subject.trim();

  // An English book needs no lookups — but it still needs the book title
  // remap, or an Acts quarter keeps the template's literal "Lessons from
  // Luke".
  if (footerLanguageId === ENGLISH_ID) {
    return {
      vocabulary: bookVocabulary(metaTitle, metaSubject, "", ""),
      title: metaTitle,
      subject: metaSubject,
    };
  }

  const englishCorpus = await storage.tStrings({ languageId: ENGLISH_ID });
  const masterIdsByText = new Map<string, number[]>();
  const textByMasterId = new Map<number, string>();
  englishCorpus.forEach((tString: TString) => {
    const text = tString.text.trim();
    if (!text) return;
    textByMasterId.set(tString.masterId, text);
    const key = lookupKey(text);
    const ids = masterIdsByText.get(key);
    if (ids) ids.push(tString.masterId);
    else masterIdsByText.set(key, [tString.masterId]);
  });

  const titleMasterIds = metaMasterIds(tocLesson, TITLE_XPATH_FRAGMENT);
  const subjectMasterIds = metaMasterIds(tocLesson, SUBJECT_XPATH_FRAGMENT);
  const englishTitle = firstText(titleMasterIds, textByMasterId);
  const englishSubject = firstText(subjectMasterIds, textByMasterId);

  const literals = [...QUARTER_FOOTER_LITERALS, englishTitle, englishSubject].filter(Boolean);
  const masterIds = new Set<number>([...titleMasterIds, ...subjectMasterIds]);
  literals.forEach((literal) => {
    (masterIdsByText.get(lookupKey(literal)) ?? []).forEach((id) => masterIds.add(id));
  });

  const translated = masterIds.size
    ? await storage.tStrings({ languageId: footerLanguageId, masterIds: [...masterIds] })
    : [];
  const translationByMasterId = new Map<number, string>();
  translated.forEach((tString: TString) => {
    const text = tString.text.trim();
    if (text && !translationByMasterId.has(tString.masterId)) {
      translationByMasterId.set(tString.masterId, text);
    }
  });

  const translationFor = (literal: string): string | undefined =>
    firstTranslation(masterIdsByText.get(lookupKey(literal)) ?? [], translationByMasterId);

  const vocabulary: Record<string, string> = {};
  literals.forEach((literal) => {
    const translation = translationFor(literal);
    if (translation && lookupKey(translation) !== lookupKey(literal)) {
      vocabulary[literal] = translation;
    }
  });

  // The constituent's own metadata wins when `makeLessonFile` already
  // translated it; otherwise fall back to the stored translation, then to
  // the English text itself.
  const title = resolveMetaValue(metaTitle, englishTitle, titleMasterIds, translationByMasterId);
  const subject = resolveMetaValue(
    metaSubject,
    englishSubject,
    subjectMasterIds,
    translationByMasterId
  );

  return {
    vocabulary: { ...vocabulary, ...bookVocabulary(title, subject, englishTitle, englishSubject) },
    title,
    subject,
  };
}

/** The first non-empty English text among `masterIds`, or `""`. */
function firstText(masterIds: number[], textByMasterId: Map<number, string>): string {
  for (const masterId of masterIds) {
    const text = textByMasterId.get(masterId);
    if (text) return text;
  }
  return "";
}

/** The first non-empty translation among `masterIds`, or `undefined`. */
function firstTranslation(
  masterIds: number[],
  translationByMasterId: Map<number, string>
): string | undefined {
  for (const masterId of masterIds) {
    const translation = translationByMasterId.get(masterId);
    if (translation) return translation;
  }
  return undefined;
}

/** Title/subject resolution chain: translated metadata → stored translation → English. */
function resolveMetaValue(
  metaValue: string,
  englishValue: string,
  masterIds: number[],
  translationByMasterId: Map<number, string>
): string {
  if (metaValue && metaValue !== englishValue) return metaValue;
  return firstTranslation(masterIds, translationByMasterId) ?? (metaValue || englishValue);
}
