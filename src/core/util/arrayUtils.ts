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
