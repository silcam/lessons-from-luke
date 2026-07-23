/// <reference types="jest" />

/**
 * RED tests for `AssembleQuarterButton` (US1).
 *
 * Spec: specs/007-assembled-quarter-download/contracts/assembly-api.md
 *       "Client interaction sketch"; plan.md "Presentation Design".
 * Scope note (per task): only the happy-path click -> "Assembling…" ->
 * download wiring plus basic queued/running rendering. Full aria-live/focus
 * polish (US3) and blocked/failed UI (US4) are out of scope here.
 *
 * `useAssembleQuarter` (the hook this component uses) is currently a stub
 * that never leaves `idle` and whose `start()` does nothing, so these tests
 * fail on their assertions (button never disappears, no download call) —
 * not on a compile/import error. GREEN task: lessons-from-luke-koog.6.2.12.
 */

jest.mock("axios");
jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import Axios from "axios";
import { saveAs } from "file-saver";
import AssembleQuarterButton from "./AssembleQuarterButton";
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

beforeEach(() => {
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
  mockedSaveAs.mockReset();
});

describe("AssembleQuarterButton", () => {
  it("renders the button text when idle", () => {
    const { getByText } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );
    expect(getByText("Assemble Quarter 1")).toBeTruthy();
  });

  it("POSTs to start assembly when clicked", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { getByText } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );

    fireEvent.click(getByText("Assemble Quarter 1"));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/languages/1/quarters/Luke/1/assembly", {
        mode: "bilingual",
      });
    });
  });

  it("shows a queued/running indicator instead of the button while assembling", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "running" } });

    const { getByText, queryByText } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );

    fireEvent.click(getByText("Assemble Quarter 1"));

    await waitFor(() => {
      expect(queryByText("Assemble Quarter 1")?.closest("button")).toBeFalsy();
    });
  });

  it("announces queued/running/ready progress via an aria-live region and uses aria-disabled (not disabled) while assembling (US3, RED)", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { jobId: "job-1", status: "ready" } });
    mockedAxios.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

    const { getByText, getByRole } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );

    fireEvent.click(getByText("Assemble Quarter 1"));

    // The busy state must be exposed via `role="status"` (an implicit
    // `aria-live="polite"` region), not a silent visual-only indicator, and
    // the control must stay focusable/announced via `aria-disabled`
    // (never the `disabled` attribute, which drops it from the tab order).
    await waitFor(() => {
      const status = getByRole("status");
      expect(status.textContent).toMatch(/assembling/i);
    });
    const control = getByRole("button", { name: "Assemble Quarter 1" });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.hasAttribute("disabled")).toBe(false);

    // Once the job transitions to ready, the live region must announce
    // that the download is available (the auto-download itself is silent
    // to a screen-reader user otherwise).
    await waitFor(() => {
      expect(mockedSaveAs).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(getByRole("status").textContent).toMatch(/ready|available|downloaded/i);
    });
  });

  it("moves focus to the failure message and offers a working retry control when the job fails (US4, RED)", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValueOnce({
      data: { jobId: "job-1", status: "failed", reason: "missing constituent: Luke Q1 L6" },
    });

    const { getByText } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );

    fireEvent.click(getByText("Assemble Quarter 1"));

    await waitFor(() => {
      expect(getByText(/missing constituent: Luke Q1 L6/)).toBeTruthy();
    });

    // The failure reason must be reliably discoverable without a visual
    // scan (spec: "on transition to failed, move focus to (or otherwise
    // reliably announce) the error message"): focus moves to the message
    // once the job transitions to failed.
    await waitFor(() => {
      const message = getByText(/missing constituent: Luke Q1 L6/);
      expect(document.activeElement).toBe(message);
    });

    // Retry re-triggers assembly via the normal start action (a fresh
    // POST to the same endpoint) — no special client logic beyond that.
    mockedAxios.post.mockResolvedValueOnce({ data: { jobId: "job-2", status: "queued" } });
    fireEvent.click(getByText("Assemble Quarter 1"));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  it("downloads via file-saver once the job is ready", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { jobId: "job-1", status: "ready" } });
    mockedAxios.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

    const { getByText } = render(
      <AssembleQuarterButton
        language={language}
        book="Luke"
        series={1}
        mode="bilingual"
        text="Assemble Quarter 1"
      />
    );

    fireEvent.click(getByText("Assemble Quarter 1"));

    await waitFor(() => {
      expect(mockedSaveAs).toHaveBeenCalled();
    });
  });
});
