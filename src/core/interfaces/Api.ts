import { User } from "../models/User";
import { TString } from "../models/TString";
import { Language, NewLanguage, PublicLanguage, LessonProgress } from "../models/Language";
import { BaseLesson, Lesson } from "../models/Lesson";
import { DocString } from "../models/DocString";
import { SyncState, ContinuousSyncPackage } from "../models/SyncState";
import { Locale } from "../i18n/I18n";
import { TSub } from "../models/TSub";

export type Params = { [key: string]: string | number };

// ---------------------------------------------------------------------------
// Invitation response shapes — shared between server and frontend thunks
// ---------------------------------------------------------------------------

/** Response from POST /api/admin/invitations (newly created invitation). */
export interface InvitationResult {
  id: string;
  email: string;
  role: string;
  status: string;
  link: string;
  expiresAt: string;
  /** true if the invitation email was accepted for delivery; false on send failure. */
  emailSent: boolean;
}

/** Response from POST /api/admin/invitations/:id/resend. */
export interface ResendInvitationResult {
  /** true if the invitation email was accepted for delivery; false on send failure. */
  emailSent: boolean;
}

/** Row returned by GET /api/admin/invitations and POST /api/admin/invitations/:id/retract. */
export interface InvitationSummaryRow {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  invitedByEmail: string;
}

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

export interface APIGet {
  // Both
  "/api/languages": [Record<string, never>, PublicLanguage[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[],
  ];
  "/api/lessons": [Record<string, never>, BaseLesson[]];
  "/api/lessons/:lessonId": [{ lessonId: number }, Lesson];
  "/api/lessons/:lessonId/webified": [{ lessonId: number }, { html: string }];

  // Web Only
  "/api/auth/get-session": [
    Record<string, never>,
    { session: { id: string; userId: string; expiresAt: string }; user: User } | null,
  ];
  "/api/admin/languages": [Record<string, never>, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];
  "/api/languages/:languageId/tStrings/:ids": [{ languageId: number; ids: string }, TString[]];
  "/api/sync/:timestamp/languages/:languageTimestamps?": [
    { timestamp: number; languageTimestamps: string },
    ContinuousSyncPackage,
  ];
  "/api/admin/lessons/:lessonId/lessonUpdateIssues": [{ lessonId: number }, TSub[]];
  "/api/admin/invitations": [Record<string, never>, InvitationSummaryRow[]];
  "/api/admin/invitations/:id/link": [{ id: string }, { link: string }];
  "/api/auth/invitation/:token": [{ token: string }, { email: string }];

  // Desktop Only
  "/api/syncState": [Record<string, never>, SyncState];
  "/api/readyToTranslate": [Record<string, never>, { readyToTranslate: boolean }];
}

export interface APIPost {
  //Both
  "/api/tStrings": [Record<string, never>, { code: string; tStrings: TString[] }, TString[]];

  // Web Only
  "/api/admin/languages": [Record<string, never>, NewLanguage, Language];
  "/api/admin/languages/:languageId": [
    { languageId: number },
    { motherTongue?: boolean; defaultSrcLang?: number },
    Language,
  ];
  "/api/admin/languages/:languageId/usfm": [
    { languageId: number },
    { usfm: string },
    { language: Language; tStrings: TString[]; errors: string[] },
  ];
  "/api/admin/lessons/:lessonId/strings": [
    { lessonId: number },
    DocString[],
    { lesson: Lesson; tStrings: TString[] },
  ];
  "/api/admin/invitations": [
    Record<string, never>,
    { email: string; role: string },
    InvitationResult,
  ];
  "/api/admin/invitations/:id/retract": [
    { id: string },
    Record<string, never>,
    InvitationSummaryRow,
  ];
  "/api/admin/invitations/:id/resend": [
    { id: string },
    Record<string, never>,
    ResendInvitationResult,
  ];
  "/api/auth/invitation/accept": [
    Record<string, never>,
    { token: string; password: string; name: string },
    { email: string },
  ];

  // Desktop Only
  "/api/syncState/code": [Record<string, never>, { code: string }, SyncState];
  "/api/syncState/locale": [Record<string, never>, { locale: Locale }, SyncState];
  "/api/syncState/progress": [Record<string, never>, LessonProgress, void];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;

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
