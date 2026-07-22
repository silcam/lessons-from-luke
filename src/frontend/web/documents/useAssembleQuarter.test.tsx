/// <reference types="jest" />

/**
 * RED tests for `useAssembleQuarter` (US1).
 *
 * Spec: specs/007-assembled-quarter-download/contracts/assembly-api.md
 *       "Client interaction sketch"
 * Scope note (per task): happy-path start -> poll-ready -> download plus
 * basic queued/running state; the full aria-live/focus-management polish
 * (US3) and blocked/failed UI (US4) are out of scope here.
 *
 * `useAssembleQuarter` is currently a stub whose `start()` does nothing and
 * whose `status` is always `{ tag: "idle" }` (see the module doc comment).
 * These tests fail against that stub for the right reason — no POST/GET
 * calls are made, no status transitions happen, no download is triggered —
 * not on a compile/import error. The GREEN task
 * (lessons-from-luke-koog.6.2.12) implements the hook for real.
 */

jest.mock("axios");
jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

import { act, renderHook } from "@testing-library/react";
import Axios from "axios";
import { saveAs } from "file-saver";
import useAssembleQuarter from "./useAssembleQuarter";
import { PublicLanguage } from "../../../core/models/Language";

const mockedAxios = Axios as jest.Mocked<typeof Axios>;
const mockedSaveAs = saveAs as unknown as jest.Mock;

const language: PublicLanguage = {
  languageId: 1,
  name: "English",
  motherTongue: true,
  progress: [],
  defaultSrcLang: 0,
};

const BOOK = "Luke";
const SERIES = 1;
const START_PATH = `/api/languages/${language.languageId}/quarters/${BOOK}/${SERIES}/assembly`;
const POLL_PATH = `${START_PATH}?mode=bilingual`;

beforeEach(() => {
  jest.useFakeTimers();
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
  mockedSaveAs.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useAssembleQuarter", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));
    expect(result.current.status).toEqual({ tag: "idle" });
  });

  it("POSTs to start an assembly job when start() is called", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(START_PATH, { mode: "bilingual" });
  });

  it("transitions to queued/running while polling", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValue({ data: { jobId: "job-1", status: "running" } });

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    expect(["queued", "running"]).toContain(result.current.status.tag);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(POLL_PATH);
    expect(result.current.status).toEqual({ tag: "running" });
  });

  it("downloads the file via Axios blob + file-saver once the job is ready", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValue({ data: { jobId: "job-1", status: "ready" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { jobId: "job-1", status: "ready" } });
    mockedAxios.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAxios.get).toHaveBeenCalledWith("/api/assembly/job-1/download", {
      responseType: "blob",
    });
    expect(mockedSaveAs).toHaveBeenCalled();
    expect(result.current.status).toEqual({ tag: "ready" });
  });

  it("surfaces the reason when the job fails", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValue({
      data: { jobId: "job-1", status: "failed", reason: "missing constituent: Luke Q1 L6" },
    });

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.status).toEqual({
      tag: "failed",
      reason: "missing constituent: Luke Q1 L6",
    });
  });

  it("surfaces a failed status when the download itself fails after a ready poll", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { jobId: "job-1", status: "ready" } });
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status.tag).toBe("failed");
    expect(mockedSaveAs).not.toHaveBeenCalled();
  });

  it("surfaces the reason from a POST 409 (quarter incomplete) without polling", async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          status: "failed",
          reason: "missing constituent: Luke 1-TOC, Luke 1-6",
          missing: ["Luke 1-TOC", "Luke 1-6"],
        },
      },
    });

    const { result } = renderHook(() => useAssembleQuarter(language, BOOK, SERIES, "bilingual"));

    await act(async () => {
      result.current.start();
      await Promise.resolve();
    });

    expect(result.current.status).toEqual({
      tag: "failed",
      reason: "missing constituent: Luke 1-TOC, Luke 1-6",
    });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
