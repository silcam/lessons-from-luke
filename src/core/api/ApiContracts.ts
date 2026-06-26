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
//
// ARCHITECTURAL DECISION (2026-06-26, sp:architecture-review):
//
// These maps encode HTTP route path strings as TypeScript interface keys, which
// is an infrastructure concern rather than a domain concern. Despite the
// four-layer architecture (core / server / frontend / desktop), they live in
// the core API layer — not server — by deliberate team decision:
//
//   • The route-typed client pattern (webGet<T extends GetRoute>) requires a
//     registry visible to ALL consumers: server route registration, the web API
//     client, the IPC-based desktop client, and the React RequestContext.
//
//   • Moving to src/server/api/ would force desktop/ and frontend/ to import
//     server-layer types, creating a worse layer violation in the other
//     direction.
//
//   • Creating a new src/shared/ composite TS project to house purely
//     cross-cutting transport types is architecturally cleaner but adds
//     significant build complexity (new tsconfig, reference updates in four
//     projects, 11 import-site updates) for limited practical benefit.
//
//   • src/core/api/ is already home to other cross-cutting transport types
//     (WebAPIClient, IpcChannels); the directory name signals infrastructure.
//
// Trade-off accepted. Revisit only if a transport other than HTTP/IPC is
// introduced, at which point a src/shared/ split becomes worthwhile.
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
