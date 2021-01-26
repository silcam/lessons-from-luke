import update from "immutability-helper";

export function findBy<T, K extends keyof T>(
  list: T[],
  key: K,
  value: T[K]
): T | undefined {
  return list.find(item => item[key] === value);
}

export function findIndexBy<T, K extends keyof T>(
  list: T[],
  key: K,
  value: T[K]
): number {
  return list.findIndex(item => item[key] === value);
}

export function findByStrict<T, K extends keyof T>(
  list: T[],
  key: K,
  value: T[K]
): T {
  const found = findBy(list, key, value);
  if (!found)
    throw new Error(
      `findByStrict did not find item with key ${key} value ${value}.`
    );
  return found;
}

export function last<T>(list: T[]) {
  return list[list.length - 1];
}

export function set(list: string[], item: string) {
  if (!list.includes(item)) list.push(item);
}

export function unset(list: string[], item: string) {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

export function modelListMerge<T>(
  aList: readonly T[],
  bList: readonly T[],
  same: (a: T, b: T) => boolean,
  sort?: (a: T, b: T) => number
): T[] {
  if (bList.length == 0) return aList as T[];

  const mergedList = bList.reduce((list, item) => {
    const index = list.findIndex(existing => same(item, existing));
    return index < 0
      ? [...list, item]
      : update(list, { [index]: { $set: item } });
  }, aList) as T[];

  if (sort) mergedList.sort(sort);

  return mergedList;
}

export function discriminate<T>(
  list: T[],
  discriminator: (item: T) => boolean
): [T[], T[]] {
  return list.reduce(
    (twoLists: [T[], T[]], item) => {
      if (discriminator(item)) twoLists[0].push(item);
      else twoLists[1].push(item);
      return twoLists;
    },
    [[], []]
  );
}

export function uniq<T>(
  list: T[],
  compare: (a: T, b: T) => boolean = (a, b) => a == b
): T[] {
  return list.reduce(
    (final: T[], item) =>
      final.some(compItem => compare(item, compItem))
        ? final
        : [...final, item],
    []
  );
}

export function all<T>(list: T[], test: (item: T) => boolean): boolean {
  return !list.some(item => !test(item));
}

export function count<T>(list: T[], cb: (item: T) => boolean) {
  return list.reduce((count, item) => {
    return cb(item) ? count + 1 : count;
  }, 0);
}

export function insertSorted<T>(
  list: T[],
  item: T,
  aBeforeB: (a: T, b: T) => boolean
): T[] {
  if (list.length == 0) return [item];

  const testIndex = Math.floor(list.length / 2);
  if (aBeforeB(item, list[testIndex])) {
    return insertSorted(list.slice(0, testIndex), item, aBeforeB).concat(
      list.slice(testIndex)
    );
  } else {
    return list
      .slice(0, testIndex + 1)
      .concat(insertSorted(list.slice(testIndex + 1), item, aBeforeB));
  }
}

// export function randomSelection<T>(list: T[], number: number): T[] {
//   if (number >= list.length) return list;

//   const ids: number[] = [];
//   while (ids.length < number) {
//     const randomId = Math.floor(Math.random() * list.length);
//     if (!ids.includes(randomId)) ids.push(randomId);
//   }
//   return list.filter((_, index) => ids.includes(index));
// }

// export function zip<A, B>(
//   aList: A[],
//   bList: B[],
//   match: (a: A, b: B) => boolean
// ): [A, B | undefined][] {
//   return aList.map(a => [a, bList.find(b => match(a, b))]);
// }
