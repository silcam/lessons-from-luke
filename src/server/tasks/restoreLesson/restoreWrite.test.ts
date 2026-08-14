/// <reference types="jest" />

/**
 * Unit tests for restoreWrite.ts (FR-009 `saveTStrings` wrapper, invariant
 * I4, research D6's two compensated defects).
 *
 * `saveTStrings` is doubled here (never the real storage) — these tests
 * assert the wrapper's own compensating behavior: per-language batch
 * isolation (defect 1) and forced `history: []` on every write handed to
 * `saveTStrings` (defect 2), plus that the wrapper faithfully returns
 * whatever `saveTStrings` reports back (I5 no-op, I6 history retention).
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Deferred Questions
 * resolution table (saveTStrings wrapped: one language per batch + history:[]
 * on inserts), Complexity Tracking (saveTStrings's two defects),
 * specs/018-lesson1-translation-restore/data-model.md I4/I5/I6.
 */
import { restoreWrite } from "./restoreWrite";
import { RestoreWrite } from "./types";
import { TString, equal } from "../../../core/models/TString";

function write(overrides: Partial<RestoreWrite> = {}): RestoreWrite {
  return {
    languageId: 42,
    masterId: 100,
    lessonStringId: null,
    text: "Ni mbut'ubu",
    history: [],
    sourceLanguageId: null,
    source: null,
    ...overrides,
  };
}

/**
 * A double that mimics the real `saveTStrings`'s I5/I6 behavior closely
 * enough to exercise it: an "existing" fixture row of the same
 * (masterId, languageId, lessonStringId) with the same text is a no-op
 * (I5); with a different text it is recorded as an update whose `history`
 * gains the prior value (I6).
 */
function fakeSaveTStrings(existing: TString[]) {
  const calls: TString[][] = [];
  const saveTStrings = jest.fn(async (tStrings: TString[]) => {
    calls.push(tStrings);
    const results: TString[] = [];
    for (const tStr of tStrings) {
      const match = existing.find((e) => equal(e, tStr));
      if (match && match.text === tStr.text) continue; // I5 no-op
      results.push(match ? { ...tStr, history: [...match.history, match.text] } : tStr);
    }
    return results;
  });
  return { saveTStrings, calls };
}

describe("restoreWrite", () => {
  it("issues no saveTStrings calls for an empty write plan", async () => {
    const { saveTStrings, calls } = fakeSaveTStrings([]);

    const result = await restoreWrite({ saveTStrings }, []);

    expect(saveTStrings).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(result).toEqual([]);
  });

  it("never merges a two-language batch into a single saveTStrings call", async () => {
    const { saveTStrings, calls } = fakeSaveTStrings([]);
    const writes = [
      write({ languageId: 1, masterId: 100 }),
      write({ languageId: 2, masterId: 200 }),
    ];

    await restoreWrite({ saveTStrings }, writes);

    expect(saveTStrings).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const languageIds = new Set(call.map((t) => t.languageId));
      expect(languageIds.size).toBe(1);
    }
  });

  it("groups same-language writes into a single saveTStrings call", async () => {
    const { saveTStrings, calls } = fakeSaveTStrings([]);
    const writes = [
      write({ languageId: 1, masterId: 100 }),
      write({ languageId: 1, masterId: 101 }),
    ];

    await restoreWrite({ saveTStrings }, writes);

    expect(saveTStrings).toHaveBeenCalledTimes(1);
    expect(calls[0]).toHaveLength(2);
  });

  it("always hands saveTStrings history: [] regardless of what the RestoreWrite carried", async () => {
    const { saveTStrings, calls } = fakeSaveTStrings([]);
    const writes = [write({ languageId: 1, masterId: 100, history: [] })];

    await restoreWrite({ saveTStrings }, writes);

    expect(calls[0][0].history).toEqual([]);
  });

  it("is a no-op (I5) when saveTStrings reports the value already matches production", async () => {
    const existing: TString[] = [
      {
        masterId: 100,
        languageId: 1,
        lessonStringId: null,
        text: "Ni mbut'ubu",
        history: [],
        sourceLanguageId: null,
        source: null,
      },
    ];
    const { saveTStrings } = fakeSaveTStrings(existing);
    const writes = [write({ languageId: 1, masterId: 100, text: "Ni mbut'ubu" })];

    const result = await restoreWrite({ saveTStrings }, writes);

    expect(result).toEqual([]);
  });

  it("retains the overwritten production value in history (I6), verified via saveTStrings's recorded result", async () => {
    const existing: TString[] = [
      {
        masterId: 100,
        languageId: 1,
        lessonStringId: null,
        text: "stale English fallback",
        history: ["older value"],
        sourceLanguageId: null,
        source: null,
      },
    ];
    const { saveTStrings, calls } = fakeSaveTStrings(existing);
    const writes = [write({ languageId: 1, masterId: 100, text: "Ni mbut'ubu" })];

    const result = await restoreWrite({ saveTStrings }, writes);

    // the wrapper itself must submit history: [] (defect-2 compensation)...
    expect(calls[0][0].history).toEqual([]);
    // ...but faithfully returns what saveTStrings reports it actually did,
    // which retains the prior production value in history.
    expect(result).toEqual([
      {
        masterId: 100,
        languageId: 1,
        lessonStringId: null,
        text: "Ni mbut'ubu",
        history: ["older value", "stale English fallback"],
        sourceLanguageId: null,
        source: null,
      },
    ]);
  });

  it("carries sourceLanguageId, source, masterId, languageId, and lessonStringId through to saveTStrings", async () => {
    const { saveTStrings, calls } = fakeSaveTStrings([]);
    const writes = [
      write({
        languageId: 7,
        masterId: 300,
        lessonStringId: null,
        text: "some text",
        sourceLanguageId: 9,
        source: "some source",
      }),
    ];

    await restoreWrite({ saveTStrings }, writes);

    expect(calls[0][0]).toEqual({
      masterId: 300,
      languageId: 7,
      lessonStringId: null,
      text: "some text",
      history: [],
      sourceLanguageId: 9,
      source: "some source",
    });
  });
});
