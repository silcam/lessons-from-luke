// Break networkSlice → appState → networkSlice circular dep
jest.mock("../state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state,
    actions: {}
  },
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn()
  }),
  networkConnectionLostAction: jest.fn()
}));

import React from "react";
import { renderWithProviders, sampleLanguage, sampleTString, sampleLessonString, defaultSyncState } from "../testHelpers";
import TranslateRow from "./TranslateRow";
import { LessonTString } from "./useLessonTStrings";

describe("TranslateRow", () => {
  it("renders source text", () => {
    const srcStr = { ...sampleTString, languageId: 1, text: "English source text" };
    const lessonTString: LessonTString = {
      lStr: sampleLessonString,
      tStrs: [srcStr]
    };

    const { getByText } = renderWithProviders(
      <TranslateRow
        lessonTString={lessonTString}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );

    expect(getByText("English source text")).toBeTruthy();
  });

  it("renders TStringInput when motherTongue is true", () => {
    const srcStr = { ...sampleTString, languageId: 1, text: "Source text" };
    const lessonTString: LessonTString = {
      lStr: { ...sampleLessonString, motherTongue: true },
      tStrs: [srcStr]
    };

    const { container } = renderWithProviders(
      <TranslateRow
        lessonTString={lessonTString}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );

    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("does not render TStringInput when motherTongue is false", () => {
    const srcStr = { ...sampleTString, languageId: 1, text: "Source text" };
    const lessonTString: LessonTString = {
      lStr: { ...sampleLessonString, motherTongue: false },
      tStrs: [srcStr]
    };

    const { container } = renderWithProviders(
      <TranslateRow
        lessonTString={lessonTString}
        language={sampleLanguage}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />,
      { syncState: defaultSyncState, network: { connected: true } }
    );

    expect(container.querySelector("textarea")).toBeNull();
  });
});
