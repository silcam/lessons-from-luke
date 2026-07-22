import React from "react";
import { useAppSelector } from "../state/appState";
import { Language } from "../../../core/models/Language";
import { Link } from "react-router-dom";
import Heading from "../base-components/Heading";
import HeaderBar from "../base-components/HeaderBar";
import { lessonName } from "../../../core/models/Lesson";
import useTranslation from "../util/useTranslation";

interface IProps {
  language: Language;
}

export default function TranslateIndex(props: IProps) {
  const lessons = useAppSelector((state) => state.lessons);
  const t = useTranslation();

  return (
    <div>
      <HeaderBar>
        <Heading level={2} text={props.language.name} />
      </HeaderBar>
      <ul>
        {lessons.map((lesson) => (
          <li key={lesson.lessonId}>
            <Link to={`/translate/${props.language.code}/lesson/${lesson.lessonId}`}>
              {lessonName(lesson, t)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
