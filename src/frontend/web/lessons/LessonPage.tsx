import React, { useState } from "react";
import { lessonName } from "../../../core/models/Lesson";
import useTranslation from "../../common/util/useTranslation";
import { loadLesson, pushLessonStrings } from "../../common/state/lessonSlice";
import { useLoad, usePush, useLoadMultiple } from "../../common/api/useLoad";
import Div from "../../common/base-components/Div";
import { FlexRow } from "../../common/base-components/Flex";
import Button from "../../common/base-components/Button";
import List from "../../common/base-components/List";
import { loadTStrings } from "../../common/state/tStringSlice";
import { ENGLISH_ID } from "../../../core/models/Language";
import TStringSpan from "../../common/base-components/TStringSpan";
import useLessonTStrings from "../../common/translate/useLessonTStrings";
import LessonEditor, { docStringsFromLessonTStrings } from "./LessonEditor";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Scroll from "../../common/base-components/Scroll";
import { DocString } from "../../../core/models/DocString";
import { Link } from "react-router-dom";
import HeaderMessage, { HdrMessage } from "../../common/translate/HeaderMessage";

interface IProps {
  id: number;
}

export default function LessonPage(props: IProps) {
  const t = useTranslation();
  const push = usePush();
  const { lesson, lessonTStrings } = useLessonTStrings(props.id, [ENGLISH_ID]);

  const loading = useLoadMultiple([
    loadLesson(props.id),
    loadTStrings(ENGLISH_ID, props.id)
  ]);

  const [editing, setEditing] = useState(false);
  const [hdrMessage, setHdrMessage] = useState<HdrMessage>("none");
  const [docStrings, setDocStrings] = useState<DocString[]>([]);
  const startEditing = () => {
    setDocStrings(docStringsFromLessonTStrings(lessonTStrings));
    setEditing(true);
  };

  const save = async () => {
    const result = await push(pushLessonStrings(props.id, docStrings));
    if (result) {
      setEditing(false);
      setHdrMessage("changesSaved");
      setTimeout(() => setHdrMessage("none"), 3000);
    }
  };

  return (
    <StdHeaderBarPage
      title={lesson ? lessonName(lesson) : ""}
      renderRight={() =>
        editing ? (
          <React.Fragment>
            <HeaderMessage hdrMessage={hdrMessage} />
            <Button text={t("Save")} onClick={save} />
            <Button red text={t("Cancel")} onClick={() => setEditing(false)} />
          </React.Fragment>
        ) : loading || !lesson ? null : (
          <FlexRow>
            <Button text={t("Edit")} onClick={startEditing} />
            <Link to={`/update-issues/${props.id}`}>
              <Button text={t("Update_issues")} onClick={() => {}} />
            </Link>
          </FlexRow>
        )
      }
    >
      {lesson && editing ? (
        <LessonEditor {...{ docStrings, setDocStrings }} />
      ) : (
        <Div>
          <List
            items={lessonTStrings}
            renderItem={ltStr => (
              <TStringSpan
                text={ltStr.tStrs[0]?.text}
                motherTongue={ltStr.lStr.motherTongue}
              />
            )}
          />
        </Div>
      )}
    </StdHeaderBarPage>
  );
}
