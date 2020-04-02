import en, { I18nStrings, I18nKey } from "./locales/en";
import fr from "./locales/fr";
import { FRENCH_ID, ENGLISH_ID } from "../models/Language";

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

export function tForLocale(locale: keyof typeof strings): TFunc {
  return (key, subs) => translate(strings[locale], key, subs);
}

export function localeByLanguageId(id: number): Locale {
  switch (id) {
    case FRENCH_ID:
      return "fr";
    case ENGLISH_ID:
    default:
      return "en";
  }
}

export function longName(locale: Locale): string {
  switch (locale) {
    case "en":
      return "English";
    case "fr":
      return "Français";
  }
}
