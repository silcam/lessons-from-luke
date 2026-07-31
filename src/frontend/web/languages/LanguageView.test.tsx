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

import React from "react";
import { fireEvent, act, waitFor } from "@testing-library/react";
import {
  renderWithProviders,
  sampleLanguage,
  defaultSyncState,
  mockPost,
} from "../../common/testHelpers";
import LanguageView from "./LanguageView";

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

    const editLink = getByRole("button", { name: /^edit$/i });
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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

    const editLink = getByRole("button", { name: /^edit$/i });
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
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
      fireEvent.click(getByRole("button", { name: /^edit$/i }));
    });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^cancel$/i }));
    });

    const editLink = getByRole("button", { name: /^edit$/i });
    expect(document.activeElement).toBe(editLink);
  });
});
