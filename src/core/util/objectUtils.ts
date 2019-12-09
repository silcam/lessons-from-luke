export function unset<T, F extends keyof T>(obj: T, field: F): Omit<T, F> {
  return (Object.keys(obj) as (keyof T)[]).reduce((newObj, key) => {
    if (key === field) return newObj;
    newObj[key] = obj[key];
    return newObj;
  }, {} as Partial<T>) as Omit<T, F>;
}

export type Type = "number" | "string" | "string[]";
export type Field<T> = [keyof T, Type];
export type Fields<T> = Field<T>[];
export function validateFields<T>(obj: T, fields: Field<T>[]): boolean {
  for (let i = 0; i < fields.length; ++i) {
    const field = fields[i];
    if (field[1] === "string[]") {
      if (typeof obj[field[0]] !== "object") return false;
      const array: any[] = obj[field[0]] as any;
      if (array.length > 0 && typeof array[0] !== "string") return false;
    } else {
      if (!(typeof obj[field[0]] === field[1])) return false;
    }
  }
  return true;
}

export function objKeys<T>(t: T): (keyof T)[] {
  return Object.keys(t) as (keyof T)[];
}
