import { TString } from "./TString";
import { ENGLISH_ID } from "./Language";

export type SubPiece = TString | undefined;
type MaybeNum = number | null;

export interface TSub {
  languageId: number;
  engFrom: SubPiece[];
  engTo: SubPiece[];
  from: SubPiece[];
  to: SubPiece[];
}

export interface TSubLite {
  languageId: number;
  from: MaybeNum[]; // Master Id's
  to: MaybeNum[]; // Master Id's
}
export interface IdSub {
  // Both strings are id numbers comma separated
  from: string;
  to: string;
}

export interface LessonDiff {
  lessonId: number;
  version: number;
  diff: IdSub[];
}

export function divideTSubs(tSubs: TSub[]): [TSubLite[], TString[]] {
  const tStrings: TString[] = [];
  const idify = (sp: SubPiece) => (sp ? sp.masterId : null);
  const tSubsLite = tSubs.map(tSub => {
    // The map has a side-effect of pushing to tStrings. So sue me.
    tStrings.push(
      ...(tSub.engFrom
        .concat(tSub.engTo)
        .concat(tSub.from)
        .concat(tSub.to)
        .filter(sp => sp) as TString[])
    );
    return {
      languageId: tSub.languageId,
      from: tSub.engFrom.map(idify),
      to: tSub.engTo.map(idify)
    };
  });
  return [tSubsLite, tStrings];
}

export function combineTSubs(
  tSubsLite: TSubLite[],
  tStrings: TString[]
): TSub[] {
  const inflate = (languageId: number, ids: (number | null)[]) =>
    ids.map(id =>
      id
        ? tStrings.find(
            tStr => tStr.languageId == languageId && tStr.masterId == id
          )
        : undefined
    );

  return tSubsLite.map(
    tSubLite =>
      tSubLite && {
        languageId: tSubLite.languageId,
        engFrom: inflate(ENGLISH_ID, tSubLite.from),
        engTo: inflate(ENGLISH_ID, tSubLite.to),
        from: inflate(tSubLite.languageId, tSubLite.from),
        to: inflate(tSubLite.languageId, tSubLite.to)
      }
  );
}
