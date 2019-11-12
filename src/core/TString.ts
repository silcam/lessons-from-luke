export interface TString {
  id: number;
  xpath: string;
  src: string;
  targetText: string;
  mtString?: boolean;
  metaString?: boolean;
  stylesString?: boolean;
}

export type TStrings = TString[];
