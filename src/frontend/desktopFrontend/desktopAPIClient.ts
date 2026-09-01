import {
  AllGetRoute,
  AllAPIGet,
  AllAPIPost,
  AllPostRoute,
  DesktopGetRoute,
  DesktopAPIGet,
  DesktopAPIPost,
  DesktopPostRoute,
} from "../../core/api/ApiContracts";
import { asAppError } from "../../core/models/AppError";

// ---------------------------------------------------------------------------
// Context-compatible IPC wrappers (all routes via RequestContext)
//
// Typed against AllGetRoute / AllPostRoute so they can be passed to
// RequestContext.Provider and support both shared and desktop-only calls made
// by common components (syncStateSlice, useLessonTStrings, etc.).
//
// The IPC server (DesktopAPIServer) registers handlers for the routes it owns;
// web-only routes would fail at runtime if called in the desktop context, but
// common components guard desktop-specific calls with PlatformContext checks.
// ---------------------------------------------------------------------------

export async function ipcGet<T extends AllGetRoute>(
  route: T,
  params: AllAPIGet[T][0]
): Promise<AllAPIGet[T][1]> {
  try {
    console.log(`GET ${route} ${JSON.stringify(params)}`);
    const response = await window.electronAPI.invoke(route, params);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throw asAppError(err);
  }
}

export async function ipcPost<T extends AllPostRoute>(
  route: T,
  params: AllAPIPost[T][0],
  data: AllAPIPost[T][1]
): Promise<AllAPIPost[T][2]> {
  try {
    console.log(`POST ${route} ${JSON.stringify(params)} WITH ${JSON.stringify(data)}`);
    const response = await window.electronAPI.invoke(route, params, data);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throw asAppError(err);
  }
}

// ---------------------------------------------------------------------------
// Desktop-specific IPC wrappers (shared + desktop-only routes)
//
// Typed against DesktopGetRoute / DesktopPostRoute.  Web-only routes
// (admin, invitations) are excluded — using them here is a compile-time error.
// Use these directly in desktop-specific components for routes that are
// desktop-only (e.g. /api/readyToTranslate, /api/syncState/*).
// ---------------------------------------------------------------------------

export async function ipcDesktopGet<T extends DesktopGetRoute>(
  route: T,
  params: DesktopAPIGet[T][0]
): Promise<DesktopAPIGet[T][1]> {
  try {
    console.log(`GET ${route} ${JSON.stringify(params)}`);
    const response = await window.electronAPI.invoke(route, params);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throw asAppError(err);
  }
}

export async function ipcDesktopPost<T extends DesktopPostRoute>(
  route: T,
  params: DesktopAPIPost[T][0],
  data: DesktopAPIPost[T][1]
): Promise<DesktopAPIPost[T][2]> {
  try {
    console.log(`POST ${route} ${JSON.stringify(params)} WITH ${JSON.stringify(data)}`);
    const response = await window.electronAPI.invoke(route, params, data);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throw asAppError(err);
  }
}
