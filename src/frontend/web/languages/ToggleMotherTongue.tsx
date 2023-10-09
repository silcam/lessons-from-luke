import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import useTranslation from "../../common/util/useTranslation";
import { usePush } from "../../common/api/useLoad";
import Checkbox from "../../common/base-components/Checkbox";
import { pushLanguageUpdate } from "../../common/state/languageSlice";

interface IProps {
  language: Language;
  save: (mt: boolean) => void;
}

export default function ToggleMotherTongue(props: IProps) {
  const t = useTranslation();

  return (
    <Checkbox label={t("Mother_tongue")} value={props.language.motherTongue} setValue={props.save} />
  );
}
