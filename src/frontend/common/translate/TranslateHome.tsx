import React, { useState } from "react";
import { useAppSelector } from "../state/appState";
import { useLoad, useLoadMultiple } from "../api/RequestContext";
import { loadTranslatingLanguage } from "../state/languageSlice";
import LoadingSnake from "../base-components/LoadingSnake";
import { Language } from "../../../core/models/Language";
import { loadLanguageLessons } from "../state/languageLessonSlice";
import { loadLessons } from "../state/lessonSlice";
import Heading from "../base-components/Heading";
import HeaderBar from "../base-components/HeaderBar";
import Alert from "../base-components/Alert";
import MiddleOfPage from "../base-components/MiddleOfPage";
import useTranslation from "../util/useTranslation";
import { lessonName } from "../../../core/models/Lesson";
import { FlexCol, FlexRow } from "../base-components/Flex";
import List from "../base-components/List";
import { LanguageLesson } from "../../../core/models/LanguageLesson";
import Button from "../base-components/Button";
import TranslateLesson from "./TranslateLesson";
import Scroll from "../base-components/Scroll";

interface IProps {
  code: string;
}

export default function TranslateHome(props: IProps) {
  const language = useAppSelector(state => state.languages.translating);
  const lessons = useAppSelector(state => state.lessons);

  const loading =
    useLoadMultiple([loadTranslatingLanguage(props.code), loadLessons()]) ||
    lessons.length == 0;

  return (
    <FlexCol flexRoot>
      <HeaderBar>
        <Heading
          text={language ? language.name : "Lessons from Luke"}
          level={2}
        />
      </HeaderBar>
      <FlexCol>
        {loading ? (
          <LoadingSnake />
        ) : language ? (
          <TranslateLanguage language={language} />
        ) : (
          <CodeError />
        )}
      </FlexCol>
    </FlexCol>
  );
}

function CodeError() {
  const t = useTranslation();
  return (
    <MiddleOfPage>
      <Alert danger>{t("Code_error")}</Alert>
    </MiddleOfPage>
  );
}

function TranslateLanguage(props: { language: Language }) {
  const t = useTranslation();
  const loading = useLoad(loadLanguageLessons(props.language.languageId));

  const lessons = useAppSelector(state => state.languageLessons).filter(
    lsn => lsn.languageId == props.language.languageId
  );
  const [selectedLesson, setSelectedLesson] = useState<null | LanguageLesson>(
    null
  );

  return loading ? (
    <LoadingSnake />
  ) : (
    <FlexRow>
      <Scroll noFill>
        <List
          items={lessons}
          renderItem={lesson => (
            <Button
              link
              unButton={lesson == selectedLesson}
              text={lessonName(lesson, t)}
              onClick={() => setSelectedLesson(lesson)}
            />
          )}
          itemKey={lesson => lesson.lessonId}
        />
      </Scroll>
      <FlexCol>
        <Scroll pad>
          {selectedLesson ? (
            <TranslateLesson
              language={props.language}
              lesson={selectedLesson}
            />
          ) : (
            <Heading text="Hi, y'all" level={1} />
          )}
        </Scroll>
      </FlexCol>
    </FlexRow>
  );
}
