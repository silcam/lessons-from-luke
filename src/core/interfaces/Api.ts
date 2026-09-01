export type Params = { [key: string]: string | number };

// ---------------------------------------------------------------------------
// Archive-language response shape — shared between Persistence.archiveLanguage,
// the POST /api/admin/languages/:languageId/archive endpoint, and the frontend
// thunk that discriminates the union. See
// specs/012-language-archive-routing/contracts/archive-language.md.
// ---------------------------------------------------------------------------

/** Successful archive — minimal acknowledgement, NOT the (now-filtered) Language. */
export interface ArchiveLanguageOk {
  archived: true;
  languageId: number;
}

/** Blocked because one or more active languages still point at this one as their source. */
export interface ArchiveLanguageBlocked {
  error: "HAS_DEPENDENTS";
  dependents: { languageId: number; name: string }[];
}

export type ArchiveLanguageResult = ArchiveLanguageOk | ArchiveLanguageBlocked;

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
