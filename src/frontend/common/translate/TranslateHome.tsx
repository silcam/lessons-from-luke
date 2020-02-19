import React, { useState } from "react";
import { useAppSelector } from "../state/appState";
import { useLoad, useLoadMultiple } from "../api/RequestContext";
import { loadTranslatingLanguage } from "../state/languageSlice";
import LoadingSnake from "../base-components/LoadingSnake";
import { Language } from "../../../core/models/Language";
import { loadLessons } from "../state/lessonSlice";
import Heading from "../base-components/Heading";
import HeaderBar from "../base-components/HeaderBar";
import Alert from "../base-components/Alert";
import MiddleOfPage from "../base-components/MiddleOfPage";
import useTranslation from "../util/useTranslation";
import { lessonName, BaseLesson } from "../../../core/models/Lesson";
import { FlexCol, FlexRow } from "../base-components/Flex";
import List from "../base-components/List";
import Button from "../base-components/Button";
import TranslateLesson from "./TranslateLesson";
import Scroll from "../base-components/Scroll";
import LoadingSwirl from "../base-components/LoadingSwirl";
import Colors from "../util/Colors";

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

  const lessons = useAppSelector(state => state.lessons);
  const [selectedLessonId, setSelectedLessonId] = useState(0);

  return (
    <FlexRow>
      <Scroll noFill style={{ borderRight: `1px solid ${Colors.lightGrey}` }}>
        <List
          items={lessons}
          renderItem={lesson => (
            <Button
              link
              unButton={lesson.lessonId == selectedLessonId}
              text={lessonName(lesson, t)}
              onClick={() => setSelectedLessonId(lesson.lessonId)}
            />
          )}
          itemKey={lesson => lesson.lessonId}
        />
      </Scroll>
      <FlexCol>
        <Scroll pad>
          {selectedLessonId ? (
            <TranslateLesson
              language={props.language}
              lessonId={selectedLessonId}
            />
          ) : (
            <FlexRow>
              <LoadingSwirl />
            </FlexRow>
          )}
        </Scroll>
      </FlexCol>
    </FlexRow>
  );
}
