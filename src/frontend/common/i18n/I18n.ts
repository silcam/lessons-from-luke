import en, { I18nStrings, I18nKey } from "./locales/en";
import fr from "./locales/fr";
import { useSelector } from "react-redux";
import { AppState, AppDispatch } from "../state/appState";

const strings = {
  en,
  fr
};
export type Locale = keyof typeof strings;

export type TFunc = (key: I18nKey, subs?: { [key: string]: string }) => string;

export function availableLocales(): Locale[] {
  return Object.keys(strings) as Locale[];
}

function translate(
  strings: I18nStrings,
  key: keyof I18nStrings,
  subs: { [key: string]: string } = {}
) {
  return Object.keys(subs).reduce((outStr, subKey) => {
    const keyPattern = `%{${subKey}}`;
    while (outStr.includes(keyPattern)) {
      outStr = outStr.replace(keyPattern, subs[subKey]);
    }
    return outStr;
  }, strings[key]);
}

function tForLocale(locale: keyof typeof strings): TFunc {
  return (key, subs) => translate(strings[locale], key, subs);
}

export function useTranslation() {
  const locale = useSelector((state: AppState) => state.currentUser.locale);
  return tForLocale(locale);
}
