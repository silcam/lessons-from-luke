// import { Language } from "../../../core/models/Language";
// import { useAppSelector } from "../state/appState";
// import { Lesson } from "../../../core/models/Lesson";
// import { LanguageLesson } from "../../../core/models/LanguageLesson";

// export default function useLanguageLessons(
//   language: Language
// ): Array<Lesson | LanguageLesson> {
//   const langLessons = useAppSelector(state => state.languageLessons).filter(
//     lsn => lsn.languageId == language.languageId
//   );
//   const lessons = useAppSelector(state => state.lessons);

//   return lessons.map(lesson => {
//     const langLesson = langLessons.find(lsn => lsn.lessonId == lesson.lessonId);
//     return langLesson || lesson;
//   });
// }
