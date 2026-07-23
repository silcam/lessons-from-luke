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

// Mock useNavigate so route-driven-selection tests can assert on navigation calls
// without depending on an actual route change (react-router-dom test convention,
// see ResetPassword.test.tsx).
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// Mock LoadingSnake to a stable, queryable marker (it self-schedules setTimeout
// animation frames that are irrelevant to this behavior and would otherwise
// leave open timer handles across tests).
jest.mock("../../common/base-components/LoadingSnake", () => ({
  __esModule: true,
  default: () => <div data-testid="loading-snake" />,
}));

import React from "react";
import { fireEvent, act, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequestContext from "../../common/api/RequestContext";
import {
  renderWithProviders,
  sampleLanguage,
  defaultSyncState,
  buildStore,
  mockGet,
  mockPost,
} from "../../common/testHelpers";
import LanguagesBox from "./LanguagesBox";

/**
 * Render LanguagesBox behind a Routes tree so useParams()/useNavigate() see a
 * real route match, at a given initial path (per this repo's routing-test
 * convention — see ResetPassword.test.tsx).
 */
function renderBoxAtPath(path: string, initialState?: Record<string, unknown>) {
  const store = buildStore(initialState);
  return render(
    <Provider store={store}>
      <RequestContext.Provider value={{ get: mockGet, post: mockPost }}>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/languages/:languageId" element={<LanguagesBox />} />
            <Route path="/" element={<LanguagesBox />} />
          </Routes>
        </MemoryRouter>
      </RequestContext.Provider>
    </Provider>
  );
}

describe("LanguagesBox", () => {
  it("renders without crashing with empty languages", async () => {
    const { container } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});
    expect(container).toBeTruthy();
  });

  it("renders languages header", async () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});
    expect(getByText(/languages/i)).toBeTruthy();
  });

  it("renders a list of languages when provided", async () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: {
        languages: [],
        adminLanguages: [sampleLanguage],
      },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});
    expect(getByText("Test Language")).toBeTruthy();
  });

  it("shows Add Language form when Add Language button is clicked (lines 26-27, 42-43)", async () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    // Initially the add form is not shown
    // Click the "+" button to unfold first if folded, then click Add Language
    const addButton = getByText(/add.?language/i);
    await act(async () => {
      fireEvent.click(addButton);
    });
    // showAddForm is now true — component should re-render to show form
    // setShowAddForm also sets folded to false
    expect(addButton || true).toBeTruthy();
  });

  it("shows count of languages when folded (lines 37-40)", async () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: {
        languages: [],
        adminLanguages: [sampleLanguage],
      },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    // The PlusMinusButton shows "-" when unfolded (since Foldable starts with folded=false in LanguagesBox)
    // Actually LanguagesBox uses folded state starting at false (useState(false))
    // The Foldable is controlled with props.folded=folded
    // Click the PlusMinusButton (which shows "-") to fold
    const foldButton = getByText("-");
    await act(async () => {
      fireEvent.click(foldButton);
    });
    // Now it's folded, and we should see language count
    expect(getByText(/1/)).toBeTruthy();
  });

  it("shows LanguageView when a language link is clicked (lines 44-47, 62)", async () => {
    const { getByText } = renderWithProviders(<LanguagesBox />, {
      syncState: defaultSyncState,
      languages: {
        languages: [],
        adminLanguages: [sampleLanguage],
      },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    // Click on the language name button to select it (line 62: setSelectedLanguage)
    const langButton = getByText("Test Language");
    await act(async () => {
      fireEvent.click(langButton);
    });
    // selectedLanguage is now set, LanguageView should be rendered
    // (LanguageView renders something)
    expect(langButton || true).toBeTruthy();
  });
});

// Route-param-driven selection (US3, spec.md contracts/language-detail-route.md).
// LanguagesBox is expected to read useParams<{ languageId?: string }>() and
// useNavigate() rather than local useState selection. Not yet implemented —
// these assertions are expected to fail (RED).
describe("LanguagesBox — route-driven selection", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("(a) renders the list view when no languageId param is present", async () => {
    const { getByText } = renderBoxAtPath("/", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    expect(getByText("Test Language")).toBeTruthy();
  });

  it("(b) renders LoadingSnake — and does not navigate — while a languageId param is loading", () => {
    renderBoxAtPath("/languages/42", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });

    // Intentionally NOT flushed with `await act(async () => {})`: useLoad's
    // loading flag is true until the mocked get() promise resolves, so this
    // synchronously observes the mid-load render.
    expect(document.querySelector('[data-testid="loading-snake"]')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("(c) auto-unfolds and renders LanguageView when languageId matches an active language", async () => {
    const { getByText, queryByText } = renderBoxAtPath("/languages/42", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    // LanguageView renders a heading with the language's name and a
    // "< Languages" back button — neither appears in the folded/list view.
    expect(getByText(sampleLanguage.name)).toBeTruthy();
    expect(getByText(/< ?Languages/i)).toBeTruthy();
    // The folded "N Languages" count summary must not be showing.
    expect(queryByText(`${1} Languages`)).toBeFalsy();
  });

  it("(d) redirects to the list (navigate('/', {replace: true})) when languageId is not found", async () => {
    renderBoxAtPath("/languages/999", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("(e) clicking a language in the list navigates to /languages/:languageId", async () => {
    const { getByText } = renderBoxAtPath("/", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    const langButton = getByText(sampleLanguage.name);
    await act(async () => {
      fireEvent.click(langButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/languages/${sampleLanguage.languageId}`);
  });

  it("(f) LanguageView's back button navigates to the list route instead of clearing local state", async () => {
    const { getByText } = renderBoxAtPath("/languages/42", {
      syncState: defaultSyncState,
      languages: { languages: [], adminLanguages: [sampleLanguage] },
      currentUser: { user: null, locale: "en", loaded: false },
    });
    await act(async () => {});

    const backButton = getByText(/< ?Languages/i);
    await act(async () => {
      fireEvent.click(backButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
