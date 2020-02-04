import React from "react";
import { useAppSelector } from "../state/appState";
import { Language } from "../../../core/models/Language";
import { Link } from "react-router-dom";

interface IProps {
  language: Language;
}

export default function TranslateIndex(props: IProps) {
  const lessons = useAppSelector(state =>
    state.languageLessons.filter(
      lesson => lesson.languageId == props.language.languageId
    )
  );

  return (
    <ul>
      {lessons.map(lesson => (
        <li key={lesson.lessonVersionId}>
          <Link
            to={`/translate/${props.language.code}/lesson/${lesson.lessonVersionId}`}
          >
            {`${lesson.book} ${lesson.series}-${lesson.lesson}`}
          </Link>
        </li>
      ))}
    </ul>
  );
}
