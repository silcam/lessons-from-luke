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
});
