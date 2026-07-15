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
//
// TYPE-ENFORCEMENT SPLIT (2026-06-26, sp:architecture-review remediation):
//
// Routes are split into three typed groups so the web/desktop boundary is
// compiler-enforced rather than comment-enforced:
//
//   SharedAPIGet / SharedAPIPost  — routes served via HTTP and consumed by
//     both the web browser and the Electron desktop's HTTP sync client
//     (WebAPIClientForDesktop).
//
//   WebOnlyAPIGet / WebOnlyAPIPost  — routes served via HTTP that are only
//     called from the web browser (admin, invitations, etc.).  Desktop code
//     using DesktopGetRoute / DesktopPostRoute cannot reference these.
//
//   DesktopOnlyAPIGet / DesktopOnlyAPIPost  — routes handled exclusively by
//     the Electron IPC layer (DesktopAPIServer) and NOT served by Express.
//
// Public composed types:
//   APIGet = SharedAPIGet & WebOnlyAPIGet        → used by web HTTP clients
//   DesktopAPIGet = SharedAPIGet & DesktopOnlyAPIGet → used by desktop IPC/HTTP clients
//
// Usage contract:
//   GetRoute / PostRoute        — web route keys (excludes desktop-only routes)
//   DesktopGetRoute / DesktopPostRoute — desktop route keys (excludes web-only routes)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared routes — served via HTTP, used by both web and desktop HTTP clients
// ---------------------------------------------------------------------------

interface SharedAPIGet {
  "/api/languages": [Record<string, never>, PublicLanguage[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[],
  ];
  "/api/lessons": [Record<string, never>, BaseLesson[]];
  "/api/lessons/:lessonId": [{ lessonId: number }, Lesson];
  "/api/lessons/:lessonId/webified": [{ lessonId: number }, { html: string }];
  // Used by the desktop HTTP client for session refresh and down-sync:
  "/api/auth/get-session": [
    Record<string, never>,
    { session: { id: string; userId: string; expiresAt: string }; user: User } | null,
  ];
  "/api/sync/:timestamp/languages/:languageTimestamps?": [
    { timestamp: number; languageTimestamps: string },
    ContinuousSyncPackage,
  ];
  "/api/languages/:languageId/tStrings/:ids": [{ languageId: number; ids: string }, TString[]];
}

interface SharedAPIPost {
  "/api/tStrings": [Record<string, never>, { code: string; tStrings: TString[] }, TString[]];
}

// ---------------------------------------------------------------------------
// Web-only routes — served via HTTP, only called from the web browser
// (admin panel, invitations, etc.). Desktop code cannot use these.
// ---------------------------------------------------------------------------

interface WebOnlyAPIGet {
  "/api/admin/languages": [Record<string, never>, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];
  "/api/admin/lessons/:lessonId/lessonUpdateIssues": [{ lessonId: number }, TSub[]];
  "/api/admin/invitations": [Record<string, never>, InvitationSummaryRow[]];
  "/api/admin/invitations/:id/link": [{ id: string }, { link: string }];
  "/api/auth/invitation/:token": [{ token: string }, { email: string }];
}

interface WebOnlyAPIPost {
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
}

// ---------------------------------------------------------------------------
// Desktop-only routes — handled by the Electron IPC layer (DesktopAPIServer),
// NOT served by Express. Web clients cannot reference these routes.
// ---------------------------------------------------------------------------

interface DesktopOnlyAPIGet {
  "/api/syncState": [Record<string, never>, SyncState];
  "/api/readyToTranslate": [Record<string, never>, { readyToTranslate: boolean }];
}

interface DesktopOnlyAPIPost {
  "/api/syncState/code": [Record<string, never>, { code: string }, SyncState];
  "/api/syncState/locale": [Record<string, never>, { locale: Locale }, SyncState];
  "/api/syncState/progress": [Record<string, never>, LessonProgress, void];
}

// ---------------------------------------------------------------------------
// Composed public route maps
// ---------------------------------------------------------------------------

/** Route map for web HTTP clients (browser + server route registration). */
export type APIGet = SharedAPIGet & WebOnlyAPIGet;
/** Route map for web HTTP clients. */
export type APIPost = SharedAPIPost & WebOnlyAPIPost;

/** Route map for desktop IPC clients (Electron IPC server + renderer). */
export type DesktopAPIGet = SharedAPIGet & DesktopOnlyAPIGet;
/** Route map for desktop IPC clients. */
export type DesktopAPIPost = SharedAPIPost & DesktopOnlyAPIPost;

/**
 * Combined route map for RequestContext — includes all routes from all platforms.
 *
 * The common frontend layer (frontend/common/) calls both web-only and desktop-only
 * routes through RequestContext, using PlatformContext to guard desktop-specific
 * calls at runtime.  RequestContext therefore uses this broadest type rather than
 * the platform-specific maps so common thunks (syncStateSlice, useLessonTStrings,
 * etc.) can call any route without compile errors.
 *
 * The tradeoff: RequestContext does NOT enforce which routes each platform handles;
 * that enforcement lives at the concrete implementations (webGet / ipcGet) and at
 * the import-type level (APIGet excludes desktop-only routes so web-only code
 * importing it for type extraction cannot reference /api/syncState etc.).
 */
export type AllAPIGet = SharedAPIGet & WebOnlyAPIGet & DesktopOnlyAPIGet;
/** Combined POST route map for RequestContext. */
export type AllAPIPost = SharedAPIPost & WebOnlyAPIPost & DesktopOnlyAPIPost;

/**
 * Route map for the desktop HTTP sync client (WebAPIClientForDesktop).
 * Shared HTTP routes only — excludes web-only admin routes AND desktop-only
 * IPC routes (neither is reachable via HTTP from the Electron main process).
 */
export type { SharedAPIGet, SharedAPIPost };

/** Web route keys — desktop-only routes are excluded. */
export type GetRoute = keyof APIGet;
/** Web route keys — desktop-only routes are excluded. */
export type PostRoute = keyof APIPost;

/** Desktop IPC route keys — web-only routes (admin, invitations) are excluded. */
export type DesktopGetRoute = keyof DesktopAPIGet;
/** Desktop IPC route keys — web-only routes are excluded. */
export type DesktopPostRoute = keyof DesktopAPIPost;

/** All route keys — used by RequestContext to span web and desktop. */
export type AllGetRoute = keyof AllAPIGet;
/** All POST route keys — used by RequestContext. */
export type AllPostRoute = keyof AllAPIPost;

/**
 * Shared HTTP route keys for WebAPIClientForDesktop.
 * Excludes both web-only routes (admin) and desktop-only IPC routes.
 */
export type SharedGetRoute = keyof SharedAPIGet;
/** Shared HTTP POST route keys for WebAPIClientForDesktop. */
export type SharedPostRoute = keyof SharedAPIPost;
