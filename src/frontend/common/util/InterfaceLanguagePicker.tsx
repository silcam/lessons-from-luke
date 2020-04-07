import React, { useContext } from "react";
import useTranslation from "./useTranslation";
import { useAppSelector } from "../state/appState";
import Label from "../base-components/Label";
import SelectInput from "../base-components/SelectInput";
import { useDispatch } from "react-redux";
import currentUserSlice from "../state/currentUserSlice";
import { Locale, availableLocales, longName } from "../../../core/i18n/I18n";
import PlatformContext from "../PlatformContext";
import { pushLocale } from "../state/syncStateSlice";
import { usePush } from "../api/useLoad";

export default function InterfaceLanguagePicker() {
  const t = useTranslation();
  const dispatch = useDispatch();
  const push = usePush();
  const desktop = useContext(PlatformContext) == "desktop";
  const locale = useAppSelector(state =>
    desktop ? state.syncState.locale || "en" : state.currentUser.locale
  );
  const setLocale = (locale: Locale) =>
    desktop
      ? push(pushLocale(locale))
      : dispatch(currentUserSlice.actions.setLocale(locale));

  return (
    <Label text={t("Language") + ":"}>
      <SelectInput
        value={locale}
        setValue={value => setLocale(value as Locale)}
        options={availableLocales().map(locale => [locale, longName(locale)])}
      />
    </Label>
  );
}
