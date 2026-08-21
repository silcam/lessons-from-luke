import React from "react";
import { useJustLoad } from "../../common/api/useLoad";
import Axios from "axios";
import { saveAs } from "file-saver";
import { documentName, BaseLesson, isCoverLesson } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Button from "../../common/base-components/Button";

export default function useGetDocument() {
  const [load, loading] = useJustLoad();
  const getDocument = (
    language: PublicLanguage,
    lesson: BaseLesson,
    majorityLanguageId: number
  ) => {
    load((_) => async (__) => {
      const response = await Axios.get(
        `/api/languages/${language.languageId}/lessons/${lesson.lessonId}/document?majorityLanguageId=${majorityLanguageId}`,
        { responseType: "blob" }
      );
      const mode = isCoverLesson(lesson.lesson)
        ? majorityLanguageId === 0
          ? "monolingual"
          : "bilingual"
        : undefined;
      saveAs(new Blob([response.data]), documentName(language.name, lesson, mode));
    });
  };
  return { getDocument, loading };
}

export function GetDocumentButton(props: {
  language: PublicLanguage;
  lesson: BaseLesson;
  majorityLanguageId: number;
  text: string;
}) {
  const { getDocument, loading } = useGetDocument();

  return loading ? (
    <span>{props.text}</span>
  ) : (
    <Button
      link
      text={props.text}
      onClick={() => getDocument(props.language, props.lesson, props.majorityLanguageId)}
    />
  );
}
