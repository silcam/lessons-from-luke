import { Persistence } from "../../core/interfaces/Persistence";
import { LessonString } from "../../core/models/LessonString";
import { Change, diffLines } from "diff";
import { lessonName, BaseLesson } from "../../core/models/Lesson";
import { uniq } from "../../core/util/arrayUtils";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";
import { TSub, SubPiece, IdSub, LessonDiff } from "../../core/models/TSub";
import { canAutoTranslate } from "./defaultTranslations";

interface EngSub {
  engFrom: SubPiece[];
  engTo: SubPiece[];
}

export default async function findTSubs(
  storage: Persistence
): Promise<{ complete: boolean; tSubs: TSub[] }> {
  const lessons = await storage.lessons();
  const diffs = await storage.lessonDiffs();
  const outOfDate = await oldLessonDiffs(lessons, diffs);
  computeLessonDiffs(storage, outOfDate);
  console.log(`Out of Date: ${JSON.stringify(outOfDate)}`);
  const allIdSubs = combineLessonDiffs(diffs);
  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const engSubs = allIdSubs
    .map(idSub => ({
      engFrom: subIds(idSub.from, englishStrings),
      engTo: subIds(idSub.to, englishStrings)
    }))
    .filter(autoTranslatableFilter);

  const finalTSubs: TSub[] = [];
  const languages = await storage.languages();
  for (let langIndex = 0; langIndex < languages.length; ++langIndex) {
    const language = languages[langIndex];
    if (language.languageId == ENGLISH_ID) continue;
    const tStrings = await storage.tStrings({
      languageId: language.languageId
    });

    const tSubs = engSubs.map((engSub, i) => ({
      ...engSub,
      languageId: language.languageId,
      from: subIds(allIdSubs[i].from, tStrings),
      to: subIds(allIdSubs[i].to, tStrings)
    }));
    finalTSubs.push(...tSubs.filter(usefulTSub));
  }
  finalTSubs.sort(sortTSubs);
  return { complete: outOfDate.length == 0, tSubs: finalTSubs };
}

function oldLessonDiffs(lessons: BaseLesson[], diffs: LessonDiff[]) {
  const outOfDate: BaseLesson[] = [];
  lessons.forEach(lesson => {
    const diff = diffs.find(diff => diff.lessonId == lesson.lessonId);
    if (!diff || diff.version != lesson.version) outOfDate.push(lesson);
  });
  return outOfDate;
}

function combineLessonDiffs(diffs: LessonDiff[]) {
  return uniq(
    diffs.reduce((idSubs: IdSub[], diff) => idSubs.concat(diff.diff), []),
    (a, b) => a.from == b.from && a.to == b.to
  );
}

function autoTranslatableFilter(engSub: EngSub): boolean {
  return engSub.engFrom.some(tStr => tStr && !canAutoTranslate(tStr.text));
}

function sortTSubs(a: TSub, b: TSub) {
  const compVal = (sps: SubPiece[]) =>
    sps.map(sp => (sp ? sp.masterId : "")).join(",");
  return compVal(a.engFrom).localeCompare(compVal(b.engFrom));
}

function usefulTSub(tSub: TSub): boolean {
  // A TSub is useful if the "from" is translated and the "to" is not
  return !tSub.from.includes(undefined) && tSub.to.includes(undefined);
}

function subIds(ids: string, tStrings: TString[]): SubPiece[] {
  return ids
    .split(",")
    .map(id => tStrings.find(tStr => tStr.masterId == parseInt(id)));
}

export async function computeLessonDiffs(
  storage: Persistence,
  lessons: BaseLesson[]
) {
  for (let i = 0; i < lessons.length; ++i) {
    const lesson = lessons[i];
    const diff = await diffLesson(storage, lesson.lessonId);
    storage.updateLessonDiff({
      lessonId: lesson.lessonId,
      version: lesson.version,
      diff
    });
  }
}

async function diffLesson(storage: Persistence, lessonId: number) {
  const lesson = await storage.lesson(lessonId);
  if (!lesson) throw `Bad lesson id ${lessonName} in diffLesson()`;
  console.log(`Diff lesson: ${lessonName(lesson)}`);

  const subs: IdSub[] = [];
  for (
    let version = 1; // Math.max(1, lesson.version - 6);
    version < lesson.version;
    ++version
  ) {
    const oldLStrings = await storage.oldLessonStrings(lessonId, version);
    subs.push(...diffLessonStrings(lesson.lessonStrings, oldLStrings));
  }
  return subs;
}

function diffLessonStrings(
  newLStrings: LessonString[],
  oldLStrings: LessonString[]
): IdSub[] {
  const subs: IdSub[] = [];
  const changes = diffLines(
    stringifyLStrings(oldLStrings),
    stringifyLStrings(newLStrings)
  );
  let i = 1;
  while (i < changes.length) {
    const change = changes[i];
    const prevChange = changes[i - 1];

    if (change.added && prevChange.removed) {
      subs.push(subFromChanges(prevChange, change));
      i += 2;
    } else if (change.removed && prevChange.added) {
      subs.push(subFromChanges(change, prevChange));
      i += 2;
    } else {
      ++i;
    }
  }
  return subs;
}

function subFromChanges(removed: Change, added: Change): IdSub {
  return {
    from: subify(removed),
    to: subify(added)
  };
}

function subify(change: Change): string {
  return change.value.trim().replace(/\n/g, ",");
}

// Transform lesson strings into string of masterId's separated by newlines for diffing
function stringifyLStrings(lessonStrings: LessonString[]) {
  return lessonStrings.map(lStr => `${lStr.masterId}\n`).join("");
}
