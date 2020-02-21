import React, { useState } from "react";
import Div from "../../common/base-components/Div";
import useTranslation from "../../common/util/useTranslation";
import {
  EnglishUploadMeta,
  defaultEnglishUploadMeta
} from "../../../core/models/DocUploadMeta";
import Heading from "../../common/base-components/Heading";
import { useDropzone } from "react-dropzone";
import SelectInput, {
  optionsDisplayIsKey
} from "../../common/base-components/SelectInput";
import { Book, AllBooks } from "../../../core/models/Lesson";
import NumberPicker from "../../common/base-components/NumberPicker";
import Button from "../../common/base-components/Button";
import Label from "../../common/base-components/Label";
import { usePush } from "../../common/api/RequestContext";
import { pushLesson } from "../../common/state/lessonSlice";

interface IProps {
  done: () => void;
}

export default function UploadLessonForm(props: IProps) {
  const t = useTranslation();
  const push = usePush();

  const [uploadMeta, setUploadMeta] = useState<EnglishUploadMeta>(
    defaultEnglishUploadMeta()
  );
  const [file, setFile] = useState<File | null>(null);
  const formValid = !!file;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: "application/vnd.oasis.opendocument.text",
    onDrop: files => {
      if (files[0]) {
        setFile(files[0]);
        setUploadMeta(metaFromFilename(files[0].name));
      }
    }
  });

  const save = async () => {
    if (file) {
      const lesson = await push(pushLesson(file, uploadMeta));
      if (lesson) props.done();
    }
  };

  return (
    <Div>
      <Heading level={4} text={t("Upload_new_lesson")} />
      <Div marginBelow {...getRootProps()}>
        <input {...getInputProps()} />
        <Button
          link
          onClick={() => {}}
          text={file ? file.name : t("Add_file")}
        />
      </Div>
      {!!file && (
        <Div>
          <Label text={t("Book")}>
            <SelectInput
              value={uploadMeta.book}
              setValue={value =>
                setUploadMeta({ ...uploadMeta, book: value as Book })
              }
              options={optionsDisplayIsKey(AllBooks)}
            />
          </Label>
          <Label text={t("Series")}>
            <NumberPicker
              value={uploadMeta.series}
              setValue={series => setUploadMeta({ ...uploadMeta, series })}
            />
          </Label>
          <Label text={t("Lesson")}>
            <NumberPicker
              value={uploadMeta.lesson}
              setValue={lesson => setUploadMeta({ ...uploadMeta, lesson })}
            />
          </Label>
        </Div>
      )}
      <Button disabled={!formValid} onClick={save} text={t("Save")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}

function metaFromFilename(filename: string): EnglishUploadMeta {
  const meta = defaultEnglishUploadMeta();
  if (filename.includes("Acts")) meta.book = "Acts";

  let match = /[QT](\d+)/.exec(filename);
  if (match) meta.series = parseInt(match[1]);

  match = /L(\d+)/.exec(filename);
  if (match) meta.lesson = parseInt(match[1]);

  return meta;
}
