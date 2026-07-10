// Break networkSlice → appState → networkSlice circular dep (same pattern as
// LessonsBox.test.tsx).
jest.mock("../../common/state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state,
    actions: {},
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn(),
  }),
  networkConnectionLostAction: jest.fn(),
}));

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../../common/testHelpers";
import UploadLessonForm, { metaFromFilename } from "./UploadLessonForm";
import { COVER_A4_LESSON, COVER_A3_LESSON } from "../../../core/models/Lesson";

function preloadedState() {
  return {
    syncState: defaultSyncState,
    lessons: [],
    currentUser: { user: null, locale: "en" as const, loaded: false },
  };
}

/** Renders the form and simulates dropping a plain-lesson .odt file, which
 * puts the form into its "file selected" state where the Book/Series/TOC/
 * Lesson/Cover controls render. */
async function renderWithFile() {
  const utils = renderWithProviders(<UploadLessonForm done={() => {}} />, preloadedState());
  const file = new File(["content"], "English-Luke-Q1-L06.odt", {
    type: "application/vnd.oasis.opendocument.text",
  });
  const input = utils.container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(utils.queryByText("Book")).not.toBeNull();
  });
  return utils;
}

describe("metaFromFilename", () => {
  describe("cover-format detection", () => {
    it.each([
      ["English-Luke-T1-Cover-A4.odt", "Luke", 1, COVER_A4_LESSON],
      ["English-Luke-T2-Cover-A4.odt", "Luke", 2, COVER_A4_LESSON],
      ["English-Luke-T3-Cover-A4.odt", "Luke", 3, COVER_A4_LESSON],
      ["English-Luke-T4-Cover-A4.odt", "Luke", 4, COVER_A4_LESSON],
      ["English-Luke-Q1-Cover-A3.odt", "Luke", 1, COVER_A3_LESSON],
      ["English-Luke-Q2-Cover-A3.odt", "Luke", 2, COVER_A3_LESSON],
      ["English-Luke-Q3-Cover-A3.odt", "Luke", 3, COVER_A3_LESSON],
      ["English-Luke-Q4-Cover-A3.odt", "Luke", 4, COVER_A3_LESSON],
    ])("maps %s to book %s, series %i, lesson %i", (filename, book, series, lesson) => {
      const meta = metaFromFilename(filename);
      expect(meta.book).toEqual(book);
      expect(meta.series).toEqual(series);
      expect(meta.lesson).toEqual(lesson);
    });

    it("detects Cover-A4 case-insensitively", () => {
      const meta = metaFromFilename("English-Luke-Q1-cover-a4.odt");
      expect(meta.lesson).toEqual(COVER_A4_LESSON);
    });

    it("detects Cover-A3 case-insensitively", () => {
      const meta = metaFromFilename("English-Luke-T1-COVER-A3.odt");
      expect(meta.lesson).toEqual(COVER_A3_LESSON);
    });

    it("does not treat an ordinary lesson filename as a cover", () => {
      const meta = metaFromFilename("English-Luke-Q1-L06.odt");
      expect(meta.book).toEqual("Luke");
      expect(meta.series).toEqual(1);
      expect(meta.lesson).toEqual(6);
    });
  });
});

/**
 * RED tests for the Cover/format manual-override control (US13, FR-004).
 *
 * The control does not exist in UploadLessonForm.tsx yet, so these fail
 * today (getByLabelText/queryByLabelText throw because no such labelled
 * control is rendered) — not on a compile/import error. GREEN task:
 * lessons-from-luke-l96d.5.6.9.
 */
describe("UploadLessonForm Cover override control", () => {
  it("renders a labelled, keyboard-operable Cover override control", async () => {
    const { getByLabelText } = await renderWithFile();

    const coverControl = getByLabelText(/^cover$/i) as HTMLInputElement;
    expect(coverControl.type).toEqual("checkbox");
    // Keyboard-operable: a native checkbox input is focusable/operable by
    // default as long as it isn't disabled.
    expect(coverControl.disabled).toBe(false);
  });

  it("shows an A4/A3 format selector once Cover is selected", async () => {
    const { getByLabelText, queryByLabelText } = await renderWithFile();

    expect(queryByLabelText(/format/i)).toBeNull();

    fireEvent.click(getByLabelText(/^cover$/i));

    const formatSelect = getByLabelText(/format/i) as HTMLSelectElement;
    const optionValues = Array.from(formatSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(expect.arrayContaining(["A4", "A3"]));
  });

  it("labels the format selector 'Cover format' (US13 acceptance spec)", async () => {
    const { getByLabelText } = await renderWithFile();

    fireEvent.click(getByLabelText(/^cover$/i));

    expect(() => getByLabelText(/^cover format$/i)).not.toThrow();
  });

  it("deselects/disables the TOC checkbox and hides the lesson-number picker when Cover is selected", async () => {
    const { getByLabelText, queryByText } = await renderWithFile();

    // Sanity: before selecting Cover, the TOC checkbox is unchecked/enabled
    // and the Lesson picker is present.
    const tocBefore = getByLabelText(/table of contents/i) as HTMLInputElement;
    expect(tocBefore.checked).toBe(false);
    expect(tocBefore.disabled).toBe(false);
    expect(queryByText("Lesson")).not.toBeNull();

    fireEvent.click(getByLabelText(/^cover$/i));

    const tocAfter = getByLabelText(/table of contents/i) as HTMLInputElement;
    expect(tocAfter.checked).toBe(false);
    expect(tocAfter.disabled).toBe(true);
    expect(queryByText("Lesson")).toBeNull();
  });

  it("deselects/disables the Cover control (and hides its format selector) when TOC is selected", async () => {
    const { getByLabelText, queryByLabelText } = await renderWithFile();

    fireEvent.click(getByLabelText(/table of contents/i));

    const coverAfter = getByLabelText(/^cover$/i) as HTMLInputElement;
    expect(coverAfter.checked).toBe(false);
    expect(coverAfter.disabled).toBe(true);
    expect(queryByLabelText(/format/i)).toBeNull();
  });
});
