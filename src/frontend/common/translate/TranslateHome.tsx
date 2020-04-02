import React, { useState } from "react";
import { useAppSelector } from "../state/appState";
import { useLoadMultiple } from "../api/useLoad";
import { loadTranslatingLanguage, loadLanguages } from "../state/languageSlice";
import LoadingSnake from "../base-components/LoadingSnake";
import { Language, lessonProgress } from "../../../core/models/Language";
import { loadLessons } from "../state/lessonSlice";
import { StdHeaderBarPage } from "../base-components/HeaderBar";
import Alert from "../base-components/Alert";
import MiddleOfPage from "../base-components/MiddleOfPage";
import useTranslation from "../util/useTranslation";
import { lessonName } from "../../../core/models/Lesson";
import { FlexCol, FlexRow } from "../base-components/Flex";
import List from "../base-components/List";
import Button from "../base-components/Button";
import TranslateLesson from "./TranslateLesson";
import Scroll from "../base-components/Scroll";
import Colors from "../util/Colors";
import ProgressBar from "../base-components/ProgressBar";
import styled from "styled-components";
import Heading from "../base-components/Heading";
import { findBy } from "../../../core/util/arrayUtils";

interface IProps {
  code: string;
}

export type HdrMessage = "none" | "unsavedChanges" | "changesSaved";
export type SetHdrMessage = (hm: HdrMessage) => void;

export default function TranslateHome(props: IProps) {
  const t = useTranslation();
  const language = useAppSelector(state => state.languages.translating);
  const lessons = useAppSelector(state => state.lessons);
  const [hdrMessage, setHdrMessage] = useState<HdrMessage>("none");

  const loading =
    useLoadMultiple([
      loadTranslatingLanguage(props.code),
      loadLessons(),
      loadLanguages(false)
    ]) || lessons.length == 0;

  return (
    <StdHeaderBarPage
      title={language ? language.name : ""}
      logoNoLink
      renderRight={() =>
        hdrMessage == "none" ? null : (
          <Heading
            level={4}
            style={{
              color:
                hdrMessage == "unsavedChanges" ? Colors.warning : Colors.success
            }}
            text={
              hdrMessage == "unsavedChanges"
                ? t("Unsaved_changes")
                : t("Changes_saved")
            }
          />
        )
      }
    >
      <FlexCol>
        {loading ? (
          <LoadingSnake />
        ) : language ? (
          <TranslateLanguage
            language={language}
            setHdrMessage={setHdrMessage}
          />
        ) : (
          <CodeError />
        )}
      </FlexCol>
    </StdHeaderBarPage>
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

function TranslateLanguage(props: {
  language: Language;
  setHdrMessage: SetHdrMessage;
}) {
  const t = useTranslation();

  const lessons = useAppSelector(state => state.lessons);
  const [selectedLessonId, setSelectedLessonId] = useState(
    lessons.find(
      lsn =>
        (findBy(props.language.progress, "lessonId", lsn.lessonId)?.progress ||
          101) < 100
    )?.lessonId || 0
  );

  return (
    <FlexRow>
      <Scroll flexZero style={{ borderRight: `1px solid ${Colors.lightGrey}` }}>
        <List
          items={lessons}
          renderItem={lesson => (
            <div>
              <Button
                link
                unButton={lesson.lessonId == selectedLessonId}
                text={lessonName(lesson, t)}
                onClick={() => setSelectedLessonId(lesson.lessonId)}
              />
              <LessonProgressBar
                percent={lessonProgress(
                  props.language.progress,
                  lesson.lessonId
                )}
              />
            </div>
          )}
          itemKey={lesson => lesson.lessonId}
        />
      </Scroll>
      <FlexCol>
        <Scroll>
          {selectedLessonId ? (
            <TranslateLesson
              key={selectedLessonId}
              language={props.language}
              lessonId={selectedLessonId}
              setHdrMessage={props.setHdrMessage}
            />
          ) : (
            <MiddleOfPage>
              <Heading level={2} text={t("Pick_a_lesson")} />
            </MiddleOfPage>
          )}
        </Scroll>
      </FlexCol>
    </FlexRow>
  );
}

const LessonProgressBar = styled(ProgressBar)`
  margin-top: 6px;
  display: ${props => (props.percent == 0 ? "none" : "block")};
`;
