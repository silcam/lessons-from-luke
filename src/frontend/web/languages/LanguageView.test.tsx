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

  it("renders a 'Luke 1-Cover (A4)' row for lesson 97 with a Bilingual | Single-Language download pair", () => {
    const { getAllByText } = renderWithCover();

    // The cover row is labelled via lessonName, same as ordinary lesson rows.
    // Exactly one occurrence: the row label cell (downloads are the same
    // Bilingual/Single-Language pair ordinary lesson rows get).
    expect(getAllByText("Luke 1-Cover (A4)")).toHaveLength(1);

    const coverRow = getAllByText("Luke 1-Cover (A4)")[0].closest("tr");
    expect(coverRow).not.toBeNull();

    // Ordinary lesson rows (3) plus the cover row each get a
    // Bilingual/Single-Language download pair, on top of the 2 per-quarter
    // assemble control pairs from US1/US2 and the cover download pair in
    // the Luke 1 quarter row.
    expect(getAllByText("Bilingual")).toHaveLength(3 + 1 + 2 + 1);
    expect(getAllByText("Single-Language")).toHaveLength(3 + 1 + 2 + 1);

    // The cover row itself carries both download links.
    expect(coverRow?.textContent).toContain("Luke 1-Cover (A4)");
    expect(coverRow?.textContent).toContain("Bilingual");
    expect(coverRow?.textContent).toContain("Single-Language");
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

    // Even at 0% progress, the cover row (and its download links) must
    // still render — progress-based hiding should not apply to covers.
    expect(getAllByText("Luke 1-Cover (A4)")).toHaveLength(1);
  });

  it("downloads the cover with the same majorityLanguageId ordinary Bilingual links use when its Bilingual link is clicked", async () => {
    mockedAxios.get.mockResolvedValue({ data: new Blob() });

    const { getAllByText } = renderWithCover();

    const coverRow = getAllByText("Luke 1-Cover (A4)")[0].closest("tr")!;
    const bilingualButton = Array.from(coverRow.querySelectorAll("button")).find(
      (button) => button.textContent === "Bilingual"
    )!;
    expect(bilingualButton).toBeTruthy();

    fireEvent.click(bilingualButton);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/languages/42/lessons/97/document?majorityLanguageId=42",
        { responseType: "blob" }
      );
    });
  });

  it("downloads the cover with majorityLanguageId=0 when its Single-Language link is clicked", async () => {
    mockedAxios.get.mockResolvedValue({ data: new Blob() });

    const { getAllByText } = renderWithCover();

    const coverRow = getAllByText("Luke 1-Cover (A4)")[0].closest("tr")!;
    const monoButton = Array.from(coverRow.querySelectorAll("button")).find(
      (button) => button.textContent === "Single-Language"
    )!;
    expect(monoButton).toBeTruthy();

    fireEvent.click(monoButton);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/languages/42/lessons/97/document?majorityLanguageId=0",
        { responseType: "blob" }
      );
    });
  });
});

describe("LanguageView — cover downloads in the quarter assembly table", () => {
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

  function renderWithCover(lessonsFixture = coverLessons) {
    return renderWithProviders(<LanguageView language={coverLanguage} done={() => {}} />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false },
      lessons: lessonsFixture,
    });
  }

  function quarterRow(getAllByText: ReturnType<typeof renderWithCover>["getAllByText"]) {
    return getAllByText((_content, element) =>
      (element?.textContent ?? "").startsWith("Assemble Quarter")
    ).map((el) => el.closest("tr")!);
  }

  it("offers a Cover (A4) Bilingual | Single-Language download pair in the quarter row", () => {
    const { getAllByText } = renderWithCover();

    const luke1Row = quarterRow(getAllByText)[0];
    expect(luke1Row.textContent).toContain("Cover (A4)");
    expect(luke1Row.textContent).toContain("Bilingual");
    expect(luke1Row.textContent).toContain("Single-Language");

    // 2 assemble buttons + 2 cover download buttons in the Luke 1 row.
    const buttons = Array.from(luke1Row.querySelectorAll("button"));
    expect(buttons.filter((b) => b.textContent === "Bilingual")).toHaveLength(2);
    expect(buttons.filter((b) => b.textContent === "Single-Language")).toHaveLength(2);
  });

  it("renders no cover downloads in a quarter row whose quarter has no cover lessons", () => {
    const { getAllByText } = renderWithCover();

    // Luke series 2 has no cover lesson — its quarter row stays cover-free.
    const luke2Row = quarterRow(getAllByText)[1];
    expect(luke2Row.textContent).not.toContain("Cover");
  });

  it("downloads the cover with the bilingual majorityLanguageId when the quarter-row Bilingual cover link is clicked", async () => {
    mockedAxios.get.mockResolvedValue({ data: new Blob() });

    const { getAllByText } = renderWithCover();

    const luke1Row = quarterRow(getAllByText)[0];
    // The first two buttons are the assemble pair; the cover pair follows.
    const bilingualButtons = Array.from(luke1Row.querySelectorAll("button")).filter(
      (button) => button.textContent === "Bilingual"
    );
    fireEvent.click(bilingualButtons[1]);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/languages/42/lessons/97/document?majorityLanguageId=42",
        { responseType: "blob" }
      );
    });
  });

  it("downloads the cover with majorityLanguageId=0 when the quarter-row Single-Language cover link is clicked", async () => {
    mockedAxios.get.mockResolvedValue({ data: new Blob() });

    const { getAllByText } = renderWithCover();

    const luke1Row = quarterRow(getAllByText)[0];
    const monoButtons = Array.from(luke1Row.querySelectorAll("button")).filter(
      (button) => button.textContent === "Single-Language"
    );
    fireEvent.click(monoButtons[1]);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/languages/42/lessons/97/document?majorityLanguageId=0",
        { responseType: "blob" }
      );
    });
  });

  it("lists Cover (A4) before Cover (A3) when the quarter has both covers", () => {
    const bothCovers = [
      ...coverLessons,
      { lessonId: 98, book: "Luke" as const, series: 1, lesson: 98, version: 1, lessonStrings: [] },
    ];

    const { getAllByText } = renderWithCover(bothCovers);

    const luke1Row = quarterRow(getAllByText)[0];
    const text = luke1Row.textContent ?? "";
    expect(text).toContain("Cover (A4)");
    expect(text).toContain("Cover (A3)");
    expect(text.indexOf("Cover (A4)")).toBeLessThan(text.indexOf("Cover (A3)"));
  });

  it("keeps the lessons-table cover row (quarter-row covers are additive)", () => {
    const { getAllByText } = renderWithCover();

    // The full lessonName label appears only in the lessons table; the
    // quarter row uses the short "Cover (A4)" label.
    expect(getAllByText("Luke 1-Cover (A4)")).toHaveLength(1);
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

describe("LanguageView rename flow", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue(null);
  });

  it("shows an Edit link that reveals a form with the name pre-filled from props.language.name, plus Save and Cancel controls", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText } = renderWithProviders(
      <LanguageView language={sampleLanguage} done={done} />,
      {
        syncState: defaultSyncState,
        languages: { languages: [], adminLanguages: [sampleLanguage] },
        currentUser: { user: null, locale: "en", loaded: false },
        lessons: [],
      }
    );
    await act(async () => {});

    const editLink = getByRole("button", { name: /^edit name$/i });
    await act(async () => {
      fireEvent.click(editLink);
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    expect(nameInput.value).toBe(sampleLanguage.name);
    expect(getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(getByRole("button", { name: /^cancel$/i })).toBeTruthy();
  });

  it("submits the renamed value exactly once via the Save button click and updates the heading", async () => {
    mockPost.mockResolvedValue({ ...sampleLanguage, name: "New Name" });
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Name" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText("New Name")).toBeTruthy());
  });

  it("submits the renamed value exactly once when Enter is pressed in the input and updates the heading", async () => {
    mockPost.mockResolvedValue({ ...sampleLanguage, name: "Enter Name" });
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Enter Name" } });

    await act(async () => {
      fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText("Enter Name")).toBeTruthy());
  });

  it("clicking Cancel restores the original display and posts zero requests, even if the draft was changed", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText, queryByLabelText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Changed But Not Saved" } });

    const cancelButton = getByRole("button", { name: /^cancel$/i });
    expect(cancelButton.getAttribute("type")).toBe("button");

    await act(async () => {
      fireEvent.click(cancelButton);
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(queryByLabelText("Language Name")).toBeNull();
    expect(getByText(sampleLanguage.name)).toBeTruthy();
  });

  it("does not focus the Edit button on initial render", async () => {
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

    const editLink = getByRole("button", { name: /^edit name$/i });
    expect(document.activeElement).not.toBe(editLink);
  });

  it("moves focus to the name TextInput when Edit is activated", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    expect(document.activeElement).toBe(nameInput);
  });

  it("pressing Escape in the input cancels, restoring the original display and posting zero requests", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText, queryByLabelText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Changed But Not Saved" } });

    await act(async () => {
      fireEvent.keyDown(nameInput, { key: "Escape", code: "Escape" });
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(queryByLabelText("Language Name")).toBeNull();
    expect(getByText(sampleLanguage.name)).toBeTruthy();
  });

  it("ignores Enter and Escape in the input while a save is in flight", async () => {
    let resolvePush: (value: unknown) => void = () => {};
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePush = resolve;
        })
    );
    const done = jest.fn();
    const { getByRole, getByLabelText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "In Flight Name" } });

    await act(async () => {
      fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    // While saving: a second Enter submit should not trigger another push,
    // and Escape should not cancel back to the display view.
    await act(async () => {
      fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    });
    await act(async () => {
      fireEvent.keyDown(nameInput, { key: "Escape", code: "Escape" });
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(getByLabelText("Language Name")).toBeTruthy();

    await act(async () => {
      resolvePush({ ...sampleLanguage, name: "In Flight Name" });
    });
  });

  it("returns focus to the Edit button after Cancel", async () => {
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^cancel$/i }));
    });

    const editLink = getByRole("button", { name: /^edit name$/i });
    expect(document.activeElement).toBe(editLink);
  });

  it("mounts the alert region empty alongside the editor, never disables Save for an empty draft, and on a 422 shows the required message while keeping the editor open with the empty value", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    // The alert region must already be mounted, but empty, before any submission.
    const alertBeforeSubmit = getByRole("alert");
    expect(alertBeforeSubmit.textContent).toBe("");

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });

    const saveButton = getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422, body: { reason: "empty" } });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/required/i);

    // The editor stays open, retaining the (empty) typed value.
    expect(getByLabelText("Language Name")).toBeTruthy();
    expect((getByLabelText("Language Name") as HTMLInputElement).value).toBe("");
  });

  it("shows the too-long message on a 422 when the locally-known draft length exceeds 100 characters", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const tooLongValue = "a".repeat(101);
    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: tooLongValue } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422, body: { reason: "tooLong" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/100 characters/i);

    expect((getByLabelText("Language Name") as HTMLInputElement).value).toBe(tooLongValue);
  });

  it("shows the required message (not too-long) on a 422 for a draft of 101 spaces, matching the server's trimmed check", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const spacesValue = " ".repeat(101);
    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: spacesValue } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422, body: { reason: "empty" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/required/i);
  });

  it("shows the too-long message driven by the server's reason, even when the locally-known draft looks valid", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    // A locally-valid-looking draft: the client's own classifier would say
    // this name is fine, so a fallback that re-derives the reason locally
    // would show the wrong (or a misleadingly generic) message. The server
    // is the source of truth here.
    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Valid Looking Name" } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422, body: { reason: "tooLong" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/100 characters/i);
  });

  it("shows a generic error message on a 422 with no recognized reason in the response body, not a specific fallback guess", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Some Name" } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422 });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).not.toMatch(/required/i);
    expect(alert.textContent).not.toMatch(/100 characters/i);
    expect(alert.textContent).not.toMatch(/invalid characters/i);
    expect(alert.textContent.length).toBeGreaterThan(0);
  });

  it("shows a distinct invalid-characters message (not required or too-long) on a 422 for a name containing a path separator", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const invalidValue = "foo/bar";
    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: invalidValue } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 422, body: { reason: "invalid" } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).not.toMatch(/required/i);
    expect(alert.textContent).not.toMatch(/100 characters/i);
    expect(alert.textContent).toMatch(/invalid/i);
  });

  it("shows the trimmed value in the heading, and re-seeds the editor from it, after saving a name typed with leading/trailing whitespace", async () => {
    mockPost.mockResolvedValue({ ...sampleLanguage, name: "New Name" });
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "  New Name  " } });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText("New Name")).toBeTruthy());

    // Re-opening the editor after a successful trimmed rename must seed the
    // draft from the persisted (trimmed) value, not the stale props.language.name.
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });
    expect((getByLabelText("Language Name") as HTMLInputElement).value).toBe("New Name");
  });

  it("shows the duplicate-name message on a 409, keeps the editor open with the typed value, and leaves the heading unchanged", async () => {
    const done = jest.fn();
    const { getByRole, getByLabelText, getByText, findByRole } = renderWithProviders(
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
      fireEvent.click(getByRole("button", { name: /^edit name$/i }));
    });

    const nameInput = getByLabelText("Language Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Duplicate Name" } });

    mockPost.mockRejectedValueOnce({ type: "HTTP", status: 409 });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^save$/i }));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/already exists/i);

    // The editor stays open, retaining the typed value; no rename applied.
    expect((getByLabelText("Language Name") as HTMLInputElement).value).toBe("Duplicate Name");
    expect(getByText(sampleLanguage.name)).toBeTruthy();
  });
});
