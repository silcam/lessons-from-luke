import { Language } from "../../core/models/Language";
import { Lesson } from "../../core/models/Lesson";
import { BasicLessonVersion } from "../../core/models/LessonVersion";
import { BasicLanguageLesson } from "../../core/models/LanguageLesson";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";

interface Fixtures {
  languages: Language[];
  lessons: Lesson[];
  lessonVersions: BasicLessonVersion[];
  languageLessons: BasicLanguageLesson[];
  lessonStrings: LessonString[];
  tStrings: TString[];
}
export function fixtures(): Fixtures {
  return {
    languages: [
      { languageId: 1, name: "English", code: "ABC" },
      { languageId: 2, name: "Français", code: "DEF" },
      { languageId: 3, name: "Batanga", code: "GHI" }
    ],
    lessons: [
      { lessonId: 11, book: "Luke", series: 1, lesson: 1 },
      { lessonId: 12, book: "Luke", series: 1, lesson: 2 },
      { lessonId: 13, book: "Luke", series: 1, lesson: 3 },
      { lessonId: 14, book: "Luke", series: 1, lesson: 4 },
      { lessonId: 15, book: "Luke", series: 1, lesson: 5 }
    ],
    lessonVersions: [
      { lessonVersionId: 101, lessonId: 11, version: 1 },
      { lessonVersionId: 102, lessonId: 12, version: 1 },
      { lessonVersionId: 103, lessonId: 13, version: 1 },
      { lessonVersionId: 104, lessonId: 14, version: 1 },
      { lessonVersionId: 105, lessonId: 15, version: 1 },
      { lessonVersionId: 106, lessonId: 12, version: 2 }
    ],
    languageLessons: [
      { languageId: 1, lessonVersionId: 101 },
      { languageId: 1, lessonVersionId: 106 },
      { languageId: 1, lessonVersionId: 103 },
      { languageId: 1, lessonVersionId: 104 },
      { languageId: 1, lessonVersionId: 105 },
      { languageId: 2, lessonVersionId: 101 },
      { languageId: 2, lessonVersionId: 106 },
      { languageId: 2, lessonVersionId: 103 },
      { languageId: 2, lessonVersionId: 104 },
      { languageId: 2, lessonVersionId: 105 },
      { languageId: 3, lessonVersionId: 101 },
      { languageId: 3, lessonVersionId: 102 },
      { languageId: 3, lessonVersionId: 103 },
      { languageId: 3, lessonVersionId: 104 }
    ],
    lessonStrings: [
      {
        lessonStringId: 1,
        masterId: 1,
        lessonVersionId: 101,
        type: "content",
        xpath: "",
        motherTongue: true
      },
      {
        lessonStringId: 2,
        masterId: 1,
        lessonVersionId: 101,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 3,
        masterId: 2,
        lessonVersionId: 101,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 4,
        masterId: 3,
        lessonVersionId: 101,
        type: "content",
        xpath: "",
        motherTongue: true
      },
      {
        lessonStringId: 5,
        masterId: 3,
        lessonVersionId: 101,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 6,
        masterId: 4,
        lessonVersionId: 103,
        type: "content",
        xpath: "",
        motherTongue: false
      }
    ],
    tStrings: [
      {
        masterId: 1,
        languageId: 1,
        text: "The Book of Luke and the Birth of John the Baptizer",
        history: []
      },
      { masterId: 2, languageId: 1, text: "Lesson Overview", history: [] },
      {
        masterId: 3,
        languageId: 1,
        text: "God hears our prayers.",
        history: []
      },
      {
        masterId: 4,
        languageId: 1,
        text: "An Angel Visits Mary",
        history: []
      },
      {
        masterId: 1,
        languageId: 2,
        source: "The Book of Luke and the Birth of John the Baptizer",
        sourceLanguageId: 1,
        text: "Le livre de Luc et la naissance de Jean Baptiste",
        history: []
      },
      {
        masterId: 2,
        languageId: 2,
        source: "Lesson Overview",
        sourceLanguageId: 1,
        text: "Sommaire de la leçon",
        history: []
      },
      {
        masterId: 3,
        languageId: 2,
        source: "God hears our prayers.",
        sourceLanguageId: 1,
        text: "Dieu entend nos prières.",
        history: []
      },
      {
        masterId: 4,
        languageId: 2,
        source: "An Angel Visits Mary",
        sourceLanguageId: 1,
        text: "Un ange visite Marie",
        history: []
      },
      {
        masterId: 1,
        languageId: 3,
        text: "Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni",
        source: "Le livre de Luc et la naissance de Jean Baptiste",
        sourceLanguageId: 2,
        history: []
      },
      {
        masterId: 3,
        languageId: 3,
        text: "Njambɛ abowandi mahaleya mahu.",
        source: "Dieu entend nos prières.",
        sourceLanguageId: 2,
        history: []
      },
      {
        masterId: 4,
        languageId: 3,
        source: "Un ange visite Marie",
        sourceLanguageId: 2,
        text: "Engelesi epepwandi Mariya",
        history: []
      }
    ]
  };
}
