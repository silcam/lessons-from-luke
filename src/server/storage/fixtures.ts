import { Language } from "../../core/models/Language";
import { BaseLesson } from "../../core/models/Lesson";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";

interface Fixtures {
  languages: Language[];
  lessons: BaseLesson[];
  lessonStrings: LessonString[];
  oldLessonStrings: LessonString[];
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
      { lessonId: 11, book: "Luke", series: 1, lesson: 1, version: 2 },
      { lessonId: 12, book: "Luke", series: 1, lesson: 2, version: 2 },
      { lessonId: 13, book: "Luke", series: 1, lesson: 3, version: 2 },
      { lessonId: 14, book: "Luke", series: 1, lesson: 4, version: 2 },
      { lessonId: 15, book: "Luke", series: 1, lesson: 5, version: 2 }
    ],
    lessonStrings: [
      {
        lessonStringId: 1,
        masterId: 1,
        lessonId: 11,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: true
      },
      {
        lessonStringId: 2,
        masterId: 1,
        lessonId: 11,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 3,
        masterId: 2,
        lessonId: 11,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 4,
        masterId: 3,
        lessonId: 11,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: true
      },
      {
        lessonStringId: 5,
        masterId: 3,
        lessonId: 11,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: false
      },
      {
        lessonStringId: 6,
        masterId: 4,
        lessonId: 12,
        lessonVersion: 2,
        type: "content",
        xpath: "",
        motherTongue: false
      }
    ],
    oldLessonStrings: [],
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
