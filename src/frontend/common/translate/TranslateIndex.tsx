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
  const lessons = useAppSelector(state => state.lessons);

  return (
    <div>
      <HeaderBar>
        <Heading level={2} text={props.language.name} />
      </HeaderBar>
      <ul>
        {lessons.map(lesson => (
          <li key={lesson.lessonId}>
            <Link
              to={`/translate/${props.language.code}/lesson/${lesson.lessonId}`}
            >
              {`${lesson.book} ${lesson.series}-${lesson.lesson}`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
