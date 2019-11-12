import React, { useContext } from "react";
import en, { I18nStrings } from "../locales/en";
import fr from "../locales/fr";

const strings = {
  en,
  fr
};
export type Locale = keyof typeof strings;

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
    while (subKey.includes(keyPattern)) {
      outStr = outStr.replace(keyPattern, subs[subKey]);
    }
    return outStr;
  }, strings[key]);
}

type TFunc = (
  key: keyof I18nStrings,
  subs?: { [key: string]: string }
) => string;

function tForLocale(locale: keyof typeof strings): TFunc {
  return (key, subs) => translate(strings[locale], key, subs);
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const I18nContext = React.createContext<I18n>({
  locale: "en",
  setLocale: () => {}
});

export default I18nContext;

export function useTranslation() {
  const { locale } = useContext(I18nContext);
  return tForLocale(locale);
}
