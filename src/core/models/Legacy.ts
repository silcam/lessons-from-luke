import { TString } from "./TString";

export interface LegacyProject {
  targetLang: string;
  datetime: number;
  lockCode: string;
  sourceLang: string;
}

export interface LegacyTString {
  xpath: string;
  src: string;
  targetText: string;
}

export interface LegacyTStringWithMatches extends LegacyTString {
  matches: TString[];
}
