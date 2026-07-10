/// <reference types="jest" />

/**
 * FR-006 guard test — "cover upload reuses existing master strings (dedup)
 * for byte-identical text" (US14, spec.md §FR-006, §SC-003).
 *
 * This is a confirmatory test, not new production code (plan.md §Summary,
 * research.md §R1/§R5): the existing `addOrFindMasterStrings` content-based
 * dedup mechanism, already exercised end-to-end by `saveDocStrings` for
 * ordinary lesson uploads, is expected to transparently handle cover
 * uploads too, since covers flow through the very same
 * `updateLesson` -> `saveDocStrings` -> `addOrFindMasterStrings` pipeline.
 *
 * Runs in the default (non-`.integration.test.ts`) server suite since it
 * only needs the transactional Postgres test storage already wired up by
 * `src/server/jestSetupAfterEnv.ts` — no `soffice` binary or compiled
 * server child process is required.
 *
 * Scenario:
 *   1. A shared string (e.g. a TOC/front-matter title) already has a
 *      master string AND an existing translation for a target language.
 *   2. A cover is "uploaded" (simulated by calling `saveDocStrings` on a
 *      fresh lesson, the way `updateLesson` does for a real ODT upload)
 *      whose title text is byte-identical to that shared string.
 *   3. Assert the cover's LessonString links to the SAME masterId (no new
 *      master string was minted for identical text), and that the target
 *      language's tString for that string is the pre-existing translation
 *      — i.e. zero new translator effort (SC-003).
 */

import { TestPersistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID, FRENCH_ID } from "../../core/models/Language";
import { DocString } from "../../core/models/DocString";
import { saveDocStrings } from "./updateLesson";
import { USE_PG } from "../testConfig";
import testStorage from "../storage/testStorage";

const storage: TestPersistence = USE_PG ? (global as any).testStorage : testStorage;

test("FR-006: cover text byte-identical to an existing shared string reuses its masterId and existing translation", async () => {
  const SHARED_TEXT = "My Cover Title Shared With The TOC";
  const TARGET_LANG = FRENCH_ID;
  const EXISTING_TRANSLATION = "Mon titre de couverture partagé avec la table des matières";

  // 1. A shared master string already exists (e.g. from a prior TOC upload)...
  const [masterTString] = await storage.addOrFindMasterStrings([SHARED_TEXT]);
  const masterId = masterTString.masterId;

  // ...and already has a translation for the target language.
  await storage.saveTStrings([
    {
      masterId,
      languageId: TARGET_LANG,
      sourceLanguageId: ENGLISH_ID,
      source: SHARED_TEXT,
      text: EXISTING_TRANSLATION,
      history: [],
    },
  ]);

  const englishCountBefore = (await storage.tStrings({ languageId: ENGLISH_ID })).length;

  // 2. A cover is uploaded whose title text is byte-identical to the shared string.
  const coverLesson = await storage.createLesson({ book: "Luke", series: 1, lesson: 999 });
  const coverDocStrings: DocString[] = [
    {
      type: "content",
      xpath: "cover:/title",
      motherTongue: false,
      text: SHARED_TEXT,
    },
  ];

  const finalLesson = await saveDocStrings(
    coverLesson.lessonId,
    coverLesson.version + 1,
    coverDocStrings,
    storage
  );

  // 3a. No new master string was minted for identical text — the cover's
  // LessonString links to the SAME masterId as the pre-existing shared string.
  expect(finalLesson.lessonStrings.length).toBe(1);
  expect(finalLesson.lessonStrings[0].masterId).toBe(masterId);

  const englishCountAfter = (await storage.tStrings({ languageId: ENGLISH_ID })).length;
  expect(englishCountAfter).toBe(englishCountBefore);

  // 3b. Fetching tStrings for the target language against the cover lesson
  // returns the EXISTING translation — zero new translation work required.
  const coverTStrings = await storage.tStrings({
    languageId: TARGET_LANG,
    lessonId: coverLesson.lessonId,
  });
  expect(coverTStrings.length).toBe(1);
  expect(coverTStrings[0]).toMatchObject({
    masterId,
    text: EXISTING_TRANSLATION,
  });
});
