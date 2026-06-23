import { User } from "../models/User";
import { TString } from "../models/TString";
import { Language, NewLanguage, PublicLanguage, LessonProgress } from "../models/Language";
import { BaseLesson, Lesson } from "../models/Lesson";
import { DocString } from "../models/DocString";
import { SyncState, ContinuousSyncPackage } from "../models/SyncState";
import { Locale } from "../i18n/I18n";
import { TSub } from "../models/TSub";

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
// HTTP API contract maps — typed route → [params, body, response] tuples.
// These live here (api layer) rather than in core/interfaces/ because they
// encode HTTP route strings as type keys, which is an infrastructure concern.
// ---------------------------------------------------------------------------

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
  "/api/admin/invitations": [Record<string, never>, { email: string; role: string }, InvitationResult];
  "/api/admin/invitations/:id/retract": [{ id: string }, Record<string, never>, InvitationSummaryRow];
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
