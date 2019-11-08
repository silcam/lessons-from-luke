export interface TString {
  targetText: string;
}

export function toTString(str: string): TString {
  return {
    targetText: str
  };
}
