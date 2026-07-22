import React, { useState } from "react";
import Div from "../../common/base-components/Div";
import useTranslation from "../../common/util/useTranslation";
import {
  EnglishUploadMeta,
  defaultEnglishUploadMeta,
  OtherUploadMeta,
} from "../../../core/models/DocUploadMeta";
import Heading from "../../common/base-components/Heading";
import { useDropzone } from "react-dropzone";
import SelectInput, { optionsDisplayIsKey } from "../../common/base-components/SelectInput";
import {
  Book,
  AllBooks,
  BaseLesson,
  lessonName,
  TOC_LESSON,
  COVER_A4_LESSON,
  COVER_A3_LESSON,
  isCoverLesson,
} from "../../../core/models/Lesson";
import NumberPicker from "../../common/base-components/NumberPicker";
import Button from "../../common/base-components/Button";
import Label from "../../common/base-components/Label";
import { usePush } from "../../common/api/useLoad";
import { pushDocument } from "../../common/state/lessonSlice";
import { useAppSelector } from "../../common/state/appState";
import { useNavigate } from "react-router-dom";
import Checkbox from "../../common/base-components/Checkbox";

export default function UploadLessonForm(props: { done: () => void }) {
  const t = useTranslation();
  const push = usePush();
  const navigate = useNavigate();

  const [uploadMeta, setUploadMeta] = useState<EnglishUploadMeta>(defaultEnglishUploadMeta());
  const [file, _setFile] = useState<File | null>(null);
  const formValid = !!file;
  const setFile = (file: File) => {
    _setFile(file);
    setUploadMeta(metaFromFilename(file.name));
  };

  const save = async () => {
    if (file) {
      const lesson = await push(pushDocument(file, uploadMeta));
      if (lesson) navigate(`/update-issues/${lesson.lessonId}`);
    }
  };

  return (
    <Div>
      <Heading level={4} text={t("Upload_new_lesson")} />
      <DocUploadInput file={file} setFile={setFile} />
      {!!file && (
        <Div>
          <Label text={t("Book")}>
            <SelectInput
              value={uploadMeta.book}
              setValue={(value) => setUploadMeta({ ...uploadMeta, book: value as Book })}
              options={optionsDisplayIsKey(AllBooks)}
            />
          </Label>
          <Label text={t("Series")}>
            <NumberPicker
              value={uploadMeta.series}
              setValue={(series) => setUploadMeta({ ...uploadMeta, series })}
            />
          </Label>
          <Checkbox
            label={t("Table_of_Contents")}
            value={uploadMeta.lesson == TOC_LESSON}
            disabled={isCoverLesson(uploadMeta.lesson)}
            setValue={(toc) => setUploadMeta({ ...uploadMeta, lesson: toc ? TOC_LESSON : 1 })}
          />
          <Checkbox
            label={t("Cover")}
            value={isCoverLesson(uploadMeta.lesson)}
            disabled={uploadMeta.lesson == TOC_LESSON}
            setValue={(cover) =>
              setUploadMeta({ ...uploadMeta, lesson: cover ? COVER_A4_LESSON : 1 })
            }
          />
          {isCoverLesson(uploadMeta.lesson) && (
            <Label text={t("Cover_format")}>
              <SelectInput
                value={uploadMeta.lesson == COVER_A3_LESSON ? "A3" : "A4"}
                setValue={(format) =>
                  setUploadMeta({
                    ...uploadMeta,
                    lesson: format == "A3" ? COVER_A3_LESSON : COVER_A4_LESSON,
                  })
                }
                options={[
                  ["A4", "A4"],
                  ["A3", "A3"],
                ]}
              />
            </Label>
          )}
          {uploadMeta.lesson != TOC_LESSON && !isCoverLesson(uploadMeta.lesson) && (
            <Label text={t("Lesson")}>
              <NumberPicker
                value={uploadMeta.lesson}
                setValue={(lesson) => setUploadMeta({ ...uploadMeta, lesson })}
              />
            </Label>
          )}
        </Div>
      )}
      <Button disabled={!formValid} onClick={save} text={t("Save")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}

export function UploadDocForTranslationForm(props: { done: () => void; languageId: number }) {
  const t = useTranslation();
  const push = usePush();
  const navigate = useNavigate();
  const lessons = useAppSelector((state) => state.lessons);

  const [lessonId, setLessonId] = useState(0);
  const [file, _setFile] = useState<File | null>(null);
  const formValid = !!file && lessonId > 0;
  const setFile = (file: File) => {
    _setFile(file);
    setLessonId(lessonIdFromFilename(file.name, lessons));
  };

  const save = async () => {
    if (file) {
      const meta: OtherUploadMeta = { languageId: props.languageId, lessonId };
      const lesson = await push(pushDocument(file, meta));
      if (lesson) navigate(`/languages/${props.languageId}/lessons/${lessonId}/docStrings`);
    }
  };

  return (
    <Div>
      <Heading level={4} text={t("Upload_document")} />
      <DocUploadInput file={file} setFile={setFile} />
      {!!file && (
        <Div>
          <Label text={t("Lesson")}>
            <SelectInput
              value={`${lessonId}`}
              setValue={(id) => setLessonId(parseInt(id))}
              options={lessons.map((lsn) => [`${lsn.lessonId}`, lessonName(lsn)])}
            />
          </Label>
        </Div>
      )}
      <Button disabled={!formValid} onClick={save} text={t("Upload")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}

function DocUploadInput(props: { file: File | null; setFile: (f: File) => void }) {
  const t = useTranslation();
  const { getRootProps, getInputProps } = useDropzone({
    accept: "application/vnd.oasis.opendocument.text",
    onDrop: (files) => {
      if (files[0]) props.setFile(files[0]);
    },
  });

  return (
    <Div marginBelow {...getRootProps()}>
      <input {...getInputProps()} />
      <Button link onClick={() => {}} text={props.file ? props.file.name : t("Add_file")} />
    </Div>
  );
}

export function metaFromFilename(filename: string): EnglishUploadMeta {
  const meta = defaultEnglishUploadMeta();
  if (filename.includes("Act")) meta.book = "Acts";

  let match = /[QT](\d+)/.exec(filename);
  if (match) meta.series = parseInt(match[1]);
  else {
    match = /Quarter (\d+)/.exec(filename);
    if (match) meta.series = parseInt(match[1]);
  }

  match = /L(\d+)/.exec(filename);
  if (match) meta.lesson = parseInt(match[1]);
  else if (/Cover-A4/i.test(filename)) meta.lesson = COVER_A4_LESSON;
  else if (/Cover-A3/i.test(filename)) meta.lesson = COVER_A3_LESSON;
  else meta.lesson = TOC_LESSON;

  return meta;
}

function lessonIdFromFilename(filename: string, lessons: BaseLesson[]) {
  if (lessons.length == 0) return 0;

  const meta = metaFromFilename(filename);
  const lesson = lessons.find(
    (lsn) => lsn.book == meta.book && lsn.series == meta.series && lsn.lesson == meta.lesson
  );
  return lesson ? lesson.lessonId : lessons[0].lessonId;
}
