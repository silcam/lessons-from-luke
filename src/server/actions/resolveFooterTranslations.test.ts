/// <reference types="jest" />

import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { Lesson, TOC_LESSON } from "../../core/models/Lesson";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { resolveFooterTranslations } from "./resolveFooterTranslations";

const FRENCH_ID = 7;

const TITLE_MASTER_ID = 100;
const SUBJECT_MASTER_ID = 101;
const QUARTER_MASTER_ID = 102;
const LESSON_MASTER_ID = 103;
const PAGE_MASTER_ID = 104;

function lessonString(masterId: number, xpath: string): LessonString {
  return {
    lessonStringId: masterId,
    masterId,
    lessonId: 1,
    lessonVersion: 1,
    type: "meta",
    xpath,
    motherTongue: false,
  };
}

function tString(masterId: number, languageId: number, text: string): TString {
  return { masterId, languageId, text, history: [] };
}

function tocLesson(book: "Luke" | "Acts" = "Luke"): Lesson {
  return {
    lessonId: 1,
    book,
    series: 2,
    lesson: TOC_LESSON,
    version: 1,
    lessonStrings: [
      lessonString(TITLE_MASTER_ID, "/office:document-meta/office:meta/dc:title/text()"),
      lessonString(SUBJECT_MASTER_ID, "/office:document-meta/office:meta/dc:subject/text()"),
    ],
  };
}

/** The English corpus every non-short-circuit test resolves literals against. */
const ENGLISH_CORPUS: TString[] = [
  tString(TITLE_MASTER_ID, ENGLISH_ID, "Lessons from Luke"),
  tString(SUBJECT_MASTER_ID, ENGLISH_ID, "Teacher’s Guide"),
  tString(QUARTER_MASTER_ID, ENGLISH_ID, "Quarter"),
  tString(LESSON_MASTER_ID, ENGLISH_ID, "Lesson"),
  tString(PAGE_MASTER_ID, ENGLISH_ID, "Page"),
];

/**
 * A read-only `Persistence` double serving one English corpus and one
 * target-language translation set. Also records every call so the
 * zero-query short-circuit is assertable.
 */
function fakeStorage(translations: TString[], englishCorpus: TString[] = ENGLISH_CORPUS) {
  const calls: { languageId: number; masterIds?: number[] }[] = [];
  const storage = {
    tStrings: async (params: { languageId: number; masterIds?: number[] }) => {
      calls.push(params);
      if (params.languageId === ENGLISH_ID) return englishCorpus;
      return translations.filter(
        (ts) => !params.masterIds || params.masterIds.includes(ts.masterId)
      );
    },
  } as unknown as Persistence;
  return { storage, calls };
}

const FRENCH_TRANSLATIONS: TString[] = [
  tString(TITLE_MASTER_ID, FRENCH_ID, "Leçons de Luc"),
  tString(SUBJECT_MASTER_ID, FRENCH_ID, "Guide du moniteur"),
  tString(QUARTER_MASTER_ID, FRENCH_ID, "Trimestre"),
  tString(LESSON_MASTER_ID, FRENCH_ID, "Leçon"),
  tString(PAGE_MASTER_ID, FRENCH_ID, "Page"),
  tString(999, FRENCH_ID, "unused"),
];

describe("resolveFooterTranslations — English short-circuit", () => {
  test("issues no storage query at all", async () => {
    const { storage, calls } = fakeStorage([]);

    await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Luke", subject: "Teacher's Guide" },
    });

    expect(calls).toEqual([]);
  });

  test("still remaps BOTH book-title literals to the book's own title, so an untranslated Acts quarter stops saying 'Lessons from Luke'", async () => {
    const { storage } = fakeStorage([]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson("Acts"),
      constituentMeta: { title: "Lessons from Acts", subject: "Teacher's Guide" },
    });

    expect(result.vocabulary["Lessons from Luke"]).toBe("Lessons from Acts");
    expect(result.title).toBe("Lessons from Acts");
    expect(result.subject).toBe("Teacher's Guide");
  });

  test("maps both apostrophe spellings of the guide subtitle to a genuinely different subject", async () => {
    const { storage } = fakeStorage([]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Acts", subject: "Student Guide" },
    });

    expect(result.vocabulary["Teacher’s Guide"]).toBe("Student Guide");
    expect(result.vocabulary["Teacher's Guide"]).toBe("Student Guide");
  });

  test("omits an entry that would only respell a literal as itself — apostrophe variants included", async () => {
    const { storage } = fakeStorage([]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Luke", subject: "Teacher's Guide" },
    });

    // Nothing but the (never-matching) other book's literal: an all-English
    // Luke book's footers are left exactly as the template authored them,
    // curly apostrophe and all.
    expect(result.vocabulary["Lessons from Luke"]).toBeUndefined();
    expect(result.vocabulary["Teacher’s Guide"]).toBeUndefined();
    expect(result.vocabulary["Teacher's Guide"]).toBeUndefined();
  });

  test("maps no generic footer word — English needs no translation", async () => {
    const { storage } = fakeStorage([]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Luke", subject: "Teacher's Guide" },
    });

    expect(result.vocabulary["Quarter"]).toBeUndefined();
    expect(result.vocabulary["Lesson"]).toBeUndefined();
    expect(result.vocabulary["Page"]).toBeUndefined();
  });

  test("writes no book-title or subject key when the constituent carries no metadata to remap to", async () => {
    const { storage } = fakeStorage([]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: ENGLISH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(result.vocabulary).toEqual({});
    expect(result.title).toBe("");
    expect(result.subject).toBe("");
  });
});

describe("resolveFooterTranslations — translated language", () => {
  test("translates the generic footer words through the English corpus's master ids", async () => {
    const { storage } = fakeStorage(FRENCH_TRANSLATIONS);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Leçons de Luc", subject: "Guide du moniteur" },
    });

    expect(result.vocabulary["Quarter"]).toBe("Trimestre");
    expect(result.vocabulary["Lesson"]).toBe("Leçon");
    // "Page" translates to itself in French — an identity entry is dropped
    // so an otherwise-untranslated book needs no footer pass at all.
    expect(result.vocabulary["Page"]).toBeUndefined();
  });

  test("scopes the target-language read to just the master ids it needs (never a whole-corpus read)", async () => {
    const { storage, calls } = fakeStorage(FRENCH_TRANSLATIONS);

    await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Leçons de Luc", subject: "Guide du moniteur" },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ languageId: ENGLISH_ID });
    expect(calls[1].languageId).toBe(FRENCH_ID);
    expect(calls[1].masterIds).toEqual(
      expect.arrayContaining([TITLE_MASTER_ID, QUARTER_MASTER_ID])
    );
  });

  test("takes the already-translated title/subject straight off the constituent's own metadata", async () => {
    const { storage } = fakeStorage(FRENCH_TRANSLATIONS);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Leçons de Luc", subject: "Guide du moniteur" },
    });

    expect(result.title).toBe("Leçons de Luc");
    expect(result.subject).toBe("Guide du moniteur");
    expect(result.vocabulary["Lessons from Luke"]).toBe("Leçons de Luc");
    expect(result.vocabulary["Lessons from Acts"]).toBe("Leçons de Luc");
    expect(result.vocabulary["Teacher’s Guide"]).toBe("Guide du moniteur");
    expect(result.vocabulary["Teacher's Guide"]).toBe("Guide du moniteur");
  });

  test("falls back to the stored translation when the constituent metadata is still the untranslated English", async () => {
    const { storage } = fakeStorage(FRENCH_TRANSLATIONS);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Luke", subject: "Teacher’s Guide" },
    });

    expect(result.title).toBe("Leçons de Luc");
    expect(result.subject).toBe("Guide du moniteur");
  });

  test("falls back to the English metadata when the title/subject has no translation at all", async () => {
    const { storage } = fakeStorage([tString(QUARTER_MASTER_ID, FRENCH_ID, "Trimestre")]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "Lessons from Luke", subject: "Teacher’s Guide" },
    });

    expect(result.title).toBe("Lessons from Luke");
    expect(result.subject).toBe("Teacher’s Guide");
  });

  test("leaves an untranslated literal out of the vocabulary rather than blanking it", async () => {
    const { storage } = fakeStorage([
      tString(QUARTER_MASTER_ID, FRENCH_ID, "Trimestre"),
      tString(LESSON_MASTER_ID, FRENCH_ID, "   "),
    ]);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(result.vocabulary["Quarter"]).toBe("Trimestre");
    expect(result.vocabulary["Lesson"]).toBeUndefined();
    expect(result.vocabulary["Page"]).toBeUndefined();
  });

  test("takes the first NON-EMPTY translation when one English text maps to several master ids", async () => {
    const duplicateCorpus = [
      ...ENGLISH_CORPUS,
      tString(200, ENGLISH_ID, "Quarter"),
      tString(201, ENGLISH_ID, "Quarter"),
    ];
    const { storage } = fakeStorage(
      [tString(QUARTER_MASTER_ID, FRENCH_ID, ""), tString(201, FRENCH_ID, "Trimestre")],
      duplicateCorpus
    );

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(result.vocabulary["Quarter"]).toBe("Trimestre");
  });

  test("matches an English corpus entry spelled with the other apostrophe", async () => {
    const straightApostropheCorpus = [
      ...ENGLISH_CORPUS.filter((ts) => ts.masterId !== SUBJECT_MASTER_ID),
      tString(SUBJECT_MASTER_ID, ENGLISH_ID, "Teacher's Guide"),
    ];
    const { storage } = fakeStorage(
      [tString(SUBJECT_MASTER_ID, FRENCH_ID, "Guide du moniteur")],
      straightApostropheCorpus
    );

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(result.vocabulary["Teacher’s Guide"]).toBe("Guide du moniteur");
    expect(result.vocabulary["Teacher's Guide"]).toBe("Guide du moniteur");
  });

  test("maps the English book title from the TOC's own metadata even when it is not one of the known book literals", async () => {
    const customTitleCorpus = [
      ...ENGLISH_CORPUS.filter((ts) => ts.masterId !== TITLE_MASTER_ID),
      tString(TITLE_MASTER_ID, ENGLISH_ID, "Luke: Teacher's Guide"),
    ];
    const { storage } = fakeStorage(
      [tString(TITLE_MASTER_ID, FRENCH_ID, "Luc : Guide du moniteur")],
      customTitleCorpus
    );

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(result.vocabulary["Luke: Teacher's Guide"]).toBe("Luc : Guide du moniteur");
  });

  test("ignores a blank English corpus entry rather than letting it become a lookup key", async () => {
    const corpusWithBlank = [...ENGLISH_CORPUS, tString(300, ENGLISH_ID, "   ")];
    const { storage, calls } = fakeStorage(
      [...FRENCH_TRANSLATIONS, tString(300, FRENCH_ID, "Nic")],
      corpusWithBlank
    );

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: tocLesson(),
      constituentMeta: { title: "", subject: "" },
    });

    expect(calls[1].masterIds).not.toContain(300);
    expect(Object.values(result.vocabulary)).not.toContain("Nic");
    expect(result.vocabulary["Quarter"]).toBe("Trimestre");
  });

  test("never issues a master-id-scoped read when the English corpus matches nothing at all", async () => {
    const { storage, calls } = fakeStorage(FRENCH_TRANSLATIONS, []);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: { ...tocLesson(), lessonStrings: [] },
      constituentMeta: { title: "", subject: "" },
    });

    expect(calls).toEqual([{ languageId: ENGLISH_ID }]);
    expect(result.vocabulary).toEqual({});
  });

  test("works when the TOC lesson carries no meta lesson strings at all", async () => {
    const { storage } = fakeStorage(FRENCH_TRANSLATIONS);

    const result = await resolveFooterTranslations({
      storage,
      footerLanguageId: FRENCH_ID,
      tocLesson: { ...tocLesson(), lessonStrings: [] },
      constituentMeta: { title: "Leçons de Luc", subject: "Guide du moniteur" },
    });

    expect(result.title).toBe("Leçons de Luc");
    expect(result.vocabulary["Quarter"]).toBe("Trimestre");
  });
});
