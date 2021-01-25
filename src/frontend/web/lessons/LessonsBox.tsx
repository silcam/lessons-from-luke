import React, { useState } from "react";
import useTranslation from "../../common/util/useTranslation";
import Foldable from "../../common/base-components/Foldable";
import Div from "../../common/base-components/Div";
import { FlexRow } from "../../common/base-components/Flex";
import { useAppSelector } from "../../common/state/appState";
import { useLoad } from "../../common/api/useLoad";
import { loadLessons } from "../../common/state/lessonSlice";
import { lessonName } from "../../../core/models/Lesson";
import List from "../../common/base-components/List";
import Button from "../../common/base-components/Button";
import UploadLessonForm from "./UploadLessonForm";
import AppLink from "../common/AppLink";
import { Link } from "react-router-dom";

export default function LessonsBox() {
  const t = useTranslation();
  const lessons = useAppSelector(state => state.lessons);

  useLoad(loadLessons());

  const [showUploadForm, setShowUploadForm] = useState(false);

  return (
    <Foldable
      startUnFolded
      title={t("Lessons")}
      render={folded =>
        folded ? null : showUploadForm ? (
          <UploadLessonForm done={() => setShowUploadForm(false)} />
        ) : (
          <Div>
            <FlexRow>
              <Button
                onClick={() => setShowUploadForm(true)}
                text={t("Add_lesson")}
              />
              <Link to="/update-issues">
                <Button
                  onClick={() => {}}
                  text={t("Resolve_lesson_update_issues")}
                />
              </Link>
            </FlexRow>
            <List
              items={lessons}
              noBorders
              renderItem={lesson => (
                <AppLink to={`/lessons/${lesson.lessonId}`}>
                  {lessonName(lesson)}
                </AppLink>
              )}
            />
          </Div>
        )
      }
    />
  );
}
