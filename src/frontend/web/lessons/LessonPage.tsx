import React, { useState } from "react";
import { lessonStringsFromLesson } from "../../../core/models/Lesson";
import useTranslation from "../../common/util/useTranslation";
import { findBy } from "../../../core/util/arrayUtils";
import { useAppSelector } from "../../common/state/appState";
import { loadLesson } from "../../common/state/lessonSlice";
import { useLoad } from "../../common/api/RequestContext";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import LoadingBox from "../../common/base-components/LoadingBox";
import Div from "../../common/base-components/Div";
import Button from "../../common/base-components/Button";
import List from "../../common/base-components/List";
import { loadTStrings } from "../../common/state/tStringSlice";
import { ENGLISH_ID } from "../../../core/models/Language";

interface IProps {
  id: number;
}

export default function LessonPage(props: IProps) {
  const t = useTranslation();
  const lesson = findBy(
    useAppSelector(state => state.lessons),
    "lessonId",
    props.id
  );
  const tStrings = useAppSelector(state => state.tStrings).filter(
    str => str.languageId == ENGLISH_ID
  );

  useLoad(loadLesson(props.id));
  useLoad(loadTStrings(ENGLISH_ID, props.id));

  const [editing, setEditing] = useState(false);

  if (!lesson)
    return (
      <MiddleOfPage>
        <LoadingBox size={8} />
      </MiddleOfPage>
    );

  return (
    <Div>
      <Button text={t("Edit")} onClick={() => setEditing(true)} />
      <List
        items={lessonStringsFromLesson(lesson)}
        renderItem={str => findBy(tStrings, "masterId", str.masterId)?.text}
      />
    </Div>
  );
}
