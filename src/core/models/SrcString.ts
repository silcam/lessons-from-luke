export interface SrcString {
  xpath: string;
  text: string;
  mtString?: boolean;
  metaString?: boolean;
  stylesString?: boolean;
}

export type SrcStrings = SrcString[];
