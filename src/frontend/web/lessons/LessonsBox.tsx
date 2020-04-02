import React, { useState } from "react";
import useTranslation from "../../common/util/useTranslation";
import Foldable from "../../common/base-components/Foldable";
import Div from "../../common/base-components/Div";
import { useAppSelector } from "../../common/state/appState";
import { useLoad } from "../../common/api/useLoad";
import { loadLessons } from "../../common/state/lessonSlice";
import { lessonName } from "../../../core/models/Lesson";
import List from "../../common/base-components/List";
import Button from "../../common/base-components/Button";
import UploadLessonForm from "./UploadLessonForm";
import AppLink from "../common/AppLink";

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
            <Button
              onClick={() => setShowUploadForm(true)}
              text={t("Add_lesson")}
            />
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
