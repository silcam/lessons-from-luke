import { Persistence } from "../../core/interfaces/Persistence";
import { LessonString } from "../../core/models/LessonString";
import { Change, diffLines } from "diff";
import { lessonName } from "../../core/models/Lesson";
import { uniq } from "../../core/util/arrayUtils";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";
import { TSub, SubPiece } from "../../core/models/TSub";

interface IdSub {
  // Both strings are id numbers comma separated
  from: string;
  to: string;
}

interface EngSub {
  engFrom: SubPiece[];
  engTo: SubPiece[];
}

export default async function findTSubs(storage: Persistence): Promise<TSub[]> {
  const idSubs = await findIdSubs(storage);
  const englishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
  const engSubs = idSubs.map(idSub => ({
    engFrom: subIds(idSub.from, englishStrings),
    engTo: subIds(idSub.to, englishStrings)
  }));

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
      from: subIds(idSubs[i].from, tStrings),
      to: subIds(idSubs[i].to, tStrings)
    }));
    finalTSubs.push(...tSubs.filter(usefulTSub));
  }
  finalTSubs.sort(sortTSubs);
  return finalTSubs;
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

async function findIdSubs(storage: Persistence) {
  const lessons = await storage.lessons();
  const subs: IdSub[] = [];
  for (let i = 0; i < lessons.length; ++i) {
    const lessonSubs = await diffLesson(storage, lessons[i].lessonId);
    subs.push(...lessonSubs);
  }
  return uniq(subs, (a, b) => a.from == b.from && a.to == b.to);
}

async function diffLesson(storage: Persistence, lessonId: number) {
  const lesson = await storage.lesson(lessonId);
  if (!lesson) throw `Bad lesson id ${lessonName} in diffLesson()`;

  const subs: IdSub[] = [];
  for (
    let version = Math.max(1, lesson.version - 6);
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
