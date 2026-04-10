/// <reference types="jest" />

import { divideTSubs, combineTSubs, TSub } from "./TSub";
import { TString } from "./TString";
import { ENGLISH_ID } from "./Language";

function makeTStr(masterId: number, languageId: number, text: string): TString {
  return { masterId, languageId, text, history: [] };
}

describe("divideTSubs", () => {
  test("produces TSubLite with engFrom masterIds in .from and engTo masterIds in .to", () => {
    const engFrom = makeTStr(5, ENGLISH_ID, "Foo");
    const engTo = makeTStr(6, ENGLISH_ID, "Bar");
    const tSub: TSub = {
      languageId: 3,
      engFrom: [engFrom],
      engTo: [engTo],
      from: [null],
      to: [null]
    };
    const [lite] = divideTSubs([tSub]);
    expect(lite[0].from).toEqual([5]);
    expect(lite[0].to).toEqual([6]);
    expect(lite[0].languageId).toBe(3);
  });

  test("maps null SubPiece to null masterId", () => {
    const engFrom = makeTStr(1, ENGLISH_ID, "Hello");
    const tSub: TSub = {
      languageId: 3,
      engFrom: [engFrom],
      engTo: [null],
      from: [null],
      to: [null]
    };
    const [lite] = divideTSubs([tSub]);
    expect(lite[0].to).toEqual([null]);
  });

  test("collects all non-null SubPieces into tStrings output", () => {
    const engFrom = makeTStr(5, ENGLISH_ID, "Foo");
    const engTo = makeTStr(6, ENGLISH_ID, "Bar");
    const langFrom = makeTStr(5, 3, "Foo-translated");
    const tSub: TSub = {
      languageId: 3,
      engFrom: [engFrom],
      engTo: [engTo],
      from: [langFrom],
      to: [null]
    };
    const [, tStrings] = divideTSubs([tSub]);
    expect(tStrings).toContainEqual(engFrom);
    expect(tStrings).toContainEqual(engTo);
    expect(tStrings).toContainEqual(langFrom);
    expect(tStrings.length).toBe(3);
  });

  test("handles empty input", () => {
    const [lite, tStrings] = divideTSubs([]);
    expect(lite).toEqual([]);
    expect(tStrings).toEqual([]);
  });
});

describe("combineTSubs", () => {
  test("inflates masterIds back to TString objects", () => {
    const engFrom = makeTStr(5, ENGLISH_ID, "Foo");
    const engTo = makeTStr(6, ENGLISH_ID, "Bar");
    const langFrom = makeTStr(5, 3, "Foo-translated");
    const langTo = makeTStr(6, 3, "Bar-translated");
    const tStrings = [engFrom, engTo, langFrom, langTo];
    const lite = [{ languageId: 3, from: [5], to: [6] }];

    const result = combineTSubs(lite, tStrings);

    expect(result[0].engFrom).toEqual([engFrom]);
    expect(result[0].engTo).toEqual([engTo]);
    expect(result[0].from).toEqual([langFrom]);
    expect(result[0].to).toEqual([langTo]);
  });

  test("returns null for missing masterId", () => {
    const tStrings = [makeTStr(1, ENGLISH_ID, "Hello")];
    const lite = [{ languageId: 3, from: [99], to: [100] }];
    const result = combineTSubs(lite, tStrings);
    expect(result[0].engFrom).toEqual([null]);
    expect(result[0].engTo).toEqual([null]);
    expect(result[0].from).toEqual([null]);
    expect(result[0].to).toEqual([null]);
  });

  test("handles empty input", () => {
    expect(combineTSubs([], [])).toEqual([]);
  });

  test("handles null ids in tSubsLite arrays", () => {
    const lite = [{ languageId: 3, from: [null], to: [null] }];
    const result = combineTSubs(lite, []);
    expect(result[0].engFrom).toEqual([null]);
    expect(result[0].engTo).toEqual([null]);
    expect(result[0].from).toEqual([null]);
    expect(result[0].to).toEqual([null]);
  });
});

describe("divideTSubs / combineTSubs roundtrip", () => {
  test("recovers original TSub structure after divide then combine", () => {
    const engFrom = makeTStr(5, ENGLISH_ID, "Foo");
    const engTo = makeTStr(6, ENGLISH_ID, "Bar");
    // from/to have same masterIds as engFrom/engTo, different languageId
    const langFrom = makeTStr(5, 7, "Foo-lang");
    const langTo = makeTStr(6, 7, "Bar-lang");

    const tSub: TSub = {
      languageId: 7,
      engFrom: [engFrom],
      engTo: [engTo],
      from: [langFrom],
      to: [langTo]
    };

    const [lite, tStrings] = divideTSubs([tSub]);
    const restored = combineTSubs(lite, tStrings);

    expect(restored[0].languageId).toBe(tSub.languageId);
    expect(restored[0].engFrom).toEqual(tSub.engFrom);
    expect(restored[0].engTo).toEqual(tSub.engTo);
    expect(restored[0].from).toEqual(tSub.from);
    expect(restored[0].to).toEqual(tSub.to);
  });

  test("roundtrip with null 'to' pieces preserves nulls", () => {
    const engFrom = makeTStr(5, ENGLISH_ID, "Foo");
    const engTo = makeTStr(6, ENGLISH_ID, "Bar");
    const langFrom = makeTStr(5, 7, "Foo-lang");

    const tSub: TSub = {
      languageId: 7,
      engFrom: [engFrom],
      engTo: [engTo],
      from: [langFrom],
      to: [null]
    };

    const [lite, tStrings] = divideTSubs([tSub]);
    const restored = combineTSubs(lite, tStrings);

    expect(restored[0].to).toEqual([null]);
  });

  test("multiple TSubs roundtrip", () => {
    const tSubs: TSub[] = [
      {
        languageId: 3,
        engFrom: [makeTStr(1, ENGLISH_ID, "A")],
        engTo: [makeTStr(2, ENGLISH_ID, "B")],
        from: [makeTStr(1, 3, "A3")],
        to: [makeTStr(2, 3, "B3")]
      },
      {
        languageId: 3,
        engFrom: [makeTStr(10, ENGLISH_ID, "X")],
        engTo: [makeTStr(11, ENGLISH_ID, "Y")],
        from: [makeTStr(10, 3, "X3")],
        to: [null]
      }
    ];

    const [lite, tStrings] = divideTSubs(tSubs);
    const restored = combineTSubs(lite, tStrings);

    expect(restored).toHaveLength(2);
    expect(restored[0].from).toEqual(tSubs[0].from);
    expect(restored[1].to).toEqual([null]);
  });
});
