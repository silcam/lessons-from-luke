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
 * (contract §2), plus a local `idle` state before the first POST.
 */
export type AssembleStatus =
  | { tag: "idle" }
  | { tag: "queued" }
  | { tag: "running" }
  | { tag: "ready" }
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

const GENERIC_FAILURE_REASON = "assembly failed (internal)";

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

  const basePath = `/api/languages/${language.languageId}/quarters/${book}/${series}/assembly`;

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
          const reason = extractErrorResponseReason(err);
          setStatus({ tag: "failed", reason: reason ?? GENERIC_FAILURE_REASON });
        }
      } else {
        stopPolling();
        setStatus({ tag: "failed", reason: data.reason ?? GENERIC_FAILURE_REASON });
      }
    } catch {
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
        setTimeout(() => void poll(), 0);
      } catch (err) {
        // A synchronous 409/422 on the initial POST (quarter incomplete —
        // contract §1) never reaches the poll loop, so its curated `reason`
        // (naming the missing lesson(s), US4-1/FR-006) must be pulled from
        // the error response here rather than falling back to the generic
        // message. Any other failure shape (network error, no response
        // body) keeps the generic fallback.
        const reason = extractErrorResponseReason(err);
        setStatus({ tag: "failed", reason: reason ?? GENERIC_FAILURE_REASON });
      }
    })();
  }, [basePath, mode, poll, stopPolling]);

  return { status, start };
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
