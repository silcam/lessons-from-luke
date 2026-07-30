// Break networkSlice → appState → networkSlice circular dep
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

jest.mock("axios");
jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

import React from "react";
import { fireEvent, act, waitFor } from "@testing-library/react";
import Axios from "axios";
import {
  renderWithProviders,
  sampleLanguage,
  defaultSyncState,
  mockPost,
} from "../../common/testHelpers";
import LanguageView from "./LanguageView";

const mockedAxios = Axios as jest.Mocked<typeof Axios>;

beforeEach(() => {
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
});

const lessons = [
  { lessonId: 1, book: "Luke" as const, series: 1, lesson: 1, version: 1, lessonStrings: [] },
  { lessonId: 2, book: "Luke" as const, series: 1, lesson: 2, version: 1, lessonStrings: [] },
  { lessonId: 3, book: "Luke" as const, series: 2, lesson: 1, version: 1, lessonStrings: [] },
];

const language = {
  ...sampleLanguage,
  progress: [
    { lessonId: 1, progress: 50 },
    { lessonId: 2, progress: 50 },
    { lessonId: 3, progress: 50 },
  ],
};

function renderLanguageView() {
  return renderWithProviders(<LanguageView language={language} done={() => {}} />, {
    syncState: defaultSyncState,
    languages: { languages: [], adminLanguages: [] },
    currentUser: { user: null, locale: "en", loaded: false },
    lessons,
  });
}

describe("LanguageView — assemble quarter control cluster (US1)", () => {
  it("renders one Assemble Quarter row per unique quarter (book/series), not per lesson", () => {
    const { getAllByText } = renderLanguageView();

    // Two lessons share Luke series 1, one lesson is Luke series 2 — expect
    // exactly two quarter rows, not three (one per lesson) or one.
    expect(
      getAllByText((_content, element) =>
        (element?.textContent ?? "").startsWith("Assemble Quarter")
      )
    ).toHaveLength(2);
  });

  it("leaves the existing per-lesson download controls unaffected", () => {
    const { getAllByText } = renderLanguageView();

    // Existing per-lesson GetDocumentButton controls (one per lesson row)
    // plus the per-quarter Bilingual/Single-Language assemble controls
    // (US2) added below (one pair per quarter row).
    expect(getAllByText("Bilingual")).toHaveLength(3 + 2);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 2);
  });
});

describe("LanguageView — Bilingual | Single-Language assemble actions (US2)", () => {
  it("offers both a Bilingual and a Single-Language assemble action per quarter", () => {
    const { getAllByText } = renderLanguageView();

    // Two distinct quarters (Luke series 1 and Luke series 2) each get one
    // Bilingual and one Single-Language assemble control.
    expect(getAllByText("Bilingual")).toHaveLength(3 + 2);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 2);
  });

  it("triggers assembleQuarter with mode=bilingual when the Bilingual assemble action is clicked", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { getAllByText } = renderLanguageView();

    fireEvent.click(getAllByText("Bilingual")[0]);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/languages/42/quarters/Luke/1/assembly", {
        mode: "bilingual",
      });
    });
  });

  it("triggers assembleQuarter with mode=single-language when the Single-Language assemble action is clicked", async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: "job-1", status: "queued" } });

    const { getAllByText } = renderLanguageView();

    fireEvent.click(getAllByText("Single-Language")[0]);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/languages/42/quarters/Luke/1/assembly", {
        mode: "single-language",
      });
    });
  });
});

describe("LanguageView — cover rows in the download table (US15)", () => {
  const coverLessons = [
    ...lessons,
    { lessonId: 97, book: "Luke" as const, series: 1, lesson: 97, version: 1, lessonStrings: [] },
  ];

  const coverLanguage = {
    ...sampleLanguage,
    progress: [
      { lessonId: 1, progress: 50 },
      { lessonId: 2, progress: 50 },
      { lessonId: 3, progress: 50 },
      { lessonId: 97, progress: 50 },
    ],
  };

  function renderWithCover() {
    return renderWithProviders(<LanguageView language={coverLanguage} done={() => {}} />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false },
      lessons: coverLessons,
    });
  }

  it("renders a 'Luke 1-Cover (A4)' row for lesson 97 with a single Cover download button", () => {
    const { getAllByText } = renderWithCover();

    // The cover row is labelled via lessonName, same as ordinary lesson rows.
    // There are two occurrences: the row label cell and the download button.
    expect(getAllByText("Luke 1-Cover (A4)")).toHaveLength(2);

    const coverRow = getAllByText("Luke 1-Cover (A4)")[0].closest("tr");
    expect(coverRow).not.toBeNull();

    // Ordinary lesson rows (3) still each get a Bilingual/Single-Language
    // download pair, on top of the 2 per-quarter assemble control pairs from
    // US1/US2. The cover row does not add to these counts — it exposes a
    // single Cover-labeled button instead.
    expect(getAllByText("Bilingual")).toHaveLength(3 + 2);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 2);

    // The cover row itself must carry the single Cover download button, not
    // separate Bilingual/Single-Language links.
    expect(coverRow?.textContent).toContain("Luke 1-Cover (A4)");
    expect(coverRow?.textContent).not.toContain("Bilingual");
    expect(coverRow?.textContent).not.toContain("Single-Language");
  });

  it("still renders the cover download row when the cover is untranslated (0% progress)", () => {
    const untranslatedCoverLanguage = {
      ...sampleLanguage,
      progress: [
        { lessonId: 1, progress: 50 },
        { lessonId: 2, progress: 50 },
        { lessonId: 3, progress: 50 },
        { lessonId: 97, progress: 0 },
      ],
    };

    const { getAllByText } = renderWithProviders(
      <LanguageView language={untranslatedCoverLanguage} done={() => {}} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: coverLessons,
      }
    );

    // Even at 0% progress, the cover row (and its download button) must
    // still render — progress-based hiding should not apply to covers.
    expect(getAllByText("Luke 1-Cover (A4)")).toHaveLength(2);
  });

  it("exposes the cover download as a single button labeled 'Luke 1-Cover (A4)' that downloads with the majorityLanguageId used by ordinary Bilingual links", async () => {
    mockedAxios.get.mockResolvedValue({ data: new Blob() });

    const { getByRole } = renderWithCover();

    const coverButton = getByRole("button", { name: "Luke 1-Cover (A4)" });
    expect(coverButton).toBeTruthy();

    fireEvent.click(coverButton);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/languages/42/lessons/97/document?majorityLanguageId=42",
        { responseType: "blob" }
      );
    });
  });
});

describe("LanguageView archive flow", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue(null);
  });

  it("shows an Archive button reachable by keyboard", async () => {
    const done = jest.fn();
    const { getByRole } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    const archiveButton = getByRole("button", { name: /archive/i });
    expect(archiveButton.tagName).toBe("BUTTON");
  });

  it("hides the Archive button and names the dependents when other languages use this one as their source", async () => {
    const done = jest.fn();
    const dependentA = { ...sampleLanguage, languageId: 4, name: "Fulfulde", defaultSrcLang: 42 };
    const dependentB = { ...sampleLanguage, languageId: 7, name: "Bambara", defaultSrcLang: 42 };
    const { queryByRole, getByText } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage, dependentA, dependentB] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    expect(queryByRole("button", { name: /^archive$/i })).toBeNull();
    expect(getByText(/Fulfulde, Bambara/)).toBeTruthy();
  });

  it("opens a confirm dialog stating the action cannot be undone when Archive is clicked", async () => {
    const done = jest.fn();
    const { getByRole, getByText } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    const archiveButton = getByRole("button", { name: /archive/i });
    await act(async () => {
      fireEvent.click(archiveButton);
    });

    expect(getByRole("dialog")).toBeTruthy();
    expect(getByText(/cannot be undone/i)).toBeTruthy();
  });

  it("on confirm with an ok archive result, calls props.done()", async () => {
    mockPost.mockResolvedValue({ archived: true, languageId: sampleLanguage.languageId });
    const done = jest.fn();
    const { getByRole } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /archive/i }));
    });
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^archive$/i, hidden: false }));
    });

    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it("on confirm with a blocked archive result, renders dependent names in an assertive alert region instead of closing", async () => {
    mockPost.mockResolvedValue({
      error: "HAS_DEPENDENTS",
      dependents: [
        { languageId: 4, name: "Fulfulde" },
        { languageId: 7, name: "Bambara" },
      ],
    });
    const done = jest.fn();
    const { getByRole, findByRole } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /archive/i }));
    });
    const dialog = getByRole("dialog");
    const confirmButton = dialog.querySelector("button:last-of-type") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    const alert = await findByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.textContent).toMatch(/Fulfulde/);
    expect(alert.textContent).toMatch(/Bambara/);
    expect(done).not.toHaveBeenCalled();
  });

  it("reverts the optimistic source-language change and shows a generic alert when the re-point push is rejected", async () => {
    mockPost.mockResolvedValue(null);
    const done = jest.fn();
    const englishLang = { ...sampleLanguage, languageId: 1, name: "English", defaultSrcLang: 1 };
    const frenchLang = { ...sampleLanguage, languageId: 2, name: "French" };
    const testLanguage = { ...sampleLanguage, languageId: 42, defaultSrcLang: 1 };
    const { getByRole, findByRole } = renderWithProviders(
      <LanguageView language={testLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [englishLang, frenchLang] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    const select = getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1");

    await act(async () => {
      fireEvent.change(select, { target: { value: "2" } });
    });

    const alert = await findByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.textContent).toMatch(/no longer available/i);

    expect(select.value).toBe("1");
  });

  it("shows an assertive alert and does not close when the archive push returns a falsy result", async () => {
    mockPost.mockResolvedValue(null);
    const done = jest.fn();
    const { getByRole, findByRole } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /archive/i }));
    });
    const dialog = getByRole("dialog");
    const confirmButton = dialog.querySelector("button:last-of-type") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    const alert = await findByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(done).not.toHaveBeenCalled();
  });
});
