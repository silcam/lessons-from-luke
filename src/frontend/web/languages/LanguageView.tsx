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
import { pushLanguageUpdate, pushArchiveLanguage } from "../../common/state/languageSlice";
import { usePush } from "../../common/api/useLoad";
import ConfirmDialog from "../../common/base-components/ConfirmDialog";

interface IProps {
  language: Language;
  done: () => void;
}

export default function LanguageView(props: IProps) {
  const t = useTranslation();
  const push = usePush();

  const lessons = useAppSelector((state) => state.lessons);
  const [uploadUsfmForm, setUploadUsfmForm] = useState(false);
  const [uploadDocForm, setUploadDocForm] = useState(false);

  const [activeLang, setActiveLang] = useState(props.language);

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveBlockedDependents, setArchiveBlockedDependents] = useState<string[] | null>(null);
  const [srcLangUpdateFailed, setSrcLangUpdateFailed] = useState(false);

  const languages = useAppSelector((state) => state.languages);

  const handleSrcLangChange = async (v: number) => {
    const previousLang = activeLang;
    setSrcLangUpdateFailed(false);
    setActiveLang({ ...activeLang, defaultSrcLang: v });
    const result = await push(pushLanguageUpdate({ ...activeLang, defaultSrcLang: v }));
    if (!result) {
      setActiveLang(previousLang);
      setSrcLangUpdateFailed(true);
    }
  };

  const handleMTChange = async (mt: boolean) => {
    setActiveLang({ ...activeLang, motherTongue: mt });
    await push(pushLanguageUpdate({ ...activeLang, motherTongue: mt }));
  };

  const handleArchiveConfirm = async () => {
    setConfirmArchive(false);
    const result = await push(pushArchiveLanguage(props.language.languageId));
    if (!result) return;
    if ("error" in result) {
      setArchiveBlockedDependents(result.dependents.map((dependent) => dependent.name));
    } else {
      props.done();
    }
  };

  return (
    <div>
      <Button link text={`< ${t("Languages")}`} onClick={props.done} />
      <Heading text={props.language.name} level={3} />
      {!confirmArchive && (
        <Button
          text={t("Archive")}
          onClick={() => {
            setArchiveBlockedDependents(null);
            setConfirmArchive(true);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmArchive}
        title={t("Archive")}
        message={t("Archive_language_confirm")}
        confirmText={t("Archive")}
        cancelText={t("Cancel")}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setConfirmArchive(false)}
      />
      {archiveBlockedDependents && (
        <div role="alert" aria-live="assertive">
          {t("Archive_language_blocked", { names: archiveBlockedDependents.join(", ") })}
        </div>
      )}
      {srcLangUpdateFailed && (
        <div role="alert" aria-live="assertive">
          {t("Source_language_update_failed")}
        </div>
      )}

      {uploadUsfmForm ? (
        <UploadUsfmForm language={props.language} done={() => setUploadUsfmForm(false)} />
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
                    [t("Upload_document"), () => setUploadDocForm(true)],
                  ]
            }
          />
          <Div padVert>
            <Label text={t("Source_language")}>
              <SelectInput
                value={`${activeLang.defaultSrcLang}`}
                setValue={(v) => handleSrcLangChange(parseInt(v))}
                options={languages.adminLanguages.map((lng) => [`${lng.languageId}`, lng.name])}
              />
            </Label>
          </Div>
          <Div padVert>
            <ToggleMotherTongue save={handleMTChange} language={{ ...activeLang }} />
          </Div>
          <Table>
            {lessons.map((lesson) => {
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
                      text="Bilingual"
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
