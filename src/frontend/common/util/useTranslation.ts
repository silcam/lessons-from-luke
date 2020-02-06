import { useAppSelector } from "../state/appState";
import { tForLocale } from "../../../core/i18n/I18n";

export default function useTranslation() {
  const locale = useAppSelector(state => state.currentUser.locale);
  return tForLocale(locale);
}
