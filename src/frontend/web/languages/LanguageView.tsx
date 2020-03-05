import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import Heading from "../../common/base-components/Heading";
import List from "../../common/base-components/List";
import { FlexRow } from "../../common/base-components/Flex";
import { useAppSelector } from "../../common/state/appState";
import { lessonName } from "../../../core/models/Lesson";
import { findBy } from "../../../core/util/arrayUtils";
import ProgressBar from "../../common/base-components/ProgressBar";
import Button from "../../common/base-components/Button";
import useTranslation from "../../common/util/useTranslation";
import LinkButtonRow from "../../common/base-components/LinkButtonRow";
import UploadUsfmForm from "./UploadUsfmForm";
import { UploadDocForTranslationForm } from "../lessons/UploadLessonForm";
import ToggleMotherTongue from "./ToggleMotherTongue";
import Div from "../../common/base-components/Div";

interface IProps {
  language: Language;
  done: () => void;
}

export default function LanguageView(props: IProps) {
  const t = useTranslation();
  const lessons = useAppSelector(state => state.lessons);
  const [uploadUsfmForm, setUploadUsfmForm] = useState(false);
  const [uploadDocForm, setUploadDocForm] = useState(false);

  return (
    <div>
      <Button link text={`< ${t("Languages")}`} onClick={props.done} />
      <Heading text={props.language.name} level={3} />

      {uploadUsfmForm ? (
        <UploadUsfmForm
          language={props.language}
          done={() => setUploadUsfmForm(false)}
        />
      ) : uploadDocForm ? (
        <UploadDocForTranslationForm
          languageId={props.language.languageId}
          done={() => setUploadDocForm(false)}
        />
      ) : (
        <React.Fragment>
          <LinkButtonRow
            buttons={[
              [t("Translate"), `/translate/${props.language.code}`],
              [t("Upload_usfm"), () => setUploadUsfmForm(true)],
              [t("Upload_document"), () => setUploadDocForm(true)]
            ]}
          />
          <Div padVert>
            <ToggleMotherTongue language={props.language} />
          </Div>
          <List
            items={props.language.progress.filter(prg => prg.progress > 0)}
            noBorders
            noXPad
            renderItem={progress => (
              <FlexRow alignCenter>
                <Div marginRight>
                  {lessonName(findBy(lessons, "lessonId", progress.lessonId))}
                </Div>
                <ProgressBar percent={progress.progress} fixed />
              </FlexRow>
            )}
          />
        </React.Fragment>
      )}
    </div>
  );
}
