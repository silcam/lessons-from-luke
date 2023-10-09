import React, { useState } from "react";
import { Language, ENGLISH_ID } from "../../../core/models/Language";
import Heading from "../../common/base-components/Heading";
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
import Table from "../../common/base-components/Table";
import { GetDocumentButton } from "../documents/useGetDocument";
import SelectInput from "../../common/base-components/SelectInput";
import Label from "../../common/base-components/Label";
import { pushLanguageUpdate } from "../../common/state/languageSlice";
import { usePush } from "../../common/api/useLoad";


interface IProps {
  language: Language;
  done: () => void;
}

export default function LanguageView(props: IProps) {
  const t = useTranslation();
  const push = usePush();

  const lessons = useAppSelector(state => state.lessons);
  const [uploadUsfmForm, setUploadUsfmForm] = useState(false);
  const [uploadDocForm, setUploadDocForm] = useState(false);

  const [activeLang, setActiveLang] = useState(props.language);

  const languages = useAppSelector(state => state.languages);

  const handleSrcLangChange = async (v: number) => {
    setActiveLang({...activeLang, defaultSrcLang: v});
    await push(pushLanguageUpdate({ ...activeLang, defaultSrcLang: v }));
  };

  const handleMTChange = async (mt: boolean) => {
    setActiveLang({...activeLang, motherTongue: mt});
    await push(pushLanguageUpdate({ ...activeLang, motherTongue: mt }));
  };

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
            buttons={
              props.language.languageId == ENGLISH_ID
                ? [[t("Upload_usfm"), () => setUploadUsfmForm(true)]]
                : [
                    [t("Translate"), `/translate/${props.language.code}`],
                    [t("Upload_usfm"), () => setUploadUsfmForm(true)],
                    [t("Upload_document"), () => setUploadDocForm(true)]
                  ]
            }
          />
          <Div padVert>
            <Label text={t("Source_language")}>
              <SelectInput
                value={`${activeLang.defaultSrcLang}`}
                setValue={v => handleSrcLangChange(parseInt(v))}
                options={languages.adminLanguages.map(lng => [`${lng.languageId}`, lng.name])}
              />
            </Label>

          </Div>
          <Div padVert>
            <ToggleMotherTongue save={handleMTChange} language={{...activeLang}} />
          </Div>
          <Table>
            {lessons.map(lesson => {
              const progress = findBy(
                props.language.progress,
                "lessonId",
                lesson.lessonId
              )?.progress;
              if (!progress) return null;
              return (
                <tr key={lesson.lessonId}>
                  <td>{lessonName(lesson, t)}</td>
                  <td>
                    <ProgressBar percent={progress} fixed />
                  </td>
                  <td>
                    {t("Download")}
                    {":  "}
                    <GetDocumentButton
                      language={props.language}
                      lesson={lesson}
                      text="Standard"
                      majorityLanguageId={
                        props.language.motherTongue
                          ? props.language.defaultSrcLang
                          : props.language.languageId
                      }
                    />
                    {" | "}
                    <GetDocumentButton
                      language={props.language}
                      lesson={lesson}
                      text="Single-Language"
                      majorityLanguageId={0}
                    />
                  </td>
                </tr>
              );
            })}
          </Table>
        </React.Fragment>
      )}
    </div>
  );
}
