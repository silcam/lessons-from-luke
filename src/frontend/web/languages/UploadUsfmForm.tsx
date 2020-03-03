import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import Div from "../../common/base-components/Div";
import useTranslation from "../../common/util/useTranslation";
import Heading from "../../common/base-components/Heading";
import { useDropzone } from "react-dropzone";
import Button from "../../common/base-components/Button";
import { usePush } from "../../common/api/RequestContext";
import { useHistory } from "react-router-dom";
import { pushUsfm } from "../../common/state/languageSlice";

interface IProps {
  language: Language;
  done: () => void;
}

export default function UploadUsfmForm(props: IProps) {
  const t = useTranslation();
  const push = usePush();
  const history = useHistory();

  const [usfm, setUsfm] = useState("");
  const [inputCaption, setInputCaption] = useState(t("Add_file"));
  const formValid = usfm.length > 0;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async files => {
      if (files[0]) {
        const text = await (files[0] as any).text(); // Not sure why the cast is needed
        setUsfm(text);
        setInputCaption(files[0].name);
      }
    }
  });

  const save = async () => {
    const result = await push(pushUsfm(props.language.languageId, usfm));
    if (result) history.push("/usfmImportResult");
  };

  return (
    <Div>
      <Heading level={4} text={t("Upload_usfm")} />
      <Div marginBelow {...getRootProps()}>
        <input {...getInputProps()} />
        <Button link onClick={() => {}} text={inputCaption} />
      </Div>
      <Button disabled={!formValid} onClick={save} text={t("Save")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}
