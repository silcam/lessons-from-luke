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

export function uniq<T>(list: T[]): T[] {
  return list.reduce(
    (final: T[], item) => (final.includes(item) ? final : [...final, item]),
    []
  );
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
