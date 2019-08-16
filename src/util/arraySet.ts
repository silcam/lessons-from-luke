export function set(list: string[], item: string) {
  if (!list.includes(item)) list.push(item);
}

export function unset(list: string[], item: string) {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}
