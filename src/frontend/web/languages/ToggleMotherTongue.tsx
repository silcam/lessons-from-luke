import React from "react";
import { Language } from "../../../core/models/Language";
import useTranslation from "../../common/util/useTranslation";
import Checkbox from "../../common/base-components/Checkbox";

interface IProps {
  language: Language;
  save: (mt: boolean) => void;
}

export default function ToggleMotherTongue(props: IProps) {
  const t = useTranslation();

  return (
    <Checkbox
      label={t("Mother_tongue")}
      value={props.language.motherTongue}
      setValue={props.save}
    />
  );
}
