/// <reference types="jest" />

import {
  makeDocStrings,
  singleLanguageize,
  makeWebifyDocStrings,
  DocString
} from "./DocString";
import { LessonString } from "./LessonString";
import { TString } from "./TString";

const makeLessonString = (overrides = {}): LessonString => ({
  lessonStringId: 1,
  masterId: 1,
  lessonId: 10,
  lessonVersion: 1,
  type: "content",
  xpath: "/root/text()",
  motherTongue: false,
  ...overrides
});

const makeTString = (overrides = {}): TString => ({
  masterId: 1,
  languageId: 1,
  text: "Hello",
  history: [],
  ...overrides
});

describe("makeDocStrings", () => {
  test("maps lessonStrings to DocStrings using otherTStrings for non-motherTongue", () => {
    const lStr = makeLessonString({ masterId: 5, motherTongue: false });
    const tStr = makeTString({ masterId: 5, text: "Bonjour" });
    const result = makeDocStrings([lStr], [], [tStr]);
    expect(result).toEqual([
      { type: "content", xpath: "/root/text()", motherTongue: false, text: "Bonjour" }
    ]);
  });

  test("maps lessonStrings using mtTStrings for motherTongue strings", () => {
    const lStr = makeLessonString({ masterId: 3, motherTongue: true });
    const mtStr = makeTString({ masterId: 3, text: "MT Text" });
    const result = makeDocStrings([lStr], [mtStr], []);
    expect(result).toEqual([
      { type: "content", xpath: "/root/text()", motherTongue: true, text: "MT Text" }
    ]);
  });

  test("uses empty string when no matching tString is found", () => {
    const lStr = makeLessonString({ masterId: 99, motherTongue: false });
    const result = makeDocStrings([lStr], [], []);
    expect(result[0].text).toBe("");
  });

  test("handles multiple lessonStrings", () => {
    const lStr1 = makeLessonString({ masterId: 1, motherTongue: false });
    const lStr2 = makeLessonString({ lessonStringId: 2, masterId: 2, motherTongue: true });
    const tStr1 = makeTString({ masterId: 1, text: "First" });
    const mtStr2 = makeTString({ masterId: 2, text: "Second MT" });
    const result = makeDocStrings([lStr1, lStr2], [mtStr2], [tStr1]);
    expect(result[0].text).toBe("First");
    expect(result[1].text).toBe("Second MT");
  });
});

describe("singleLanguageize", () => {
  test("returns motherTongue docStrings unchanged and adds masterId to suppress queue", () => {
    const lStr = makeLessonString({ masterId: 10, motherTongue: true });
    const docStr: DocString = {
      type: "content",
      xpath: "/root",
      motherTongue: true,
      text: "MT text"
    };
    const result = singleLanguageize([lStr], [docStr]);
    expect(result[0].text).toBe("MT text");
  });

  test("suppresses majority-language string when corresponding MT string was found", () => {
    const mtLStr = makeLessonString({ lessonStringId: 1, masterId: 5, motherTongue: true });
    const majLStr = makeLessonString({ lessonStringId: 2, masterId: 5, motherTongue: false });
    const mtDoc: DocString = { type: "content", xpath: "/a", motherTongue: true, text: "MT" };
    const majDoc: DocString = { type: "content", xpath: "/b", motherTongue: false, text: "English" };

    const result = singleLanguageize([mtLStr, majLStr], [mtDoc, majDoc]);
    expect(result[0].text).toBe("MT"); // MT string unchanged
    expect(result[1].text).toBe(""); // Majority string suppressed
  });

  test("does not suppress non-motherTongue string when its masterId is not in queue", () => {
    const lStr = makeLessonString({ masterId: 7, motherTongue: false });
    const docStr: DocString = { type: "content", xpath: "/c", motherTongue: false, text: "Keep me" };
    const result = singleLanguageize([lStr], [docStr]);
    expect(result[0].text).toBe("Keep me");
  });

  test("clears earlier queue entries when a match is found", () => {
    // MT string for masterId 1 queued, but no majority match for 1
    // Then MT string for masterId 2 queued, majority match for 2 found — clears both
    const mt1 = makeLessonString({ lessonStringId: 1, masterId: 1, motherTongue: true });
    const mt2 = makeLessonString({ lessonStringId: 2, masterId: 2, motherTongue: true });
    const maj2 = makeLessonString({ lessonStringId: 3, masterId: 2, motherTongue: false });

    const mtDoc1: DocString = { type: "content", xpath: "/1", motherTongue: true, text: "MT1" };
    const mtDoc2: DocString = { type: "content", xpath: "/2", motherTongue: true, text: "MT2" };
    const majDoc2: DocString = { type: "content", xpath: "/3", motherTongue: false, text: "Maj2" };

    const result = singleLanguageize([mt1, mt2, maj2], [mtDoc1, mtDoc2, majDoc2]);
    expect(result[0].text).toBe("MT1");
    expect(result[1].text).toBe("MT2");
    expect(result[2].text).toBe(""); // suppressed
  });
});

describe("makeWebifyDocStrings", () => {
  test("returns docStrings with ##id## text format", () => {
    const lStr = makeLessonString({ lessonStringId: 42, type: "styles", motherTongue: true });
    const result = makeWebifyDocStrings([lStr]);
    expect(result).toEqual([
      {
        type: "styles",
        xpath: "/root/text()",
        motherTongue: true,
        text: "##42##"
      }
    ]);
  });

  test("handles empty lessonStrings", () => {
    expect(makeWebifyDocStrings([])).toEqual([]);
  });

  test("maps multiple lessonStrings correctly", () => {
    const lStrs = [
      makeLessonString({ lessonStringId: 1 }),
      makeLessonString({ lessonStringId: 2 })
    ];
    const result = makeWebifyDocStrings(lStrs);
    expect(result[0].text).toBe("##1##");
    expect(result[1].text).toBe("##2##");
  });
});
