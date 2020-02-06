import React from "react";
import { useAppSelector } from "../state/appState";
import { Language } from "../../../core/models/Language";
import { Link } from "react-router-dom";
import Heading from "../base-components/Heading";
import HeaderBar from "../base-components/HeaderBar";

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
    <div>
      <HeaderBar>
        <Heading level={2} text={props.language.name} />
      </HeaderBar>
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
    </div>
  );
}
