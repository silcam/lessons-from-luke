export type Params = { [key: string]: string | number };

export interface LanguageTimestamp {
  languageId: number;
  timestamp: number;
}

export function encodeLanguageTimestamps(langTimestamps: LanguageTimestamp[]): string {
  return langTimestamps.map((lt) => `${lt.languageId}-${lt.timestamp}`).join(",");
}

export function decodeLanguageTimestamps(encoded: string): LanguageTimestamp[] {
  if (encoded.length == 0) return [];
  return encoded.split(",").map((langStamp) => {
    const [languageId, timestamp] = langStamp.split("-").map((num) => parseInt(num));
    if (!languageId || !timestamp) throw { status: 400 };
    return { languageId, timestamp };
  });
}
