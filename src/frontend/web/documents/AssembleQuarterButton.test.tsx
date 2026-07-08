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
const mockedSaveAs = saveAs as jest.Mock;

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
