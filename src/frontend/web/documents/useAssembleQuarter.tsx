import { useCallback, useEffect, useRef, useState } from "react";
import Axios from "axios";
import { saveAs } from "file-saver";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";

/**
 * Assembly mode for a quarter book — mirrors
 * specs/007-assembled-quarter-download/contracts/assembly-api.md.
 */
export type AssembleMode = "bilingual" | "single-language";

/**
 * Discriminated-union client-side view of an assembly job's lifecycle.
 * Mirrors the server's `queued | running | ready | failed` poll states
 * (contract §2), plus a local `idle` state before the first POST and a
 * `rejected` state for a start that never became a job at all.
 *
 * `rejected` vs `failed` is the contract's own distinction (assembly-api.md
 * §1, "429 is transient, not terminal"): a `429` started no work and offers
 * no assembly to retry, so it MUST NOT be rendered as a terminal `failed`
 * job. The name matches the server's vocabulary
 * (`StartOrAttachResult.outcome === "rejected"`, `CAP_REJECTED_REASON`).
 */
export type AssembleStatus =
  | { tag: "idle" }
  | { tag: "queued" }
  | { tag: "running" }
  | { tag: "ready" }
  /** Transient: the server declined to start anything. Just re-POST. */
  | { tag: "rejected"; reason: string }
  /** Terminal: a real job ran and failed. */
  | { tag: "failed"; reason: string };

export interface UseAssembleQuarterResult {
  status: AssembleStatus;
  start: () => void;
}

/** How often to poll for job status once assembly has started — contract
 * "Client interaction sketch": "loop GET …/assembly?mode=… every ~1–2s". */
const POLL_INTERVAL_MS = 2000;

interface AssemblyJobResponse {
  jobId: string;
  status: "queued" | "running" | "ready" | "failed";
  reason?: string;
}

export const GENERIC_FAILURE_REASON = "assembly failed (internal)";

/**
 * Shown when a poll 404s. The server's job registry is in-memory and
 * process-scoped (FR-011), so a 404 means the job is gone for good — a server
 * restart, or the 24h TTL — and no amount of further polling will bring it
 * back. The only recovery is to start a new job.
 */
export const JOB_GONE_REASON =
  "this assembly is no longer available (the server may have restarted) — please try again";

/**
 * Shown when the *download* 404s (contract §4: "unknown/expired job id, or a
 * `ready` job whose result file has already been pruned by the 24 h
 * `docStorage` cleanup … the client maps `404` to 'expired — re-request'",
 * FR-011). Reachable in practice because the status poll does not `stat` the
 * result file, so a long-idle `ready` job still polls `200 ready` and only
 * fails at the download.
 */
export const RESULT_EXPIRED_REASON =
  "this assembly has expired and its file was cleaned up — please assemble it again";

/**
 * Shown for a POST `403` — `requireSameOrigin` rejected the request's
 * `Origin`/`Referer` (contract §1). In a browser that means a stale page or a
 * lost session, not a server fault, and reloading is the actual remedy.
 */
export const SESSION_UNVERIFIED_REASON =
  "this page's session could not be verified — please reload the page and try again";

/**
 * Shown for a POST `404` — unknown language / book / series (contract §1).
 * The only way an operator hits this is the data moving underneath an open
 * tab (e.g. the language was archived or removed elsewhere), so the remedy is
 * again a reload rather than a retry.
 */
export const QUARTER_GONE_REASON =
  "this quarter is no longer available — please reload the page and try again";

/**
 * Fallback for a POST `429` whose body carries no `reason`. The server does
 * send one (`CAP_REJECTED_REASON`), but the client must not depend on it.
 */
export const SERVER_BUSY_REASON = "server busy, retry shortly";

/**
 * Drives an assembly job (US1): POST to start/attach, poll for status, and
 * download + save the finished document once ready. Mirrors the existing
 * `useGetDocument` blob-download pattern; adds only the poll loop (see
 * specs/007-assembled-quarter-download/contracts/assembly-api.md).
 */
export default function useAssembleQuarter(
  language: PublicLanguage,
  book: Book,
  series: number,
  mode: AssembleMode
): UseAssembleQuarterResult {
  const [status, setStatus] = useState<AssembleStatus>({ tag: "idle" });
  const jobIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const basePath = `/api/languages/${language.languageId}/quarters/${book}/${series}/assembly`;

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // The deferred first poll below is scheduled separately from the interval,
    // so clearing only the interval leaves it to fire after unmount.
    if (firstPollRef.current !== null) {
      clearTimeout(firstPollRef.current);
      firstPollRef.current = null;
    }
  }, []);

  // Stop any in-flight polling on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  const downloadAndFinish = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (jobId === null) {
      return;
    }
    const response = await Axios.get(`/api/assembly/${jobId}/download`, {
      responseType: "blob",
    });
    saveAs(new Blob([response.data]), `${language.name} - ${book} Q${series} (${mode}).odt`);
    setStatus({ tag: "ready" });
  }, [book, language.name, mode, series]);

  const poll = useCallback(async () => {
    // Transient poll failures (e.g. a dropped/unmocked request) are not a
    // job failure — only an explicit server `"failed"` status is (contract
    // §2). Leave status untouched and let the next tick retry.
    //
    // A `404` is the one exception: it is definitive, not transient. The job
    // registry is in-memory and process-scoped (FR-011), so once the server
    // says it has no job for this key, no later poll will ever say otherwise.
    // Retrying it forever leaves the button stuck on "Assembling…" with
    // nothing to show the user, so a 404 terminates the loop instead.
    try {
      const response = await Axios.get<AssemblyJobResponse>(`${basePath}?mode=${mode}`);
      const data = response.data;
      if (data.status === "queued" || data.status === "running") {
        setStatus({ tag: data.status });
      } else if (data.status === "ready") {
        stopPolling();
        // Deliberately outside the try/catch above's scope of concern: once
        // the job is confirmed `ready`, a failure here (network drop, "result
        // expired" 404, etc.) is a real, user-visible failure — not a
        // transient poll hiccup — so it must not be swallowed by the generic
        // catch below (see lessons-from-luke-koog.10).
        try {
          await downloadAndFinish();
        } catch (err) {
          setStatus({ tag: "failed", reason: downloadFailureReason(err) });
        }
      } else {
        stopPolling();
        setStatus({ tag: "failed", reason: data.reason ?? GENERIC_FAILURE_REASON });
      }
    } catch (err) {
      if (extractErrorResponseStatus(err) === 404) {
        stopPolling();
        setStatus({ tag: "failed", reason: JOB_GONE_REASON });
        return;
      }
      /* swallow — see comment above */
    }
  }, [basePath, mode, stopPolling, downloadAndFinish]);

  const start = useCallback(() => {
    void (async () => {
      try {
        const response = await Axios.post<AssemblyJobResponse>(basePath, { mode });
        jobIdRef.current = response.data.jobId;
        setStatus({ tag: response.data.status === "running" ? "running" : "queued" });
        stopPolling();
        intervalRef.current = setInterval(() => {
          void poll();
        }, POLL_INTERVAL_MS);
        // Poll once (almost) immediately in case the job is already
        // ready/failed by the time the POST resolves — an interval-only loop
        // can leave the UI stuck showing "queued" for up to POLL_INTERVAL_MS
        // with nothing to show for it. Deferred a tick (rather than called
        // inline) so the "queued"/"running" state — and its aria-live
        // "Assembling…" announcement (US3) — actually commits and is
        // observable before a fast job's result can overwrite it; without
        // this, a same-tick-resolving job would jump straight from click to
        // "ready", and a screen-reader user would hear no progress at all.
        firstPollRef.current = setTimeout(() => {
          firstPollRef.current = null;
          void poll();
        }, 0);
      } catch (err) {
        // A synchronous 409/422 on the initial POST (quarter incomplete —
        // contract §1) never reaches the poll loop, so its curated `reason`
        // (naming the missing lesson(s), US4-1/FR-006) must be pulled from
        // the error response here rather than falling back to the generic
        // message.
        //
        // A `429` is the one non-terminal rejection: it started no work, so
        // per contract §1 it must not be painted as a `failed` job — the
        // remedy is simply to POST again. It is branched on HTTP status, as
        // the contract requires, not on any body field.
        //
        // Everything else is a `failed`, with the body `reason` winning when
        // present (it is the only field with a hygiene contract — never a
        // stack trace or an absolute path) and an HTTP-status fallback
        // otherwise. `error` is deliberately never rendered verbatim: it
        // carries no such guarantee, and "unknown language" is worse copy
        // than "reload the page" regardless. A `400` keeps the generic
        // message on purpose — it is a client bug with no operator remedy.
        const status = extractErrorResponseStatus(err);
        const reason = extractErrorResponseReason(err);
        if (status === 429) {
          setStatus({ tag: "rejected", reason: reason ?? SERVER_BUSY_REASON });
          return;
        }
        setStatus({
          tag: "failed",
          reason: reason ?? startFailureReasonForStatus(status),
        });
      }
    })();
  }, [basePath, mode, poll, stopPolling]);

  return { status, start };
}

/**
 * Maps a failed *download* to a message, from its HTTP status alone.
 *
 * Unlike its sibling in `start()`, this deliberately never reads the response
 * body — it cannot. The download request sets `responseType: "blob"`, and
 * Axios only JSON-parses when `forcedJSONParsing && !responseType` or
 * `responseType === "json"` (`axios/lib/defaults/index.js`), while the XHR
 * adapter assigns the raw `request.response` — a `Blob` — to `response.data`
 * for *every* status, errors included (`axios/lib/adapters/xhr.js`). So on a
 * download 404 the body is an unparsed `Blob` with neither `reason` nor
 * `error` in reach; only the status is.
 *
 * A `409` needs no branch: the download only runs after a poll reported
 * `ready`, and terminal statuses are immutable, so "exists but not ready"
 * (contract §4) is unreachable from here.
 */
function downloadFailureReason(err: unknown): string {
  return extractErrorResponseStatus(err) === 404 ? RESULT_EXPIRED_REASON : GENERIC_FAILURE_REASON;
}

/**
 * Fallback message for a failed start POST that carried no curated `reason`,
 * chosen from the HTTP status (contract §1).
 */
function startFailureReasonForStatus(status: number | undefined): string {
  switch (status) {
    case 403:
      return SESSION_UNVERIFIED_REASON;
    case 404:
      return QUARTER_GONE_REASON;
    default:
      return GENERIC_FAILURE_REASON;
  }
}

/**
 * Pulls the HTTP status code out of an Axios error's response, if present —
 * duck-typed for the same reason `extractErrorResponseReason` below is (the
 * tests pass plain `{ response: { … } }` literals, deliberately). Returns
 * `undefined` for a network error or any other shape carrying no response,
 * which is exactly the transient case the poll loop must keep retrying.
 */
function extractErrorResponseStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("response" in err)) {
    return undefined;
  }
  const response = (err as { response?: unknown }).response;
  if (typeof response !== "object" || response === null || !("status" in response)) {
    return undefined;
  }
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Pulls the curated `reason` string out of an Axios error's response body,
 * if present — duck-typed (rather than `Axios.isAxiosError`) so it works
 * against both a real Axios error and a plain `{ response: { data } }`
 * object in tests. Returns `undefined` for any other failure shape (network
 * error, no response body, non-string `reason`), so the caller's generic
 * fallback still applies.
 */
function extractErrorResponseReason(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("response" in err)) {
    return undefined;
  }
  const response = (err as { response?: unknown }).response;
  if (typeof response !== "object" || response === null || !("data" in response)) {
    return undefined;
  }
  const data = (response as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("reason" in data)) {
    return undefined;
  }
  const reason = (data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}
