import { useAppSelector } from "../state/appState";
import { tForLocale } from "../../../core/i18n/I18n";
import { useContext } from "react";
import PlatformContext from "../PlatformContext";

export default function useTranslation() {
  const desktop = useContext(PlatformContext) == "desktop";
  const locale = useAppSelector(state =>
    desktop ? state.syncState.locale || "en" : state.currentUser.locale
  );
  return tForLocale(locale);
}
