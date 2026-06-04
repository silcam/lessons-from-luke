import React from "react";
import { render } from "@testing-library/react";
import { renderWithProviders, defaultSyncState } from "../testHelpers";
import HeaderMessage from "./HeaderMessage";

describe("HeaderMessage", () => {
  it("renders nothing when hdrMessage is 'none'", () => {
    const { container } = renderWithProviders(
      <HeaderMessage hdrMessage="none" />,
      { syncState: defaultSyncState }
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 'unsavedChanges' message", () => {
    const { getByText } = renderWithProviders(
      <HeaderMessage hdrMessage="unsavedChanges" />,
      { syncState: defaultSyncState }
    );
    // The component renders a heading with the translated text for Unsaved_changes
    expect(getByText(/unsaved/i)).toBeTruthy();
  });

  it("renders 'changesSaved' message when not uploading", () => {
    const { getByText } = renderWithProviders(
      <HeaderMessage hdrMessage="changesSaved" />,
      {
        syncState: {
          ...defaultSyncState,
          connected: true,
          upSync: { dirtyTStrings: [] }
        }
      }
    );
    expect(getByText(/saved/i)).toBeTruthy();
  });
});
