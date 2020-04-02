import React from "react";
import useTranslation from "./useTranslation";
import { useAppSelector } from "../state/appState";
import Label from "../base-components/Label";
import SelectInput from "../base-components/SelectInput";
import { useDispatch } from "react-redux";
import currentUserSlice from "../state/currentUserSlice";
import { Locale, availableLocales, longName } from "../../../core/i18n/I18n";

export default function InterfaceLanguagePicker() {
  const t = useTranslation();
  const dispatch = useDispatch();
  const locale = useAppSelector(state => state.currentUser.locale);

  return (
    <Label text={t("Language") + ":"}>
      <SelectInput
        value={locale}
        setValue={value =>
          dispatch(currentUserSlice.actions.setLocale(value as Locale))
        }
        options={availableLocales().map(locale => [locale, longName(locale)])}
      />
    </Label>
  );
}
