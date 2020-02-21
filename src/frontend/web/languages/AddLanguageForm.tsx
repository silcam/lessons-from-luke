import React, { useState } from "react";
import Div from "../../common/base-components/Div";
import TextInput from "../../common/base-components/TextInput";
import useTranslation from "../../common/util/useTranslation";
import Button from "../../common/base-components/Button";
import { usePush } from "../../common/api/RequestContext";
import { pushLanguage } from "../../common/state/languageSlice";
import Heading from "../../common/base-components/Heading";

interface IProps {
  done: () => void;
}

export default function AddLanguageForm(props: IProps) {
  const t = useTranslation();
  const push = usePush();

  const [name, setName] = useState("");
  const formValid = name.length > 0;

  const save = async () => {
    const language = await push(pushLanguage(name));
    if (language) props.done();
  };

  return (
    <Div>
      <Heading level={4} text={t("Add_language")} />
      <TextInput
        placeholder={t("Language_name")}
        value={name}
        setValue={setName}
      />
      <Button disabled={!formValid} onClick={save} text={t("Save")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}
