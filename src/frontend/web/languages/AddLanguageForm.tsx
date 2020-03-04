import React, { useState } from "react";
import Div from "../../common/base-components/Div";
import TextInput from "../../common/base-components/TextInput";
import useTranslation from "../../common/util/useTranslation";
import Button from "../../common/base-components/Button";
import { usePush } from "../../common/api/RequestContext";
import { pushLanguage } from "../../common/state/languageSlice";
import Heading from "../../common/base-components/Heading";
import { useAppSelector } from "../../common/state/appState";
import Label from "../../common/base-components/Label";
import SelectInput from "../../common/base-components/SelectInput";
import { ENGLISH_ID } from "../../../core/models/Language";

interface IProps {
  done: () => void;
}

export default function AddLanguageForm(props: IProps) {
  const t = useTranslation();
  const push = usePush();
  const languages = useAppSelector(state => state.languages.adminLanguages);

  const [name, setName] = useState("");
  const [defaultSrcLang, setDefaultSrcLang] = useState(ENGLISH_ID);
  const formValid = name.length > 0;

  const save = async () => {
    const language = await push(pushLanguage({ name, defaultSrcLang }));
    if (language) props.done();
  };

  return (
    <Div>
      <Heading level={4} text={t("Add_language")} />
      <Label text={t("Source_language")}>
        <SelectInput
          value={`${defaultSrcLang}`}
          setValue={v => setDefaultSrcLang(parseInt(v))}
          options={languages.map(lng => [`${lng.languageId}`, lng.name])}
        />
      </Label>
      <Div padVert>
        <TextInput
          placeholder={t("Language_name")}
          value={name}
          setValue={setName}
        />
      </Div>
      <Button disabled={!formValid} onClick={save} text={t("Save")} />
      <Button red onClick={props.done} text={t("Cancel")} />
    </Div>
  );
}
