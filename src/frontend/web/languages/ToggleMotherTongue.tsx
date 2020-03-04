import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import useTranslation from "../../common/util/useTranslation";
import { usePush } from "../../common/api/RequestContext";
import Checkbox from "../../common/base-components/Checkbox";
import { pushLanguageUpdate } from "../../common/state/languageSlice";

interface IProps {
  language: Language;
}

export default function ToggleMotherTongue(props: IProps) {
  const t = useTranslation();
  const push = usePush();

  const [draftMT, setDraftMT] = useState(props.language.motherTongue);

  const save = async (mt: boolean) => {
    setDraftMT(mt);
    await push(pushLanguageUpdate({ ...props.language, motherTongue: mt }));
  };

  return (
    <Checkbox label={t("Mother_tongue")} value={draftMT} setValue={save} />
  );
}
